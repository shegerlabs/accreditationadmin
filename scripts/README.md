# CLI Scripts

This folder contains command-line tools for managing the accreditation system.

---

## Event Lifecycle Scripts

**Destructive.** Read `docs/runbooks/event-reset-runbook.md` before running
either of these against a real database.

| Script                    | What it does                                                                                                                       |
| ------------------------- | ---------------------------------------------------------------------------------------------------------------------------------- |
| `npm run setup-event`     | Purge all event data **and** seed a new organ's event — tenant identity, participant types, event, workflows — in one transaction. |
| `npm run reset-for-event` | Purge only. Leaves no event, and the previous organ's participant types in place.                                                  |

Both default to a dry run and write nothing without `--confirm`. Under
`--confirm` both run `scripts/accreditation.sh` as a backup gate before their
first write and abort if it fails.

```bash
npm run setup-event                      # dry run, prompts for the organ
npm run setup-event -- --organ=pap       # dry run, organ pre-selected
npm run setup-event -- --confirm         # back up, then purge and seed

npm run reset-for-event                  # dry run
npm run reset-for-event -- --confirm     # back up, then purge
```

Set `VERIFY_RESTORE_URL` to a throwaway database so the backup is proven
restorable, not merely complete:

```bash
export VERIFY_RESTORE_URL='postgresql://user:pass@host:5432/scratch_restore_check'
```

### Who survives a purge

Retention is an allow-list of usernames in `lib/users.ts`
(`RETAINED_USERNAMES`), not role-based. Every other `User` row is deleted along
with its password, sessions, role assignments and `UserEventAccess` rows. `Role`
and `Permission` rows are untouched — only the assignments go, and verification
asserts both tables still hold their original counts.

Both scripts refuse to run if an allow-listed username is missing: a typo there
would silently delete the account it was meant to protect.

### Layout

- `lib/` — shared building blocks: `target.ts` (which database am I on),
  `backup.ts` (the gate), `purge.ts` (what is deleted vs retained), `confirm.ts`
  (the typed confirmation), `verify.ts` (post-run assertions).
- `profiles/` — one module per organ, holding the **only** things that differ
  between setups: tenant identity and the participant-type catalogue (`pap.ts`,
  the Pan-African Parliament). Register new organs in `profiles/index.ts`;
  `setup-event.ts` needs no change.

Each profile carries an `unverifiedFields` list that `setup-event` prints as a
warning on every run, so inferred or placeholder values cannot reach production
unnoticed. Empty the list once the values are confirmed.

---

## Download Photos Script

Download participant photos from Azure Blob Storage filtered by country.

### Usage

#### List Countries with Participants

```bash
npm run download-photos -- list-countries
```

#### Download Photos by Country

```bash
npm run download-photos -- download -c ET,KE,NG -o ./downloads/photos
```

**Options:**

- `-c, --countries <codes>` (required): Comma-separated country codes (e.g.,
  ET,KE,NG)
- `-o, --output <directory>` (optional): Output directory. Default:
  `./downloads/photos`
- `-e, --event <eventId>` (optional): Filter by event ID
- `--status <status>` (optional): Filter by participant status (e.g., APPROVED,
  PENDING)
- `--dry-run` (optional): Preview what would be downloaded without downloading

#### View Statistics

```bash
npm run download-photos -- stats
npm run download-photos -- stats -e <eventId>
```

### Examples

```bash
# List all countries with participant photos
npm run download-photos -- list-countries

# Download photos for Ethiopia and Kenya (dry run)
npm run download-photos -- download -c ET,KE --dry-run

# Download approved photos for Nigeria to custom folder
npm run download-photos -- download -c NG --status APPROVED -o ./nigeria-photos

# Download photos for specific event
npm run download-photos -- download -c ET,KE,NG -e clx123456789

# View photo statistics by country
npm run download-photos -- stats
```

### Output Structure

Photos are saved in the following structure:

```
downloads/photos/
├── ET/
│   ├── REG001_John_Doe.jpg
│   └── REG002_Jane_Smith.png
├── KE/
│   └── REG003_Alice_Johnson.jpg
└── NG/
    └── REG004_Bob_Williams.jpg
```

---

# User Management Script

This script provides a command-line interface for managing users in the
accreditation system.

## Installation

The script uses the following dependencies (already installed):

- `@prisma/client` - Database client
- `bcryptjs` - Password hashing
- `commander` - CLI framework
- `chalk` - Colored output

## Usage

### Create a Single User

```bash
npm run manage-user create \
  -u username \
  -e email@example.com \
  -n "Full Name" \
  -p "password123" \
  -r user \
  -s active \
  -t tenant-id
```

**Options:**

- `-u, --username` (required): Username for the user
- `-e, --email` (required): Email address
- `-n, --name` (required): Full name
- `-p, --password` (required): Password
- `-r, --role` (optional): Role (user, focal, admin, tenant, reviewer,
  first-validator, second-validator, printer). Default: user
- `-s, --status` (optional): User status (active, inactive). Default: inactive
- `-t, --tenant` (optional): Tenant ID (required for non-admin users)

### List Users

```bash
npm run manage-user list
```

**Filter options:**

- `-r, --role <role>`: Filter by role
- `-s, --status <status>`: Filter by status

Examples:

```bash
# List all users
npm run manage-user list

# List only admin users
npm run manage-user list -r admin

# List only active users
npm run manage-user list -s active
```

### Delete a User

```bash
npm run manage-user delete -u username
```

### Change User Password

```bash
npm run manage-user change-password -u username -p "newpassword123"
```

**Options:**

- `-u, --username` (required): Username of the user
- `-p, --password` (required): New password

### Bulk Change Passwords

Change passwords for multiple users from a JSON file:

```bash
npm run manage-user bulk-change-password -f path/to/passwords.json
```

**JSON Format:**

```json
[
	{
		"username": "john.doe",
		"password": "NewSecurePass123!"
	},
	{
		"username": "jane.smith",
		"password": "NewSecurePass456!"
	}
]
```

### Bulk Create Users

Create a JSON file with user data (see `users.json` for format) and run:

```bash
npm run manage-user bulk -f path/to/users.json
```

**JSON Format:**

```json
[
	{
		"username": "john.doe",
		"email": "john.doe@accreditation.com",
		"name": "John Doe",
		"password": "SecurePass123!",
		"role": "user",
		"status": "active",
		"tenantId": "your-tenant-id-here"
	}
]
```

## Available Roles

- `user` - Regular user
- `focal` - Focal Person
- `admin` - Administrator
- `tenant` - Tenant
- `reviewer` - Request Reviewer
- `first-validator` - First Validator
- `second-validator` - Second Validator
- `printer` - Printer

## Examples

### Create an Admin User

```bash
npm run manage-user create \
  -u admin \
  -e admin@accreditation.com \
  -n "System Administrator" \
  -p "AdminPass123!" \
  -r admin \
  -s active
```

### Create a Regular User

```bash
npm run manage-user create \
  -u john.doe \
  -e john.doe@accreditation.com \
  -n "John Doe" \
  -p "UserPass123!" \
  -r user \
  -s active \
  -t "your-tenant-id"
```

### Create Multiple Users from File

```bash
npm run manage-user bulk -f scripts/users.json
```

### Change a User's Password

```bash
npm run manage-user change-password -u john.doe -p "NewSecurePass456!"
```

### Bulk Change Multiple Passwords

```bash
npm run manage-user bulk-change-password -f scripts/passwords.json
```

## Notes

- Passwords are automatically hashed using bcrypt
- Users are created as inactive by default unless specified otherwise
- Tenant ID is required for non-admin users
- The script will update existing users if the username already exists
- All database operations are handled through Prisma
