# Event setup wizard (decided 2026-11-06 from a /admin/proto/event-setup prototype)

Problem: setting up an event meant visiting Restrictions, Workflows, Templates,
Emails and Access one by one and recreating the same defaults by hand.

## Decision

A stepped wizard at `/admin/events/:eventId/setup` with a **receipt** panel.

- Steps: Restrictions → Workflows → Badge templates → Emails → Staff access →
  Confirm.
- Left: the editor for the current step. Right (sticky): a receipt of everything
  that will be created. Each section shows its summary and a status: _Not
  reviewed_, _Default_ or _Changed_. Changed sections have a **Reset to
  default** button.
- One "Set up event" button on the last step writes everything in one
  transaction.
- Sections the event already has are skipped, never overwritten (restrictions if
  any exist; workflows and badge templates per participant type; emails per
  trigger; access rows are de-duplicated).
- Invitations are not part of setup: each is an organization's focal point, so
  there is no default list. They are added afterwards and draw on the
  restrictions.

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
