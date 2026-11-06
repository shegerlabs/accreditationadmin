# Event setup wizard (decided 2026-11-06 from a /admin/proto/event-setup prototype)

Problem: setting up an event meant visiting Restrictions, Workflows, Templates,
Emails and Access one by one and recreating the same defaults by hand.

## Decision

A stepped wizard at `/admin/events/:eventId/setup` with a **receipt** panel.

- Steps: Participant types → Restrictions → Workflows → Badge templates → Emails
  → Staff access → Confirm. (Participant types added later, see
  `2026-11-06-event-participant-types.md`.)
- Left: the editor for the current step. Right (sticky): a receipt of everything
  that will be created. Each section shows its summary and a status: _Not
  reviewed_, _Default_ or _Changed_. Changed sections have a **Reset to
  default** button.
- One "Set up event" button on the last step writes everything in one
  transaction.
- Sections the event already has are skipped, never overwritten (restrictions if
  any exist; workflows and badge templates per participant type; emails per
  trigger; access rows are de-duplicated). This still holds for published
  events. Drafts that have been set up are edited instead, see below.
- Invitations are not part of setup: each is an organization's focal point, so
  there is no default list. They are added afterwards and draw on the
  restrictions.

## Editing a draft's setup (added 2026-11-06)

A draft that already has a participant type list opens the same wizard in edit
mode (the event page's button reads **Edit setup**). The wizard loads the saved
setup, and the receipt compares against it: _Changed_ means changed since the
last save, and **Undo changes** goes back to it. Saving writes only the
differences, in one transaction (`app/utils/event-setup-edit.server.ts`).

- Records are changed in place where they can be: restrictions are renamed,
  quotas edited, a badge template is repointed at another design. Replacing a
  workflow deletes it and clones the new template, so changes made on the
  Workflows tab are lost; the wizard says so.
- Unticking a type removes it from the list along with its workflow and badge
  template. Quotas for it have to be removed on the Restrictions step first.
- Staff access: each person shows the step they work on most in the event.
  Changing it replaces their step access in this event; people left alone keep
  theirs and get their step on any workflow the save creates.
- Invitations aren't changed. They keep the quotas they were given.
- Locks, because these deletes cascade: a type with participants, invitations or
  invitation quotas can't be removed; a type with participants keeps its
  workflow; a restriction with invitations can't be removed; a badge template
  with uploaded files can be repointed but not removed. The server checks each
  again inside the transaction.
- The page carries a hash of the saved setup. A save over a setup that changed
  since the page loaded is refused with a "reload" message, as is a first-run
  form submitted after the event was set up elsewhere.
- Published, postponed and other non-draft events keep the fill-in-the-gaps
  behaviour above; use the tabs or **Add type** there.

## Defaults

- Restrictions: the seed's _Member States_ (Closed Session/Any closed 20, Any
  open 0) and _Non Member States_ (Observer closed 1, Driver open 1).
- Workflows: the organ profile's template per participant type
  (`scripts/profiles/`), "Any" excluded.
- Badge templates: the tenant's default badge design for every type except
  "Any".
- Emails: `EMAIL_TEMPLATE_DEFAULTS`. Only edited triggers are saved as rows,
  since a missing row already means "use the default".
- Staff access: the step each user had on the tenant's previous event; otherwise
  the only step for the user's role in the chosen workflows (printer → Print
  Badge, dispatcher → Badge Collection). Validators and reviewers have several
  steps, so they start with no access unless the previous event says otherwise.

## Rejected

- **Checklist** (one page, sections collapsed to summaries, one click): the
  fastest when every default fits, but the user preferred walking through the
  steps.
- **Matrix** (one row per participant type with workflow, badge and quota
  cells): quotas are set per delegation group, not per type, so most cells
  stayed empty.
- **Plain stepper** (rail + editor per step): no way to see what had been
  changed from the defaults before committing.
- **Quick review** (each step opens as a read-only summary): an extra click to
  edit the step you came to change.
- **Focus** (full-screen takeover, Enter to continue): hides the event page, and
  Enter-to-advance was too easy to fire on a step that creates records.
