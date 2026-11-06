# Per-event participant types (decided 2026-11-06)

Problem: participant types belong to the tenant, and every event used all of
them. Setup created a workflow and a badge template for every type, every type
dropdown listed the whole catalogue, and the portal offered every type, even
ones the event had no workflow for. Registering as those failed on submit with
"No workflow configured".

## Decision

An explicit list per event: `EventParticipantType (eventId, participantTypeId)`.

- "Has a workflow" was rejected as the definition. It can't tell "not set up
  yet" from "this event doesn't use it", which the planned "type isn't set up"
  banner needs.
- "Any" is never listed. It is a quota bucket, so quota pickers (restrictions,
  invitation quotas, invitations) offer Any plus the listed types.
- The setup wizard's first step picks the list: checkboxes prefilled from the
  tenant's latest other event that has one, else all types. The later steps only
  show the listed types, and setup refuses a quota for a type the event doesn't
  use rather than silently dropping it.
- Badge template, restriction quota, invitation quota and invitation forms only
  offer listed types, and their actions reject any other type.
- The single workflow form offers every tenant type except "Any", and saving a
  workflow puts its type on the event's list (`scripts/manage-workflow.ts` does
  the same). That keeps the manual way of adding a type to a running event
  working: create the type, then its workflow, then its badge and quotas.
  Bulk-create stays limited to the list.
- Portal: registration, and changing type on an existing request, only offer
  types that are listed **and** have a workflow for the event. A listed type
  that isn't set up yet is hidden instead of failing on submit.
- `setup-event` lists every type in the organ profile. Existing events are
  backfilled by `scripts/backfill-event-participant-types.ts` from what each
  event already uses.

## Rollout

1. `npx prisma db push` from the admin repo (adds one table).
2. `npx tsx scripts/backfill-event-participant-types.ts --confirm`.
3. Deploy the admin, then the portal. Until step 2 runs, the portal offers no
   types for existing events.

## Adding a type after setup

`/admin/events/:eventId/add-type` (the event page's **Add type** button) is a
short wizard for one type: pick it, then workflow, badge template, staff access
and quotas, written in one transaction.

- It offers types that aren't on the list yet, and listed types missing a
  workflow or a badge template. Anything the type already has is kept and its
  step is skipped.
- Staff access only touches the type's own workflow. Each person is prefilled
  with the step they work on most in the event; people with no access to the
  event start with none, so access an admin removed stays removed.
- Quotas are optional, one per existing restriction. "Also add to existing
  invitations" copies each quota to the invitations whose quotas came from that
  restriction (`sourceRestrictionId`), skipping ones that already have it.
- It refuses events that have no list yet (they go to Set up), since the new
  type would become the event's only one.
- A banner on the event page names listed types missing a workflow or a badge
  template, each linking to the wizard for that type.

## Not yet

- Removing a type from an event's list, and editing setup while the event is a
  draft.
