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

## Not yet

- Changing an event's list after setup: adding a type mid-event (banner + short
  wizard) is the next step, editing it while the event is a draft the one after.
