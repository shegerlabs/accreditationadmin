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

## Rejected

- **Soft-deleting every step.** Most deletions happen while a workflow is being
  set up and have no history. Retiring only when history exists keeps the list
  clean.
- **Resetting status on move.** Moving back from Print would want `INPROGRESS`,
  but bypassed and rejected participants must keep theirs. The status filter
  covers the real cases without guessing.
