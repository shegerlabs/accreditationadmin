# Changing a workflow while participants are in it (decided 2026-11-16)

Problem: organisers can ask, after registration opens, for one validation level
to become two or two to become one. Inserting a step already worked:
participants follow `nextStepId` at the moment they are acted on. Removing a
step did not. `Participant.step` and `Approval.step` were `onDelete: Cascade`,
so deleting a step permanently deleted everyone waiting at it and erased every
approval ever recorded there, including those of participants long since
printed. The step delete page had no guard.

## Decision

- **The database refuses.** Both foreign keys are now `NO ACTION`. A step that
  holds participants or history can't be deleted by any path: UI, script, or
  role/workflow cascade. Event and tenant deletes still work, because the
  participants go in the same statement.
- **Move participants** (`…/workflows/:id/steps/move`). Bulk-moves everyone at
  one step, filtered by status, to another step of the same workflow. Status is
  unchanged. Each participant gets a `MOVE` approval at the step they left, with
  the admin and optional reason, so it shows in their history. Reports ignore
  `MOVE`. Rows are locked (`FOR UPDATE`) so a validator acting at the same time
  either finishes first or gets the usual conflict message.
- **Remove step** replaces delete. It is refused while participants are at the
  step or while it is the rejection or bypass target. Steps that led to it are
  relinked to its next step. If no approval was ever recorded there, it is
  deleted. Otherwise it is **retired** (`Step.retiredAt`): hidden from the
  builder, step pickers, access grants and target lookups, with its access
  grants removed, but kept so history still names it. Retired steps are listed
  under the step list with **Restore**. Retiring saves where the step sat
  (`Step.retiredLinks`: the steps that led to it and its access grants), so
  Restore relinks those steps to it and gives the access back. A predecessor an
  admin has re-pointed since is left alone and named in the toast.

## Typical changes

- One level to two: add the step, point the first level at it, grant the second
  validators access. Optionally move already-approved participants back from
  Print to the new step, leaving out Bypassed.
- Two levels to one: move everyone at the second level on to the next step, then
  remove it (it will be retired).

## Across every workflow at once (added 2026-11-17)

Changing levels for an event means the same change on ~18 workflows. The rules
moved into `app/utils/step-lifecycle-core.server.ts` as transaction-level
operations (plus `insertStepAfterTx`); the admin UI wraps each in its own
transaction, and `npm run setup-event` → "Change the live event's workflows"
(`scripts/lib/workflow-changes.ts`) runs one change across the chosen workflows
in a single transaction. It plans and prints first (dry run by default), skips
workflows a change doesn't fit and says why, and records MOVE approvals and an
audit entry per workflow under an admin the operator picks. Moving participants
off a step leaves MOVE approvals there, so such a step is retired, not deleted.

The same change is in the setup wizard: its Workflows step links to
`admin/events/$eventId/setup/workflows` whenever the event has workflows,
published or not. Planning lives in `app/utils/workflow-changes-core.server.ts`
(Remix-free); the CLI only asks the questions and the page only renders the
choices. The page keeps its choices in the URL, so the loader previews the exact
plan; the action rebuilds the plan from the database and refuses if its
fingerprint differs from the one previewed (someone approved or edited in
between), rather than applying something nobody saw. The signed-in admin is the
actor. No backup gate on the web: each change is one transaction, and removal
always retires, even a step with no history
(`removeStepTx(..., { retire: true })`). These are changes to a live event, so
each one should be possible to undo with Restore, which brings back the step's
place and its access. The workflow pages still delete a step nobody has used.

Adding a step to a workflow that holds a retired step with the same name, action
and role restores that step instead of creating a second one, so its approvals
and access stay on one step. At first such workflows were only skipped, with
"restore it instead". An admin who had removed "Second Level Validation" from
one workflow then added it to all of them, and missed the skip in the preview.
If the retired step's old place has changed since (no predecessor still points
where it did), the workflow is skipped and the reason is shown.

## Deleting a retired step (added 2026-11-18)

Because the setup wizard always retires, unused steps can pile up in the retired
list. A retired step with no approvals can be deleted from the list or its
history panel (`deleteRetiredStepTx`, same `/steps/:stepId/delete` route).
Nothing is lost, since nothing ever happened at it. A retired step with
approvals offers only Restore: deleting it would mean deleting the approval
history, which the `NoAction` foreign key refuses anyway.

## Rejected

- **Soft-deleting every step from the workflow pages.** Most deletions there
  happen while a workflow is being set up and have no history. Retiring only
  when history exists keeps the list clean. The setup wizard and CLI are
  different (see above).
- **Resetting status on move.** Moving back from Print would want `INPROGRESS`,
  but bypassed and rejected participants must keep theirs. The status filter
  covers the real cases without guessing.
