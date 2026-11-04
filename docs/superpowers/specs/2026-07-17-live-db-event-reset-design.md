# Live Database Reset for New Event — Design

**Date:** 2026-07-17
**Status:** Approved (pending spec review)

## Goal

Prepare the live accreditation database for a new event by wiping all
event-specific data while retaining configuration and reference data.

Stated intent: *"All I wanted to keep is the configs, event specific data
should be wiped out."*

The purge is driven by PII minimisation. `Participant` stores `passportNumber`,
`passportExpiry`, `dateOfBirth`, and nationality for every past registrant.
That data has served its purpose and should not persist into the next event
cycle.

## Non-Goals

- Schema changes. This is a data operation only.
- Azure blob deletion. Deferred to a follow-up job (see Deferred Work).
- Any change to application code paths.

## Key Structural Findings

1. **`Event` cascades broadly.** Deleting an `Event` row cascades to `Meeting`,
   `Restriction`, `Workflow` (→ `Step`), `Invitation` (→ `InvitationConstraint`),
   `Participant` (→ `Approval`, `ParticipantDocument`), `Template`
   (→ `Attachment`), and `UserEventAccess`. Event-scoped data is therefore
   removable with a single delete, not a hand-written teardown.

2. **Registrant `User` accounts do NOT cascade from `Event`.**
   `Participant.userId → User` cascades from the *User* side only. Deleting
   events leaves every registrant account, plus their `Session`, `Password`,
   and `UserImage` rows, behind. These must be deleted explicitly.

3. **Registrants must be identified by ROLE, not by absence of participants.**
   `User.roles` is many-to-many (`Role[]`). Staff accounts (admin, validator,
   printer, checkpoint, etc.) also have zero participant records. A
   "has no participants" heuristic would delete the entire staff. The predicate
   must be: roles are exactly `['user']`.

4. **Blobs live at deterministic paths.** Participant documents are stored at
   `accreditation/participants/{participantId}/` and template attachments at
   `accreditation/templates/{templateId}/`. Because the path derives from the
   record ID, orphaned blobs remain identifiable after the DB rows are gone —
   deferred cleanup is recoverable, not a one-way door.

5. **`DatabaseBackup.createdById → User` declares no `onDelete` rule**, so it
   defaults to restrict. It would block deletion of any user who ever ran a
   backup. Staff only in practice, but the purge must not trip over it.

## Decisions

| Question | Decision |
|---|---|
| Scope | Purge prior event data; keep config |
| Registrant accounts | Delete entirely |
| Azure blobs | Leave; handle in a separate follow-up job |
| Events to purge | All existing events |
| Audit logs | Delete all |

### Accepted Risk: Audit Log Deletion

Deleting `AuditLog` destroys the record of who approved or rejected every past
participant. Note that `AuditLog.userId` is `onDelete: SetNull`, so the trail
would have survived the registrant-user purge on its own — deleting it is a
deliberate choice, not a consequence. Once the backup ages out there is no
other copy. **Confirm against accreditation compliance obligations before
execution.**

## Approach

A dedicated `scripts/reset-for-event.ts` CLI, following the existing script
conventions in `scripts/` (`manage-user.ts`, `migrate-multi-tenancy.ts`,
`fix-participant-step-mismatch.ts`).

Rationale over the alternatives:

- **Raw SQL** — some cascades are declared at the Prisma layer, so hand-written
  SQL risks FK errors or silently missed cascades. Leaves no reviewable artifact.
- **Hand-cleaned dump restore** — maximum downtime and the most room for subtle
  error. Only justified if the DB were already corrupt.

The script must support `--dry-run` as the default mode, printing per-table row
counts for what *would* be deleted, and require an explicit `--confirm` flag to
execute.

## BLOCKER — Credential Exposure (must be resolved before execution)

`scripts/accreditation.sh` hardcodes the production database password for
`audbs.postgres.database.azure.com` (user `audbsadmin`) in plaintext on line 7.
The file is git-tracked, not gitignored, present in HEAD, and committed since
`28b2b47`. It is pushed to `github.com/binalfew/accreditationadmin`.

This is the same database holding passport numbers, dates of birth, and
nationalities. Azure Postgres is internet-facing; the credential is the primary
control.

Required, in order:

1. **Rotate the `audbsadmin` password.** This is the only step that closes the
   exposure; everything else is cleanup.
2. Source the password from the environment (`PGPASSWORD` / `DATABASE_URL`),
   matching how the app already handles credentials.
3. Untrack + gitignore the script, or keep it tracked with the secret removed.
4. Scrub git history if the repo is or ever was public. Rotation comes first
   because history rewriting cannot reach existing clones and forks.
5. If the repo is public, review Azure Postgres connection logs for
   unrecognised source IPs before assuming no breach.

Note: `.env` is NOT tracked. This script is the only tracked file carrying a
hardcoded secret.

## Backup Gate

The purge must be gated on a verified backup: no successful backup, no purge.
The script exits non-zero and performs no deletion if any backup step fails.

`scripts/accreditation.sh` is the basis (it already uses real `pg_dump` for
schema and data, and checks dump exit codes). It requires these changes before
it can serve as a gate:

1. **Write to a timestamped folder**, not timestamped filenames in a shared
   directory: `$BACKUP_DIR/<UTC-timestamp>/{schema.sql,data.sql,backup.sql}`.
   One folder per run is atomic to keep, move, or discard.
2. **Stop stripping the completion marker.** `filter_dump` greps out
   `^-- PostgreSQL database dump`, which also removes pg_dump's trailing
   `-- PostgreSQL database dump complete` sentinel. That line is precisely how a
   truncated dump is detected. The gate must assert it is present in both
   `schema.sql` and `data.sql`. Narrow the filter to the header only.
3. **Check every step's exit status**, including the `cat` that builds the
   combined file, and assert non-zero file sizes.
4. **Verify by restoring** `backup.sql` into a scratch database and comparing
   per-table row counts against the live snapshot. An unrestored dump is a
   hypothesis, not a backup.
5. **Read credentials from the environment** (see BLOCKER above).
6. **Do not hardcode the `pg_dump` path.** Resolve the client binary and assert
   its major version matches the server.
7. Write a `manifest.json` beside the dumps: UTC timestamp, git SHA, per-table
   row counts, and the restore-verification result.

### Rejected: `backup.server.ts` as the gate

The in-app `createBackup` is more complete than most hand-rolled dumpers — it
emits `CREATE TYPE` for enums, tables, PKs, FKs, indexes, and dependency-ordered
`INSERT`s, handling `bytea` as hex. It remains unsuitable as the gate for an
irreversible wipe:

- It excludes `_prisma%` tables, so `_prisma_migrations` is absent. A restore
  leaves Prisma believing no migrations were applied.
- It reconstructs DDL from `information_schema` by hand, which does not reliably
  capture sequence values, extensions, partial/expression indexes, check
  constraints, or collations. `escapeSqlValue` is hand-rolled string building.
- It has never been validated by an actual restore.

It stays fine as the convenience/UI backup, where the live DB still exists.

## Execution Plan

### Phase 0 — Pre-flight

1. Resolve the credential BLOCKER above.
2. **Run the backup gate and verify the restore into a scratch database.** Every
   step below is irreversible.
3. Snapshot per-table row counts, to prove afterwards what went and what stayed.
4. **Verify `WorkflowTemplate` / `StepTemplate` records are current.** After the
   purge there is nothing left to clone workflows from.

### Phase 1 — Purge (single transaction, only if Phase 0 fully succeeded)

1. Delete all `AuditLog`.
2. Delete all `Event` — cascades all event-scoped data.
3. Delete `User` where roles are exactly `['user']` — cascades `Session`,
   `Password`, `UserImage`, `Participant`.
4. Delete **all** remaining `Session` and `Verification` rows — including staff
   sessions — so no pre-purge session resumes and no stale verification code
   remains redeemable. Staff will need to log in again after the reset; this is
   intended, not collateral.

### Phase 2 — Verification

1. Re-run row counts; assert retained tables are unchanged and purged tables
   are empty.
2. Assert staff accounts still resolve and can authenticate.

## Retained (Must Be Non-Empty After Purge)

`Country`, `Title`, `ParticipantType`, `MeetingType`, `Venue`, `Role`,
`Permission`, `Menu`, `MenuItem`, `BadgeTemplate`, `WorkflowTemplate`,
`StepTemplate`, `SystemSetting`, `DatabaseBackup`, `CustomReport`, `Tenant`,
and all staff `User` accounts.

## Purged (Must Be Empty After Purge)

`AuditLog`, `Session`, `Verification`, and the full transitive CASCADE closure
from `Event` — verified 2026-07-17 against the live schema's foreign keys:

| Table | Deleted via |
|---|---|
| `Event` | explicit |
| `Meeting`, `Restriction`, `Workflow`, `Invitation`, `Participant`, `Template`, `UserEventAccess` | `eventId` -> Event |
| `Constraint` | `restrictionId` -> Restriction |
| `InvitationConstraint` | `invitationId` -> Invitation |
| `Step` | `workflowId` -> Workflow |
| `Attachment` | `templateId` -> Template |
| `Approval`, `ParticipantDocument` | `participantId` -> Participant |

Plus registrant `User` rows and their `Password` / `UserImage` / `_RoleToUser`.

`Constraint` was missing from an earlier version of this list. It is deleted by
cascade regardless, so the omission meant the dry run under-reported what it
would destroy (4 rows live). Any table in this closure that is absent from
`PURGED_TABLES` in the script is invisible in the preview and unverified
afterwards — keep the two in sync.

### User-cascade edge cases

- `CustomReport.createdById -> User` is `ON DELETE CASCADE`: a registrant-owned
  report would be deleted despite `CustomReport` being retained config. Live
  count is 0, so this is currently theoretical; it is listed in
  `RETAINED_TABLES` so verification would catch it.
- `DatabaseBackup.createdById -> User` is `RESTRICT` and `NOT NULL` (confirmed
  from the live schema), so a registrant-owned backup row would abort the
  transaction. Guarded by a pre-flight check. Live count is 0.
- `AuditLog.userId -> User` is `SET NULL` (confirmed), so the audit trail would
  survive the registrant purge on its own. Deleting it is a deliberate choice.

## Downstream Consequences

1. **Staff lose per-event assignments.** `UserEventAccess` is event-scoped and
   cascades away. Validators, printers, and checkpoint users retain their global
   roles but must be re-assigned to steps on the new event. This is manual work
   that needs to be budgeted for before the new event opens.

2. **Workflows must be re-cloned from templates.** All `Workflow` and `Step`
   records die with the events. This is the intended use of `WorkflowTemplate`,
   but it makes Phase 0 step 3 load-bearing.

## Deferred Work

**Orphan blob reconciliation.** List `accreditation/participants/` and
`accreditation/templates/`; for each `<prefix>/<id>/`, delete via the existing
`deleteDirectory` helper in `app/utils/storage.server.ts` where `<id>` no longer
resolves in the database. Until this runs, passport scans and photos persist in
Blob Storage after their DB records are gone — which is in tension with the
PII-minimisation goal driving this work, and should be scheduled promptly rather
than left open-ended.

## Testing

- Script logic exercised against a restored copy of the live backup in a scratch
  database, never first against live.
- Assert the retained/purged table lists above hold after a dry run and a real
  run on the scratch DB.
- Assert the role predicate: seed a scratch DB with one registrant and one
  staff account per role, confirm only the registrant is deleted.
