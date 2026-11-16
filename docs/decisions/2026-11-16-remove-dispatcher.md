# Remove the dispatcher role (decided 2026-11-16)

Problem: the dispatcher role (badge handover at a collection desk) was never
used. No badge had ever been marked collected and no reprint had ever been
requested, but printed participants still waited at a "Badge Collection" step
that nobody worked.

## Decision

The role and everything that only it used are gone:

- The `/dispatcher` pages: the collection queue, marking badges collected (one,
  ticked in bulk, or by scanning), requesting reprints, and collection history.
- The printer's **reprint queue** (`/printer/reprints`) and batch reprints. Only
  dispatchers created reprint requests, so nothing would ever reach the queue.
  Printers still reprint from the print queue, choosing a reason, up to the
  reprint limit. Old reprinted badges' QR codes point at
  `/printer/reprints/{id}`, which now redirects to `/printer/requests/{id}`.
- The **Badge Collection** step. Print Badge now leads straight to Archive
  Request. `scripts/remove-dispatcher.ts` moves anyone waiting at a collection
  step on to the step after it (status stays Printed), relinks steps and step
  templates around it, then deletes the steps, the menu items, the role
  assignments and event access, the role and the `dispatcher` account.
- The collect action in the workflow engine, the "Badge collected" email, the
  Collected filter on the print queue, and the Collect column in the validator
  activity report.

Kept, for history: the `COLLECT` action, `COLLECTED` status and
`BADGE_COLLECTED` email trigger stay in the database enums, so existing
approvals, audit entries and email logs still read correctly. Collected
participants keep their status; checkpoints still accept their badges.

## Rejected

- **Dropping the enum values**: would need a migration rewriting existing rows
  (8 collected participants locally, unknown in production) for no user-facing
  gain.
- **Admins requesting reprints** to keep the reprint queue alive: printers
  already reprint directly with a reason, and there is no separate approver.
