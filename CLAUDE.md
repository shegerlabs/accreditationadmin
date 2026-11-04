# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with
code in this repository.

## Project Overview

Accreditation Admin is a full-stack web application for managing event
accreditation workflows. It handles participant registration, document
verification, multi-step approval workflows, and badge/document generation.
Built with Remix 2, React 18, TypeScript, Prisma, and PostgreSQL.

## Common Commands

```bash
# Development
npm run dev              # Start dev server (Express + Vite)
npm run build            # Production build
npm run start            # Run production server

# Code Quality
npm run typecheck        # TypeScript type checking
npm run lint             # ESLint with caching
npm run format           # Prettier formatting

# Database
npx prisma migrate dev   # Run migrations in development
npx prisma db push       # Push schema changes (dev only)
npx prisma studio        # Open Prisma Studio GUI
npx tsx prisma/seed.ts   # Seed database

# User/Data Management CLIs
npm run manage-user create -u <username> -e <email> -n "<name>" -p <password> -r <role>
npm run manage-user list [-r <role>] [-s <status>]
npm run manage-user delete -u <username>
npm run manage-user change-password -u <username> -p <newpassword>
npm run manage-user bulk -f <path/to/users.json>
npm run manage-workflow   # Workflow management CLI
npm run manage-country    # Country management CLI
npm run manage-title      # Title management CLI (Mr., Mrs., Dr., etc.)
npm run reset-password    # Password reset CLI

# Event lifecycle (destructive — see docs/runbooks/event-reset-runbook.md)
npm run setup-event                     # DRY RUN: purge + seed a new organ's event
npm run setup-event -- --organ=acerwc   # DRY RUN, organ pre-selected
npm run setup-event -- --confirm        # Back up, then purge and seed
npm run reset-for-event                 # DRY RUN: purge only
npm run reset-for-event -- --confirm    # Back up, then purge

# Icons
npm run build:icons       # Rebuild icon components from SVG
```

## Architecture

### Tech Stack

- **Framework**: Remix 2.11 with Vite, Express server
- **Database**: PostgreSQL with Prisma 5.19 ORM
- **UI**: Radix UI primitives, Tailwind CSS, Lucide icons
- **Forms**: Conform with Zod validation
- **Storage**: Azure Blob Storage for documents
- **Email**: Azure Communication Services

### Routing Structure (remix-flat-routes)

Routes use the `+` suffix convention for nested layouts:

- `_auth+/` - Authentication pages (login, signup, verify, reset-password)
- `_misc+/` - Static pages (FAQ, privacy, terms)
- `admin+/` - Admin dashboard with deeply nested CRUD routes
- `validator+/` - Validator approval workflows
- `settings+/` - User settings

Route file naming patterns:

- `$paramId.tsx` - Dynamic route segment
- `$paramId_.action.tsx` - Non-nested action route (underscore escapes nesting)
- `__editor.tsx` - Shared component (double underscore = not a route)
- `__editor.server.tsx` - Server-only shared code

### Key Directories

- `app/routes/` - File-based routing
- `app/components/ui/` - Radix-based UI component library
- `app/components/conform/` - Form field components
- `app/components/workflow-builder/` - Visual workflow editor components
- `app/utils/*.server.ts` - Server-only utilities (auth, db, email, storage)
- `prisma/schema.prisma` - Database schema
- `config/svgs/` - Source SVG files for icon generation

### Key Files

- `app/utils/workflow.server.ts` - Workflow execution engine
  (`processParticipant`)
- `app/routes/validator+/requests+/` - Validator approval interface
- `app/routes/admin+/events+/$eventId+/workflows+/` - Event workflow management
- `app/routes/admin+/tenants+/$tenantId+/workflow-templates+/` - Workflow
  template management
- `app/routes/admin+/participants+/` - Admin participant management with
  bypass/reject

### Path Aliases

- `~/` maps to `app/`
- `@/icon-name` maps to generated icon components

### UI Patterns

- **Action Buttons in Detail Pages**: Place Back, Edit, Delete, and other action
  buttons in the card header on the right side, not in a separate header section
  above the card. Use the CardHeader with a flex container to put the title on
  the left and actions on the right.

### User Roles

`user`, `focal`, `admin`, `tenant`, `reviewer`, `first-validator`,
`second-validator`, `printer`, `badge-printer`, `broadcast`, `checkpoint`

### Workflow System

#### Workflow Templates (Tenant Level)

- Located at `admin/tenants/$tenantId/workflow-templates`
- Reusable workflow definitions with `StepTemplate` records
- Can be cloned when creating event-specific workflows

#### Event Workflows

- Located at `admin/events/$eventId/workflows`
- Each workflow is tied to Event + ParticipantType combination
- Contains `Step` records that define the approval flow

#### Step Structure

- **Actions**: `APPROVE`, `REJECT`, `NOTIFY`, `PRINT`, `ARCHIVE`, `BYPASS`
- **nextStepId**: Links to the next step in the flow (linked list model)
- **isRejectionTarget**: Marks the step where rejected participants return
- **isBypassTarget**: Marks the step where bypassed participants jump to

#### Workflow Execution (`app/utils/workflow.server.ts`)

- `processParticipant()` is the core function that executes workflow actions
- Actions execute first, then approval is logged (ensures consistency)
- Throws errors if rejection/bypass targets aren't configured

#### Visual Workflow Builder

- Uses `@xyflow/react` (React Flow) for node-based editing
- `app/components/workflow-builder/` contains canvas, nodes, palette
- Auto-layout with `dagre` library
- Supports drag-and-drop step creation and connection management

### Event Setup and Reset

`npm run setup-event` purges all event data and seeds a new event in one
transaction. Both it and `reset-for-event` are dry-run by default and run
`scripts/accreditation.sh` as a backup gate before their first write.

- `scripts/lib/` - shared target parsing, backup gate, and purge logic
- `scripts/profiles/` - one module per organ, holding the **only** things that
  differ between setups: tenant identity and the participant-type catalogue
  (`auc.ts`, `acerwc.ts`). Register new ones in `profiles/index.ts`.

User retention is an **allow-list of usernames** in `scripts/lib/users.ts`
(`RETAINED_USERNAMES`), not role-based. Every other account is deleted with its
password, sessions, role assignments and `UserEventAccess` rows. `Role` and
`Permission` rows are untouched — only the assignments go. A guard refuses to
run if any allow-listed username is absent, because a typo there would destroy
the account it was meant to protect.

The Tenant row is updated in place, never deleted — `User.tenantId` cascades, so
replacing it would delete every retained account. Likewise
`Participant.participantTypeId` cascades, so participant types are only pruned
_after_ the purge, when nothing references them.

### Invitation System

- Invitations control access/quotas for participant registration
- `InvitationConstraint` records define per-type quotas and access levels
- Not directly linked to workflows - workflows are determined by Event +
  ParticipantType

### Approval Flow

1. Participant registers and is assigned to first workflow step
2. Validators see participants at steps matching their role
3. Actions move participants through the workflow:
   - APPROVE → next step via `nextStepId`
   - REJECT → step with `isRejectionTarget: true`
   - BYPASS → step with `isBypassTarget: true`
4. `Approval` records create audit trail of all actions

### Server Configuration

The Express server (`server.js`) includes:

- Rate limiting (100 req/min general, 50 for mutations, 10 for specific paths)
- Helmet security headers
- Health check at `/up`

## Environment Variables

Required in `.env`:

- `DATABASE_URL` - PostgreSQL connection string
- `SESSION_SECRET` - Session encryption key
- `HONEYPOT_SECRET` - CSRF protection
- `AZURE_STORAGE_CONNECTION_STRING` - Azure Blob Storage
- `EMAIL_CONNECTION_STRING` - Azure Communication Services
