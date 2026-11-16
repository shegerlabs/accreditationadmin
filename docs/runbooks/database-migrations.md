# Database migrations

Until 2026-11-16 the schema was applied with `prisma db push`, so production has
no migration history. From now on every schema change ships as a Prisma
migration in `prisma/migrations/` and production is updated with
`prisma migrate deploy`. **Never run `db push` against production again**: it
bypasses the history and can drop data to make the database match.

## One-time: adopt migrations on an existing database

Do this once per database that was built with `db push`: production, any staging
copy, and each developer's local database.

`0_init` is the schema as it stood at commit `19078a3`, which is what production
runs today. Marking it as applied tells Prisma "this database already has all of
that", without running it.

### 1. Back up

```bash
export DATABASE_URL='postgresql://…production…'
bash scripts/accreditation.sh   # see event-reset-runbook.md for VERIFY_RESTORE_URL
```

### 2. Check that the database really matches `0_init`

If production drifted (a hand-made index, a column pushed from a branch that was
never merged), marking `0_init` as applied would hide that drift, and a later
migration could fail halfway through.

```bash
git show 19078a3:prisma/schema.prisma > /tmp/schema-0_init.prisma
npx prisma migrate diff \
  --from-url "$DATABASE_URL" \
  --to-schema-datamodel /tmp/schema-0_init.prisma \
  --script
```

Expected output: `-- This is an empty migration.`

If it prints SQL, stop. That SQL is the difference between production and
`0_init`. Decide case by case whether production or the schema is right before
going on.

### 3. Mark the baseline as applied

```bash
npx prisma migrate resolve --applied 0_init
```

### 4. Apply the pending migrations

```bash
npx prisma migrate status    # should list as pending:
                             #   20261116180755_protect_steps_and_retire
                             #   20261116184915_remember_retired_step_links
npx prisma migrate deploy
```

`remember_retired_step_links` only adds a nullable JSON column.

`protect_steps_and_retire` is safe on a live database. It adds a nullable column
and an enum value, and swaps two foreign keys from `ON DELETE CASCADE` to
`ON DELETE NO ACTION`. It doesn't rewrite any rows. The foreign key swaps
briefly lock `Participant` and `Approval` while Postgres revalidates the
constraint, so deploy outside peak registration hours.

### 5. Verify

```bash
npx prisma migrate status    # "Database schema is up to date!"
```

## From now on

- Change `prisma/schema.prisma`, then
  `npx prisma migrate dev --name <what_changed>` locally. Commit the generated
  folder with the code that needs it.
- Read the generated SQL before committing. Prisma will drop and recreate a
  column to rename it unless you edit the SQL yourself.
- Deploy: back up, then `npx prisma migrate deploy`, before starting the new
  build.
