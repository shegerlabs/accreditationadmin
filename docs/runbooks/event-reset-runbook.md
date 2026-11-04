# Runbook: Reset the Live Database for a New Event

Wipes event-specific data (participants, approvals, invitations, workflows,
audit logs) while keeping configuration and reference data (countries, titles,
participant types, roles, permissions, badge/workflow templates).

**User accounts are retained by an explicit allow-list of usernames**, not by
role — see "Which accounts survive" below.

## Which script do I want?

|                           |                                                                                                                                                             |
| ------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `npm run setup-event`     | **Usual choice.** Purge _and_ seed a new organ's event in one atomic step: tenant identity, participant-type catalogue, event, workflows. Asks which organ. |
| `npm run reset-for-event` | Purge only. Leaves the database with no event and the previous organ's participant types still in place.                                                    |

Both are dry-run by default and share `scripts/lib/`. **A dry run takes no
backup** — it writes nothing, so there is nothing to protect. Under `--confirm`
both run the same backup gate before their first write, and abort if it fails.
Steps 0 and 4 below apply to either. Setup-specific detail is in "Setting up a
new organ's event" at the end.

**Design rationale:**
`docs/superpowers/specs/2026-07-17-live-db-event-reset-design.md`

> **This is irreversible.** The only way back is restoring the backup taken by
> Step 4. Read "If something goes wrong" before you start, not after.

---

## 0. Before you begin

### Rotate the database credential (one time)

`scripts/accreditation.sh` previously hardcoded the production password; it is
still in git history (commit `28b2b47`, on `origin/main`). The script now reads
from the environment instead.

Rotate `audbsadmin` in Azure before the first run. You are configuring
`DATABASE_URL` anyway, so this costs nothing extra.

### ⚠️ Point at the right database

**The server hosts two similarly-named databases.**

| Database           | What it is                                                                                                                                                                                                                                                                          |
| ------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `accreditation`    | **The live event database. This is the target.** 40 tables, matches `prisma/schema.prisma` exactly.                                                                                                                                                                                 |
| `papaccreditation` | An older schema — 7 tables from `schema.prisma` are absent (`Title`, `WorkflowTemplate`, `StepTemplate`, `BadgeTemplate`, `UserEventAccess`, `InvitationConstraint`, `SystemSetting`) and it has an extra `Draft` table. Not managed by Prisma Migrate. **Not this task's target.** |

As of 2026-09-03 `.env`'s `DATABASE_URL` points at `accreditation`, so the
ambient environment is correct and no export is needed. This was not always true
— earlier revisions of this runbook warned that `.env` pointed at
`papaccreditation`. **Verify rather than assume**, and set it explicitly for the
session if you want to be certain:

```bash
export DATABASE_URL='postgresql://audbsadmin:<new-password>@audbs.postgres.database.azure.com:5432/accreditation?sslmode=require'
```

Every script prints the target database and host in its banner. **Read that
banner every time.** They additionally refuse to run if the database is missing
tables that `schema.prisma` defines, which is what catches a wrong-database
mistake.

Note that `accreditation` is **not managed by Prisma Migrate** either — it
reports `No migration found in prisma/migrations` and is maintained with
`prisma db push`. Schema changes will not be applied by `migrate deploy`.

A password containing `@` is fine — either percent-encode it (`%40`) or paste it
literally. Both are handled.

Alternatively use discrete variables: `PG_HOST`, `PG_PORT`, `PG_USER`,
`PG_PASSWORD`, `PG_DATABASE`. These take precedence over `DATABASE_URL`.

### ⚠️ Use the v16 client — v17 produces an unrestorable backup

The Azure server is **PostgreSQL 16**. On this machine the default `pg_dump` is
**17.9**, which is the wrong one.

```bash
pg_dump --version    # default here reports 17.9 — NOT what you want
```

**You normally don't need to do anything.** The script probes the server's
version, then auto-selects a matching client if one is installed, printing:

```
Auto-selected v16 client to match server: /opt/homebrew/opt/postgresql@16/bin/pg_dump
```

Only override if you need a specific binary — an explicit `PG_DUMP`/`PSQL` is
always honoured, and still version-checked:

```bash
export PG_DUMP=/opt/homebrew/opt/postgresql@16/bin/pg_dump
export PSQL=/opt/homebrew/opt/postgresql@16/bin/psql
```

If no matching client is installed, the script refuses and tells you to
`brew install postgresql@16`.

**Why this matters more than it looks.** `pg_dump` 17 _can_ dump a v16 server —
PostgreSQL supports that. But the dump it writes begins with
`SET transaction_timeout = 0;`, a **PostgreSQL 17-only** parameter. Restoring
that into v16 fails immediately:

```
ERROR:  unrecognized configuration parameter "transaction_timeout"
```

The v17 dump is **complete, correctly sized, carries its completion marker, and
exits 0 — and cannot be restored into your server.** It is a backup that only
fails when you need it.

`scripts/accreditation.sh` now refuses to run on a version mismatch and prints
the exact `export` lines above. Do not work around it.

This is also the concrete reason Step 4 uses `VERIFY_RESTORE_URL`: restoring is
the only check that catches this class of failure. Completeness checks pass
happily on an unusable dump.

> The v14 client on this machine is broken
> (`dyld: Library not loaded ... libpq.5.dylib`). Use v16.

### Choose where backups land

Defaults to `~/Backups/database/accreditation`. Override with:

```bash
export BACKUP_DIR=/path/to/backups
```

Each run creates its own timestamped subfolder, so runs never overwrite each
other.

---

## 1. Dry run — always start here

```bash
npm run reset-for-event
```

Deletes nothing. Prints exactly what would go and what would stay.

**Read the output before continuing.** Check that:

- `WILL BE DELETED` matches your expectation, especially `participant` and
  `auditLog`.
- `WILL BE RETAINED` shows non-zero counts for `country`, `title`,
  `participantType`, `role`, `badgeTemplate`, `workflowTemplate`. **If
  `workflowTemplate` is 0, stop** — see Step 2.
- The "The ONLY accounts that will survive" list is exactly the operators you
  expect. **Everything not on it is deleted**, including every focal point from
  the previous event.

---

## 2. Verify workflow templates are current

The purge destroys every `Workflow` and `Step`. Templates are the only thing
left to rebuild the new event's workflow from.

In the admin UI, go to **Tenants → _your tenant_ → Workflow Templates** and
confirm the templates reflect the flow you want for the new event.

**If templates are missing or stale, fix them now.** After the purge there is
nothing to copy from.

---

## 3. Confirm the audit-log decision

The purge deletes **all** audit logs, destroying the record of who approved or
rejected every past participant. Once the backup ages out there is no other
copy.

This is a deliberate choice, not a technical necessity — `AuditLog` is
tenant-scoped and would otherwise survive. If accreditation carries any
obligation to demonstrate an approval trail, resolve that **before** running
Step 5.

---

## 4. Take a verified backup

Step 5 runs this automatically, but run it standalone first with a restore check
so the backup is proven before it has to gate a real wipe.

Create a throwaway database for the check, then:

```bash
export VERIFY_RESTORE_URL='postgresql://user:pass@host:5432/scratch_restore_check'
bash scripts/accreditation.sh
```

Expected tail:

```
Restore verified: row counts match.

Backup complete: /path/to/backups/20260717T094028Z
  schema.sql    ... bytes
  data.sql      ... bytes
  backup.sql    ... bytes
  manifest.json
```

**`Restore verified: row counts match.` is the line that matters.** Without
`VERIFY_RESTORE_URL` the dump is only checked for completeness, not
restorability.

**Leave `VERIFY_RESTORE_URL` set for the real run too.** The backup that gates
an irreversible purge is precisely the one worth proving, and completeness
checks pass happily on a dump that cannot be restored. `runBackupGate` prints a
warning when the variable is unset, but it does not refuse — the decision is
yours, so make it deliberately.

Each folder contains:

| File            | Contents                                                    |
| --------------- | ----------------------------------------------------------- |
| `schema.sql`    | DDL only (`--schema-only --no-owner --no-acl`)              |
| `data.sql`      | `INSERT` statements (`--data-only --column-inserts`)        |
| `backup.sql`    | The two concatenated. **This is the restore file.**         |
| `manifest.json` | Timestamp, git SHA, per-table row counts, `restoreVerified` |

`manifest.json` deliberately contains no credentials.

---

## 5. Run the purge

```bash
npm run reset-for-event -- --confirm
```

(To purge _and_ seed a new organ's event in one transaction, use
`npm run setup-event -- --confirm` instead — see the last section.)

What happens, in order:

1. Prints the same survey as the dry run.
2. Checks every allow-listed username exists, and that no `DatabaseBackup` rows
   are owned by accounts about to be deleted (they would block the transaction).
3. **Prompts you to type the database name** (e.g. `accreditation`). Anything
   else aborts immediately — before the backup runs.
4. **Runs the backup gate.** If the backup fails, the purge does not run.
5. Purges in a single transaction: audit logs → events (cascade) → all
   non-allow-listed accounts → sessions and verifications.
6. Verifies purged tables are empty and retained tables are unchanged.

Success ends with:

```
Purge complete and verified.
  N accounts retained.
```

If you see `VERIFICATION FAILED`, treat the database as suspect and go to "If
something goes wrong".

---

## 6. After the purge

These are required before the new event can operate:

1. **Re-clone workflows** for the new event from `WorkflowTemplate` (Admin →
   Events → _new event_ → Workflows).
2. **Re-assign validators, printers, and checkpoint users to steps.**
   `UserEventAccess` is event-scoped and was cascaded away. Staff keep their
   global roles but have no per-event assignments. This is manual and easy to
   forget — approvals will silently have nobody to action them.
3. **Tell staff to log in again.** All sessions were cleared, including theirs.
4. **Schedule orphan blob cleanup.** Participant photos and passport scans
   remain in Azure Blob Storage under `accreditation/participants/<id>/` and
   `accreditation/templates/<id>/`. The database rows referencing them are gone.
   Until this runs, passport scans persist despite the purge — which undercuts
   the reason for doing it. Blobs stay identifiable because paths derive from
   record IDs: any prefix whose ID no longer resolves in the database is an
   orphan.

---

## If something goes wrong

### Restore the backup

`backup.sql` contains no `DROP` statements, so it will **not** restore over a
populated schema — you get `relation already exists`. Restore into an empty
schema.

Into the same database (destroys current contents):

```bash
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 \
  -c 'DROP SCHEMA public CASCADE; CREATE SCHEMA public;'
psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -f /path/to/backups/<timestamp>/backup.sql
```

Into a fresh database (safer — keeps the current state for inspection):

```bash
createdb accreditation_restored
psql "postgresql://.../accreditation_restored" -v ON_ERROR_STOP=1 -f backup.sql
```

`-v ON_ERROR_STOP=1` is essential; without it psql continues past errors and
leaves a half-restored database that looks fine.

The dump includes `_prisma_migrations`, so migration state is preserved and
`prisma migrate deploy` behaves normally afterwards.

### Verify a restore

Compare against `manifest.json`:

```bash
cat /path/to/backups/<timestamp>/manifest.json | python3 -m json.tool
```

`rowCounts` records exactly what was in the database at backup time.

---

## Troubleshooting

| Symptom                                                                     | Cause and fix                                                                                                                                      |
| --------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------- |
| `set PG_HOST or DATABASE_URL`                                               | No credentials in the environment. See Step 0.                                                                                                     |
| `pg_dump is v17 but the server is v16`                                      | You explicitly exported a v17 `PG_DUMP`, or no v16 client is installed. Unset the override to let it auto-select, or `brew install postgresql@16`. |
| `unrecognized configuration parameter "transaction_timeout"` during restore | The dump was produced by a v17 client. It is unusable against v16. Re-take it with the v16 client.                                                 |
| `schema dump is incomplete (no completion marker)`                          | The dump was truncated — usually a dropped connection or a full disk. **Do not proceed.** Re-run.                                                  |
| `row counts differ after restore`                                           | The dump does not round-trip. **Do not proceed.** Investigate before purging.                                                                      |
| `Aborted: expected "accreditation", got "..."`                              | Confirmation text didn't match. Nothing was touched.                                                                                               |
| `Database "papaccreditation" is missing N table(s)`                         | `DATABASE_URL` is pointing at the wrong database (`.env`'s default). Export it explicitly — see Step 0.                                            |
| `Backup FAILED (exit N). Nothing has been deleted.`                         | Working as designed — the gate held. Fix the backup, re-run.                                                                                       |
| `DatabaseBackup row(s) are owned by accounts this purge would delete`       | Reassign those rows to an allow-listed account, then re-run.                                                                                       |
| `N allow-listed account(s) do not exist`                                    | A username in `scripts/lib/users.ts` is wrong, or the account is missing here. Fix before purging.                                                 |
| `VERIFICATION FAILED`                                                       | The purge left the DB in an unexpected state. Restore from the backup this run just took.                                                          |

---

## Quick reference

```bash
# 1. Configure. As of 2026-09-03 .env already points at /accreditation; verify
#    the banner anyway. The v16 client is auto-selected; no PG_DUMP/PSQL needed.
export DATABASE_URL='postgresql://user:pass@host:5432/accreditation?sslmode=require'

# 2. Keep this set for every run, including the real one. An unrestored dump is
#    a hypothesis, not a backup — see "Take a verified backup".
export VERIFY_RESTORE_URL='postgresql://user:pass@host:5432/scratch_restore_check'

# 3. Look
npm run setup-event          # or: npm run reset-for-event

# 4. Do it
npm run setup-event -- --confirm
```

---

## Setting up a new organ's event

`npm run setup-event` replaces steps 1, 5 and most of 6 with a single guided
run. It purges, then seeds, **in one transaction** — a failure anywhere leaves
the database exactly as it was.

```bash
npm run setup-event                    # dry run, prompts for the organ
npm run setup-event -- --organ=acerwc  # dry run, organ pre-selected
npm run setup-event -- --confirm       # back up, then purge and seed
```

### Organ profiles

The only thing that differs between organs is the **tenant identity** and the
**participant-type catalogue**. Both live in `scripts/profiles/`:

| File                         | Organ                    | Types                                        |
| ---------------------------- | ------------------------ | -------------------------------------------- |
| `scripts/profiles/auc.ts`    | African Union Commission | 28 — captured from the live DB on 2026-09-03 |
| `scripts/profiles/acerwc.ts` | ACERWC                   | 21                                           |

Add an organ by writing one more profile module and listing it in
`scripts/profiles/index.ts`. `setup-event` needs no change.

Each profile carries an `unverifiedFields` list. **`setup-event` prints it as a
warning on every run** until you empty it, so a placeholder cannot silently
reach production. The ACERWC profile currently flags its contact details,
per-type priorities and workflow-template assignments as inferred rather than
supplied — confirm them before a live run.

### What the run asks you, in order

1. **Which organ** — picks the profile.
2. **The history call.** The purge survey is printed, then you are asked whether
   losing that many participants and audit logs is acceptable. Asked before
   anything else is decided, because everything after it is wasted effort if the
   answer is no. Answering no stops the run in both dry and live modes.
3. **Event name, description, location, start/end date, timezone, status.**
   Dates are entered as local calendar dates plus an explicit UTC offset; the
   plan prints both the local and the resulting UTC value so you can check the
   conversion. Maseru is `+02:00`, one hour behind the Addis-based AUC events.
   `Event` has **no location column**, so the location is appended to the
   description — the only field that carries it to the UI.
4. **How workflows are built** — profile defaults (a per-type mix), one template
   for every type, or a per-type choice.

### Read the plan before confirming

The dry run prints the purge survey, then a participant-type diff (`kept` /
`added` / `removed` / `final`), a field-by-field tenant diff with `~` marking
each change, the event with both local and UTC timestamps, and the workflow
assignment grouped by template. Nothing is written without `--confirm`.

### Order of operations under `--confirm`

1. Guards: every allow-listed username exists, and no `DatabaseBackup` rows are
   owned by an account about to be deleted.
2. Type the database name to confirm — the point of no return. The prompt names
   the exact number of participants and audit logs about to be destroyed.
3. **Backup gate.** Always before the first write. Backup fails → nothing runs.
4. One transaction: purge → update tenant in place → delete types not in the
   profile → upsert the profile's types → create the event → clone workflows.
5. Verify, then print the remaining manual steps.

Verification asserts that purged tables are empty (bar the one `Event` and the
workflows the run just created), that every retained table holds exactly the
count it started with, and that the surviving accounts are **exactly** the
allow-list — neither a protected account missing nor a doomed one left behind.

### Two things the script deliberately does not do

- **It never deletes the Tenant row.** `User.tenantId` cascades, so replacing
  the tenant would delete every staff account. The existing row is updated in
  place instead, which is why switching organs renames the tenant rather than
  creating a second one.
- **It refuses to run against more than one tenant.** This deployment is
  effectively single-tenant (see below); the script will not guess which tenant
  to repurpose.

### Why one tenant and not one tenant per organ

The schema is properly multi-tenant, but the application layer is only partway
there. Four create-forms enforce name uniqueness _globally_ instead of per
tenant, so a second tenant could not create a "Delegate" participant type while
the first tenant has one:

- `app/routes/admin+/tenants+/$tenantId+/participant-types+/__participant-type-editor.server.tsx:71`
- `app/routes/admin+/tenants+/$tenantId+/venues+/__venue-editor.server.tsx:66`
- `app/routes/admin+/tenants+/$tenantId+/meeting-types+/__meeting-type-editor.server.tsx:69`
- `app/routes/admin+/events+/__event-editor.server.tsx:91`

There are also unscoped queries that leak across tenants once a second one
exists — bulk photo export (`admin+/resources+/photos.tsx:10`) and checkpoint
badge validation (`checker+/validate.tsx:50`) are the notable ones. Fix those
before considering a genuinely concurrent two-tenant deployment.

### Which accounts survive

Retention is an **allow-list of usernames** in `scripts/lib/users.ts`:

```
admin  tenantadmin  firstvalidator  secondvalidator
badgeprinter  dispatcher  checker  focal
```

Every other `User` row is deleted, along with its password, sessions, role
assignments and `UserEventAccess` rows. On the current database that is **519
deleted, 8 retained**.

This supersedes the earlier role-based rule ("delete accounts whose only role is
`user`"), which kept 188 accounts — including 159 focal points belonging to the
previous event's delegations. An allow-list means a new event starts from a
known set of operators rather than inheriting whoever happened to hold a role.

**`Role` and `Permission` rows are untouched.** Only the _assignments_ held by
deleted users go; verification asserts both tables still hold their original
counts (9 roles, 8 permissions).

An allow-list has one sharp edge: a typo silently destroys the account it was
meant to protect. `assertRetainedUsersExist` therefore runs **before the point
of no return** and refuses to continue if any listed username is absent:

```
2 allow-listed account(s) do not exist: focalz, nosuchuser.
```

To change who survives, edit `RETAINED_USERNAMES` in `scripts/lib/users.ts`.

### ⚠️ Never delete a participant type while participants reference it

`Participant.participantTypeId` is `onDelete: Cascade`, and
`npm run manage-participant-type`'s delete option has **no participant-count
guard** — just a yes/no prompt. Deleting a type with 561 participants silently
deletes all 561. `setup-event` only prunes types _after_ the purge, inside the
same transaction, when nothing references them.

### Still manual after a successful run

- Re-assign validators, printers and checkpoint users to steps
  (`UserEventAccess` is event-scoped and was cascaded away). Approvals will
  silently have nobody to action them until this is done.
- Re-create document and badge `Template` rows. `Template` is event-scoped and
  cascaded away with the old event; `BadgeTemplate` is tenant-scoped and
  survived, so the designs are still there to point at.
- Create venues and meetings — this deployment currently has **zero venues**.
- Set restrictions and quotas for the new event.
- Orphan blob cleanup in Azure.
