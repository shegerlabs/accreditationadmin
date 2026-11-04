# Multi-Tenancy Security Refactor Plan

## Overview
Implement proper multi-tenancy isolation with hierarchical role scoping (Global → Tenant → Event) to ensure data isolation between tenants while supporting global admin access, tenant-admin scoped access, and event-level access for validators/focal users.

## Role Structure

| Role | Scope | Purpose |
|------|-------|---------|
| `admin` | GLOBAL | Global administrator - sees all data across all tenants, manages tenants |
| `tenant` | TENANT | Tenant administrator - manages their own tenant, events, users, roles |
| `reviewer` | EVENT | Reviews participant applications (step-based) |
| `focal` | EVENT | Manages participants for assigned events (event-wide) |
| `validator` | EVENT | Validates/approves participants at workflow steps (step-based) |
| `printer` | EVENT | Prints badges and documents (step-based) |
| `broadcaster` | EVENT | Sends broadcast messages (event-wide) |

**Note:** The old `user` role is removed. Regular users (participants) don't need admin access.

---

## System Overview

### 1. Global Admin (`admin` role - GLOBAL scope)

The `admin` is the system owner/operator. There's typically one or a few admin users who manage the entire platform.

**What admin does:**
1. Creates a new tenant (e.g., "African Union", "European Commission", "World Bank")
2. Creates a user with `tenant` role and assigns them to that tenant
3. Gives credentials to the tenant admin
4. Can view all data across all tenants using filters

**Admin's view:**
```
/admin/tenants      → Sees ALL tenants (African Union, European Commission, etc.)
/admin/events       → Sees ALL events across all tenants (with tenant filter dropdown)
/admin/participants → Sees ALL participants across all tenants (with tenant filter)
/admin/users        → Sees ALL users across all tenants
```

### 2. Tenant Admin (`tenant` role - TENANT scope)

Each tenant has one or more tenant admins who manage everything for their organization.

**What tenant admin does:**
1. Logs in with credentials provided by admin
2. Manages their tenant's events, workflows, templates, users
3. Assigns event roles (validator, focal, printer, etc.) to users for specific events/steps
4. Can only see their own tenant's data

**Tenant admin's view:**
```
/admin/tenants      → Sees ONLY their own tenant (e.g., "African Union")
/admin/events       → Sees ONLY their tenant's events
/admin/participants → Sees ONLY their tenant's participants
/admin/users        → Sees ONLY their tenant's users
```

### 3. Event Roles (EVENT scope)

Tenant admins assign these roles to users for specific events and steps.

**Step-based roles** (need stepId in UserEventAccess):
- `validator` - Approves participants at a specific workflow step
- `reviewer` - Reviews applications at a specific step
- `printer` - Prints badges at a specific step

**Event-wide roles** (no stepId needed):
- `focal` - Manages all participants for an event
- `broadcaster` - Sends messages to all participants in an event

---

## Complete System Flow

```
┌─────────────────────────────────────────────────────────────────┐
│                         ADMIN (GLOBAL)                          │
│   - Creates tenants                                             │
│   - Creates tenant admin users                                  │
│   - Sees all data with filters                                  │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Creates
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    TENANT (African Union)                       │
│                                                                 │
│  Tenant Admin (tenant role):                                    │
│   - Manages events (Summit 2025, Assembly 2025)                 │
│   - Manages workflows & steps                                   │
│   - Manages badge templates                                     │
│   - Creates users and assigns event roles                       │
│   - Can ONLY see African Union's data                           │
└─────────────────────────────────────────────────────────────────┘
                              │
                              │ Assigns to events/steps
                              ▼
┌─────────────────────────────────────────────────────────────────┐
│                    EVENT ROLE USERS                             │
│                                                                 │
│  UserEventAccess records:                                       │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ User: John    Event: Summit 2025   Role: validator      │   │
│  │ Step: Delegate > Review                                 │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ User: John    Event: Summit 2025   Role: validator      │   │
│  │ Step: Delegate > Approve                                │   │
│  └─────────────────────────────────────────────────────────┘   │
│  ┌─────────────────────────────────────────────────────────┐   │
│  │ User: Jane    Event: Summit 2025   Role: focal          │   │
│  │ Step: (null - sees all participants)                    │   │
│  └─────────────────────────────────────────────────────────┘   │
└─────────────────────────────────────────────────────────────────┘
```

---

## Example Scenario

### Step 1: Admin creates tenant
```
Admin logs in
Admin goes to /admin/tenants → clicks "New Tenant"
Creates: "African Union" tenant
```

### Step 2: Admin creates tenant admin user
```
Admin goes to /admin/users → clicks "New User"
Creates user:
  - Username: au_admin
  - Email: admin@au.org
  - Role: tenant
  - Tenant: African Union
Admin gives credentials to AU admin
```

### Step 3: Tenant admin logs in and sets up
```
AU Admin logs in with credentials
Goes to /admin/tenants → sees only "African Union" (their tenant)
Goes to /admin/events → creates "AU Summit 2025"
Creates workflows with steps for different participant types
Creates badge templates
```

### Step 4: Tenant admin assigns event roles
```
AU Admin goes to /admin/events/summit-2025/access
Assigns:
  - John → validator role → Step: "Delegate > Review"
  - John → validator role → Step: "Delegate > Final Approval"
  - Mary → printer role → Step: "Delegate > Print Badge"
  - Jane → focal role → (no step - event-wide access)
```

### Step 5: Event users work
```
John logs in → goes to /validator/requests
Sees ONLY participants at:
  - "Delegate > Review" step
  - "Delegate > Final Approval" step
Does NOT see participants at other steps

Jane logs in → goes to /focal
Sees ALL participants in "AU Summit 2025" (because focal is event-wide)
```

### Quick Reference: Who Sees What

| User | /admin/tenants | /admin/events | /validator/requests | /focal |
|------|----------------|---------------|---------------------|--------|
| Admin (global) | All tenants | All events (with filter) | N/A | N/A |
| AU Tenant Admin | Only "African Union" | Only AU events | N/A | N/A |
| John (validator) | N/A | N/A | Only his assigned steps | N/A |
| Jane (focal) | N/A | N/A | N/A | All AU Summit participants |

---

## Current Security Gaps (Summary)
1. **No tenant scoping** on admin routes - admins can access any tenant's data
2. **Validators see all participants** matching their role across all tenants
3. **Focal users have no tenant/event binding** and are logged out immediately
4. **No global admin vs tenant-admin distinction** - all admins are global
5. **Resource exports have no auth** - `/admin/resources/participants.tsx`

## Architecture Decisions
- **`admin` role**: GLOBAL scope - access to all tenants and data
- **`tenant` role**: TENANT scope - manages own tenant's events, users, roles
- **Event roles**: EVENT scope - access only via `UserEventAccess` table
- **Tenant routes**: `admin` sees all tenants, `tenant` sees only their own tenant

---

## Phase 1: Schema Changes

### 1.1 Add RoleScope Enum
```prisma
enum RoleScope {
  GLOBAL  // admin only
  TENANT  // tenant
  EVENT   // reviewer, focal, validator, printer, broadcaster
}
```

### 1.2 Modify Role Model
```prisma
model Role {
  id          String      @id @default(cuid())
  name        String      @unique
  scope       RoleScope   @default(TENANT)  // NEW
  description String?
  // ... existing fields
  eventAccess UserEventAccess[]  // NEW relation
}
```

### 1.3 Add UserEventAccess Model
```prisma
model UserEventAccess {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  roleId    String
  role      Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  stepId    String?  // For validators: which workflow step can they work on
  step      Step?    @relation(fields: [stepId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([userId, eventId, roleId, stepId])
  @@index([userId])
  @@index([eventId])
  @@index([stepId])
}
```

**Note on stepId:**
- For `validator`, `reviewer`, `printer` roles: stepId links to the specific workflow step they can work on
- For `focal`, `broadcaster` roles: stepId is null (they have event-wide access)
- Step already contains: Step → Workflow → ParticipantType + Event (so stepId implicitly scopes to participant type)

### 1.4 Update User Model
```prisma
model User {
  // ... existing fields
  eventAccess UserEventAccess[]  // NEW relation
}
```

### 1.5 Update Event Model
```prisma
model Event {
  // ... existing fields
  userAccess UserEventAccess[]  // NEW relation
}
```

### 1.6 Update Step Model
```prisma
model Step {
  // ... existing fields
  userAccess UserEventAccess[]  // NEW relation
}
```

### Files to Modify
- `prisma/schema.prisma` - Add enum, modify Role, add UserEventAccess, update User/Event/Step

---

## Phase 2: Auth Infrastructure

### 2.1 New Auth Helper Functions
Create tenant-aware authorization helpers in `app/utils/auth.server.ts`:

```typescript
// Check if user has GLOBAL scope (admin role)
export async function requireGlobalAdmin(request: Request) {
  const userId = await requireUserId(request)
  const user = await prisma.user.findFirst({
    where: {
      id: userId,
      roles: { some: { scope: 'GLOBAL' } }
    },
    select: { id: true, email: true, username: true }
  })
  invariantResponse(user, 'Global admin access required', { status: 403 })
  return user
}

// Tenant admin access (validates user.tenantId matches target)
export async function requireTenantAdmin(request: Request, targetTenantId?: string) {
  const userId = await requireUserId(request)
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      email: true,
      username: true,
      tenantId: true,
      roles: { select: { name: true, scope: true } }
    }
  })
  invariantResponse(user, 'User not found', { status: 404 })

  // Global admin can access any tenant
  const isGlobalAdmin = user.roles.some(r => r.scope === 'GLOBAL')
  if (isGlobalAdmin) {
    return { ...user, isGlobalAdmin: true }
  }

  // Tenant admin must have 'tenant' role and belong to the target tenant
  const isTenantAdmin = user.roles.some(r => r.name === 'tenant')
  invariantResponse(isTenantAdmin, 'Tenant admin access required', { status: 403 })

  const effectiveTenantId = targetTenantId ?? user.tenantId
  invariantResponse(
    user.tenantId && user.tenantId === effectiveTenantId,
    'Access denied: wrong tenant',
    { status: 403 }
  )

  return { ...user, isGlobalAdmin: false }
}

// Event-level access (for validators, focal users, etc.)
export async function requireEventAccess(
  request: Request,
  eventId: string,
  allowedRoles: string[]
) {
  const userId = await requireUserId(request)
  const user = await prisma.user.findFirst({
    where: { id: userId },
    select: {
      id: true,
      tenantId: true,
      roles: { select: { id: true, name: true, scope: true } }
    }
  })
  invariantResponse(user, 'User not found', { status: 404 })

  // Global admin bypasses event access
  if (user.roles.some(r => r.scope === 'GLOBAL')) {
    return { ...user, isGlobalAdmin: true, eventAccess: null }
  }

  // Tenant admin also bypasses if event belongs to their tenant
  const isTenantAdmin = user.roles.some(r => r.name === 'tenant')
  if (isTenantAdmin) {
    const event = await prisma.event.findFirst({
      where: { id: eventId, tenantId: user.tenantId }
    })
    if (event) {
      return { ...user, isGlobalAdmin: false, isTenantAdmin: true, eventAccess: null }
    }
  }

  // Check event-level access via UserEventAccess
  const access = await prisma.userEventAccess.findFirst({
    where: {
      userId: user.id,
      eventId,
      role: { name: { in: allowedRoles } }
    },
    include: { event: true, role: true }
  })

  invariantResponse(access, 'Event access denied', { status: 403 })
  return { ...user, isGlobalAdmin: false, isTenantAdmin: false, eventAccess: access }
}
```

### 2.2 Utility: Tenant Scope Helper
```typescript
// Helper to add tenantId to where clauses
export function getTenantFilter(user: { isGlobalAdmin: boolean; tenantId: string | null }): { tenantId?: string } {
  if (user.isGlobalAdmin) {
    return {} // No filter for global admin - sees all
  }
  return { tenantId: user.tenantId ?? '__no_tenant_access__' }
}
```

### Files to Modify
- `app/utils/auth.server.ts` - Add new auth helpers

---

## Phase 3: Data Migration

### 3.1 Create Migration Script
```typescript
// scripts/migrate-role-scopes.ts

import { PrismaClient, RoleScope } from '@prisma/client'

const prisma = new PrismaClient()

async function migrateRoleScopes() {
  console.log('Migrating role scopes...')

  // 1. Set admin role to GLOBAL scope
  await prisma.role.updateMany({
    where: { name: 'admin' },
    data: { scope: RoleScope.GLOBAL }
  })
  console.log('  admin -> GLOBAL')

  // 2. Set tenant role to TENANT scope
  await prisma.role.updateMany({
    where: { name: 'tenant' },
    data: { scope: RoleScope.TENANT }
  })
  console.log('  tenant -> TENANT')

  // 3. Set event roles to EVENT scope
  const eventRoles = ['reviewer', 'focal', 'validator', 'printer', 'broadcaster']
  await prisma.role.updateMany({
    where: { name: { in: eventRoles } },
    data: { scope: RoleScope.EVENT }
  })
  console.log(`  ${eventRoles.join(', ')} -> EVENT`)

  // 4. Migrate old role names if they exist
  // first-validator, second-validator -> validator
  const oldValidatorUsers = await prisma.user.findMany({
    where: {
      roles: { some: { name: { in: ['first-validator', 'second-validator'] } } }
    },
    include: { roles: true }
  })

  const validatorRole = await prisma.role.findUnique({ where: { name: 'validator' } })
  if (validatorRole) {
    for (const user of oldValidatorUsers) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          roles: {
            connect: { name: 'validator' },
            disconnect: [{ name: 'first-validator' }, { name: 'second-validator' }]
          }
        }
      })
    }
    console.log(`  Migrated ${oldValidatorUsers.length} users from first/second-validator to validator`)
  }

  // badge-printer -> printer
  const oldPrinterUsers = await prisma.user.findMany({
    where: { roles: { some: { name: 'badge-printer' } } }
  })

  const printerRole = await prisma.role.findUnique({ where: { name: 'printer' } })
  if (printerRole) {
    for (const user of oldPrinterUsers) {
      await prisma.user.update({
        where: { id: user.id },
        data: {
          roles: {
            connect: { name: 'printer' },
            disconnect: { name: 'badge-printer' }
          }
        }
      })
    }
    console.log(`  Migrated ${oldPrinterUsers.length} users from badge-printer to printer`)
  }

  // broadcast -> broadcaster
  await prisma.role.updateMany({
    where: { name: 'broadcast' },
    data: { name: 'broadcaster' }
  })
  console.log('  broadcast -> broadcaster (renamed)')

  // 5. Migrate existing validator step assignments
  // Find all steps that reference old validator roles and create UserEventAccess records
  const stepsWithOldRoles = await prisma.step.findMany({
    where: {
      role: { name: { in: ['first-validator', 'second-validator', 'badge-printer', 'reviewer', 'printer'] } }
    },
    include: {
      role: true,
      workflow: { include: { event: true } }
    }
  })

  // Get users who had these roles
  const usersWithOldRoles = await prisma.user.findMany({
    where: {
      roles: { some: { name: { in: ['first-validator', 'second-validator', 'badge-printer', 'reviewer', 'printer'] } } }
    },
    include: { roles: true }
  })

  // Create UserEventAccess records (admin will need to manually refine these)
  console.log('  Creating UserEventAccess records for existing validators...')
  console.log('  NOTE: Admin should review and refine step assignments after migration')

  for (const user of usersWithOldRoles) {
    for (const step of stepsWithOldRoles) {
      // Check if user had the role that matches this step
      const userHadRole = user.roles.some(r => r.name === step.role?.name)
      if (userHadRole && step.workflow?.event) {
        // Map old role to new role
        let newRoleName = 'validator'
        if (step.role?.name === 'reviewer') newRoleName = 'reviewer'
        if (step.role?.name === 'printer' || step.role?.name === 'badge-printer') newRoleName = 'printer'

        const newRole = await prisma.role.findUnique({ where: { name: newRoleName } })
        if (newRole) {
          await prisma.userEventAccess.upsert({
            where: {
              userId_eventId_roleId_stepId: {
                userId: user.id,
                eventId: step.workflow.event.id,
                roleId: newRole.id,
                stepId: step.id
              }
            },
            create: {
              userId: user.id,
              eventId: step.workflow.event.id,
              roleId: newRole.id,
              stepId: step.id
            },
            update: {}
          })
        }
      }
    }
  }
  console.log('  UserEventAccess records created')

  // 6. Update steps to use new roles
  const validatorRole = await prisma.role.findUnique({ where: { name: 'validator' } })
  const printerRole = await prisma.role.findUnique({ where: { name: 'printer' } })

  if (validatorRole) {
    await prisma.step.updateMany({
      where: { role: { name: { in: ['first-validator', 'second-validator'] } } },
      data: { roleId: validatorRole.id }
    })
  }
  if (printerRole) {
    await prisma.step.updateMany({
      where: { role: { name: 'badge-printer' } },
      data: { roleId: printerRole.id }
    })
  }
  console.log('  Updated steps to use new roles')

  // 7. Clean up old roles
  await prisma.role.deleteMany({
    where: { name: { in: ['first-validator', 'second-validator', 'badge-printer', 'super-admin'] } }
  })
  console.log('  Deleted obsolete roles')

  console.log('Migration complete!')
}

migrateRoleScopes()
  .catch(console.error)
  .finally(() => prisma.$disconnect())
```

### 3.2 Seed File Update
Update `prisma/seed.ts` with complete initial setup:

```typescript
// prisma/seed.ts
import { PrismaClient, RoleScope, UserStatus } from '@prisma/client'
import bcrypt from 'bcryptjs'

const prisma = new PrismaClient()

async function seed() {
  console.log('🌱 Seeding database...\n')

  // ============================================================
  // 1. ROLES
  // ============================================================
  console.log('📝 Creating roles...')

  const roles = [
    // GLOBAL scope
    {
      name: 'admin',
      scope: RoleScope.GLOBAL,
      description: 'Global administrator with access to all tenants',
    },
    // TENANT scope
    {
      name: 'tenant',
      scope: RoleScope.TENANT,
      description: 'Tenant administrator - manages their tenant',
    },
    // EVENT scope - Step-based
    {
      name: 'reviewer',
      scope: RoleScope.EVENT,
      description: 'Reviews participant applications at assigned steps',
    },
    {
      name: 'validator',
      scope: RoleScope.EVENT,
      description: 'Validates/approves participants at assigned workflow steps',
    },
    {
      name: 'printer',
      scope: RoleScope.EVENT,
      description: 'Prints badges and documents at assigned steps',
    },
    // EVENT scope - Event-wide
    {
      name: 'focal',
      scope: RoleScope.EVENT,
      description: 'Focal point for managing event participants',
    },
    {
      name: 'broadcaster',
      scope: RoleScope.EVENT,
      description: 'Sends broadcast messages to event participants',
    },
  ]

  for (const role of roles) {
    await prisma.role.upsert({
      where: { name: role.name },
      create: role,
      update: { scope: role.scope, description: role.description },
    })
    console.log(`   ✓ ${role.name} (${role.scope})`)
  }

  // ============================================================
  // 2. MENUS
  // ============================================================
  console.log('\n📝 Creating menus...')

  // Menu access by role
  const adminRoles = [{ name: 'admin' }]
  const adminAndTenantRoles = [{ name: 'admin' }, { name: 'tenant' }]
  const validatorRoles = [{ name: 'reviewer' }, { name: 'validator' }, { name: 'printer' }]
  const focalRoles = [{ name: 'focal' }]
  const broadcasterRoles = [{ name: 'broadcaster' }]

  // Top-level menus
  const manageMenu = await prisma.menu.upsert({
    where: { name: 'manage' },
    create: {
      name: 'manage',
      title: 'Manage',
      roles: { connect: adminAndTenantRoles },
    },
    update: { roles: { set: adminAndTenantRoles } },
  })
  console.log('   ✓ Manage menu')

  const reportsMenu = await prisma.menu.upsert({
    where: { name: 'reports' },
    create: {
      name: 'reports',
      title: 'Reports',
      roles: { connect: adminAndTenantRoles },
    },
    update: { roles: { set: adminAndTenantRoles } },
  })
  console.log('   ✓ Reports menu')

  const securityMenu = await prisma.menu.upsert({
    where: { name: 'security' },
    create: {
      name: 'security',
      title: 'Security',
      roles: { connect: adminRoles }, // Admin only
    },
    update: { roles: { set: adminRoles } },
  })
  console.log('   ✓ Security menu (admin only)')

  // Validator menu (for event role users)
  const validatorMenu = await prisma.menu.upsert({
    where: { name: 'validator' },
    create: {
      name: 'validator',
      title: 'Validation',
      roles: { connect: [...validatorRoles, ...broadcasterRoles] },
    },
    update: { roles: { set: [...validatorRoles, ...broadcasterRoles] } },
  })
  console.log('   ✓ Validator menu')

  // Focal menu
  const focalMenu = await prisma.menu.upsert({
    where: { name: 'focal' },
    create: {
      name: 'focal',
      title: 'Focal',
      roles: { connect: focalRoles },
    },
    update: { roles: { set: focalRoles } },
  })
  console.log('   ✓ Focal menu')

  // ============================================================
  // 3. MENU ITEMS
  // ============================================================
  console.log('\n📝 Creating menu items...')

  // --- Manage Menu Items ---
  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: manageMenu.id, name: 'tenants' } },
    create: {
      name: 'tenants',
      title: 'Tenants',
      link: '/admin/tenants',
      icon: 'briefcase',
      menuId: manageMenu.id,
      roles: { connect: adminAndTenantRoles },
    },
    update: { roles: { set: adminAndTenantRoles } },
  })
  console.log('   ✓ Manage > Tenants')

  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: manageMenu.id, name: 'events' } },
    create: {
      name: 'events',
      title: 'Events',
      link: '/admin/events',
      icon: 'calendar',
      menuId: manageMenu.id,
      roles: { connect: adminAndTenantRoles },
    },
    update: { roles: { set: adminAndTenantRoles } },
  })
  console.log('   ✓ Manage > Events')

  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: manageMenu.id, name: 'participants' } },
    create: {
      name: 'participants',
      title: 'Participants',
      link: '/admin/participants',
      icon: 'users',
      menuId: manageMenu.id,
      roles: { connect: adminAndTenantRoles },
    },
    update: { roles: { set: adminAndTenantRoles } },
  })
  console.log('   ✓ Manage > Participants')

  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: manageMenu.id, name: 'users' } },
    create: {
      name: 'users',
      title: 'Users',
      link: '/admin/users',
      icon: 'users',
      menuId: manageMenu.id,
      roles: { connect: adminAndTenantRoles },
    },
    update: { roles: { set: adminAndTenantRoles } },
  })
  console.log('   ✓ Manage > Users')

  // --- Reports Menu Items ---
  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: reportsMenu.id, name: 'analytics' } },
    create: {
      name: 'analytics',
      title: 'Analytics',
      link: '/admin/charts',
      icon: 'line-chart',
      menuId: reportsMenu.id,
      roles: { connect: adminAndTenantRoles },
    },
    update: { roles: { set: adminAndTenantRoles } },
  })
  console.log('   ✓ Reports > Analytics')

  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: reportsMenu.id, name: 'audit' } },
    create: {
      name: 'audit',
      title: 'Audit Logs',
      link: '/admin/audits',
      icon: 'shield',
      menuId: reportsMenu.id,
      roles: { connect: adminAndTenantRoles },
    },
    update: { roles: { set: adminAndTenantRoles } },
  })
  console.log('   ✓ Reports > Audit Logs')

  // --- Security Menu Items (Admin only) ---
  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: securityMenu.id, name: 'roles' } },
    create: {
      name: 'roles',
      title: 'Roles',
      link: '/admin/roles',
      icon: 'shield',
      menuId: securityMenu.id,
      roles: { connect: adminRoles },
    },
    update: { roles: { set: adminRoles } },
  })
  console.log('   ✓ Security > Roles')

  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: securityMenu.id, name: 'permissions' } },
    create: {
      name: 'permissions',
      title: 'Permissions',
      link: '/admin/permissions',
      icon: 'lock-closed',
      menuId: securityMenu.id,
      roles: { connect: adminRoles },
    },
    update: { roles: { set: adminRoles } },
  })
  console.log('   ✓ Security > Permissions')

  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: securityMenu.id, name: 'menus' } },
    create: {
      name: 'menus',
      title: 'Menus',
      link: '/admin/menus',
      icon: 'menu',
      menuId: securityMenu.id,
      roles: { connect: adminRoles },
    },
    update: { roles: { set: adminRoles } },
  })
  console.log('   ✓ Security > Menus')

  // --- Validator Menu Items ---
  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: validatorMenu.id, name: 'requests' } },
    create: {
      name: 'requests',
      title: 'Requests',
      link: '/validator/requests',
      icon: 'file-text',
      menuId: validatorMenu.id,
      roles: { connect: [...validatorRoles, ...broadcasterRoles] },
    },
    update: { roles: { set: [...validatorRoles, ...broadcasterRoles] } },
  })
  console.log('   ✓ Validator > Requests')

  // --- Focal Menu Items ---
  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: focalMenu.id, name: 'dashboard' } },
    create: {
      name: 'dashboard',
      title: 'Dashboard',
      link: '/focal',
      icon: 'home',
      menuId: focalMenu.id,
      roles: { connect: focalRoles },
    },
    update: { roles: { set: focalRoles } },
  })
  console.log('   ✓ Focal > Dashboard')

  await prisma.menuItem.upsert({
    where: { menuId_name: { menuId: focalMenu.id, name: 'my-events' } },
    create: {
      name: 'my-events',
      title: 'My Events',
      link: '/focal/events',
      icon: 'calendar',
      menuId: focalMenu.id,
      roles: { connect: focalRoles },
    },
    update: { roles: { set: focalRoles } },
  })
  console.log('   ✓ Focal > My Events')

  // ============================================================
  // 4. DEFAULT ADMIN USER
  // ============================================================
  console.log('\n📝 Creating default admin user...')

  const adminPassword = bcrypt.hashSync('Admin@123!Pass', 10)
  await prisma.user.upsert({
    where: { username: 'admin' },
    create: {
      username: 'admin',
      email: 'admin@system.local',
      name: 'System Administrator',
      status: UserStatus.ACTIVE,
      tenantId: null, // No tenant for global admin
      roles: { connect: { name: 'admin' } },
      password: { create: { hash: adminPassword } },
    },
    update: {
      tenantId: null,
      roles: { connect: { name: 'admin' } },
    },
  })
  console.log('   ✓ admin user (admin role, GLOBAL scope)')

  // ============================================================
  // 5. SAMPLE TENANT (for testing)
  // ============================================================
  console.log('\n📝 Creating sample tenant...')

  const sampleTenant = await prisma.tenant.upsert({
    where: { name: 'African Union' },
    create: {
      name: 'African Union',
      email: 'contact@au.org',
      phone: '+251911000000',
      website: 'https://au.int',
      address: 'Addis Ababa, Ethiopia',
      subscriptionPlan: 'enterprise',
    },
    update: {},
  })
  console.log(`   ✓ ${sampleTenant.name}`)

  // Create tenant admin for sample tenant
  const tenantAdminPassword = bcrypt.hashSync('Tenant@123!Pass', 10)
  await prisma.user.upsert({
    where: { username: 'au_admin' },
    create: {
      username: 'au_admin',
      email: 'admin@au.org',
      name: 'AU Administrator',
      status: UserStatus.ACTIVE,
      tenantId: sampleTenant.id,
      roles: { connect: { name: 'tenant' } },
      password: { create: { hash: tenantAdminPassword } },
    },
    update: {
      tenantId: sampleTenant.id,
      roles: { connect: { name: 'tenant' } },
    },
  })
  console.log('   ✓ au_admin user (tenant role, African Union)')

  // ============================================================
  // DONE
  // ============================================================
  console.log('\n✅ Seeding complete!\n')
  console.log('📋 User Credentials:')
  console.log('   admin / Admin@123!Pass       (Global admin - sees all tenants)')
  console.log('   au_admin / Tenant@123!Pass   (Tenant admin - African Union only)')
  console.log('')
}

seed()
  .catch(error => {
    console.error('❌ Seeding failed:', error)
    process.exit(1)
  })
  .finally(async () => {
    await prisma.$disconnect()
  })
```

### Menu Structure Summary

```
┌─────────────────────────────────────────────────────────────────┐
│ ADMIN & TENANT ROLES                                            │
├─────────────────────────────────────────────────────────────────┤
│ Manage                    │ Reports          │ Security (admin) │
│  ├── Tenants              │  ├── Analytics   │  ├── Roles       │
│  ├── Events               │  └── Audit Logs  │  ├── Permissions │
│  ├── Participants         │                  │  └── Menus       │
│  └── Users                │                  │                  │
└─────────────────────────────────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────┐
│ EVENT ROLES                                                     │
├─────────────────────────────────────────────────────────────────┤
│ Validation (validator/reviewer/printer/broadcaster)             │
│  └── Requests                                                   │
├─────────────────────────────────────────────────────────────────┤
│ Focal                                                           │
│  ├── Dashboard                                                  │
│  └── My Events                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### Files to Modify
- `prisma/schema.prisma` - Schema changes
- `prisma/seed.ts` - Complete seed script
- `scripts/migrate-role-scopes.ts` - Migration script (new file)

---

## Phase 4: Route Fixes (Critical Security)

### 4.1 Admin Participant Routes
**Priority: CRITICAL**

Files to fix:
- `app/routes/admin+/participants+/index.tsx`
- `app/routes/admin+/participants+/$participantId.tsx`
- `app/routes/admin+/participants+/$participantId_.delete.tsx`
- `app/routes/admin+/participants+/$participantId_.history.tsx`

Pattern:
```typescript
export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireTenantAdmin(request)
  const tenantFilter = getTenantFilter(user)

  const { data } = await filterAndPaginate({
    request,
    model: prisma.participant,
    where: tenantFilter,
    // ...
  })
}
```

### 4.2 Admin Event Routes
Files to fix:
- `app/routes/admin+/events+/index.tsx`
- `app/routes/admin+/events+/$eventId.tsx`
- `app/routes/admin+/events+/$eventId_.edit.tsx`
- `app/routes/admin+/events+/$eventId_.delete.tsx`

### 4.3 Resource Routes (CRITICAL - No Auth)
Files to fix:
- `app/routes/admin+/resources+/participants.tsx` - Add auth + tenant filter
- `app/routes/admin+/resources+/participants.$attachmentId.tsx` - Add auth + tenant validation

### 4.4 Analytics Dashboard
Files to fix:
- `app/routes/admin+/charts.tsx` - Filter all queries by tenant (or show global for admin)

### 4.5 Tenant Management Routes
Files to fix:
- `app/routes/admin+/tenants.tsx` - Allow admin OR tenant role
- `app/routes/admin+/tenants+/index.tsx` - Filter by tenant for tenant role
- `app/routes/admin+/tenants+/$tenantId.tsx` - Validate tenant access

Pattern:
```typescript
// For index route - admin sees all, tenant sees only their own
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireTenantAdmin(request)
  const tenantFilter = getTenantFilter(user)

  const tenants = await prisma.tenant.findMany({
    where: tenantFilter,
    // ...
  })
}

// For $tenantId route - validate access
export async function loader({ request, params }: LoaderFunctionArgs) {
  const user = await requireTenantAdmin(request, params.tenantId)
  // user.isGlobalAdmin OR user.tenantId === params.tenantId
  // ...
}
```

### 4.6 User Management Routes
Files to fix:
- `app/routes/admin+/users+/index.tsx` - Add tenant filtering for tenant admins
- `app/routes/admin+/users+/$userId.tsx` - Validate user belongs to admin's tenant

---

## Phase 5: Validator Route Fixes

### 5.1 Add Step-Based Scoping to Validator Routes
Files to fix:
- `app/routes/validator+/requests.tsx`
- `app/routes/validator+/requests+/index.tsx`
- `app/routes/validator+/requests+/$participantId.tsx`
- `app/routes/validator+/requests+/$participantId_.approve.tsx`

Pattern:
```typescript
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUser(request)

  // Get steps this user has access to (via UserEventAccess.stepId)
  const stepAccess = await prisma.userEventAccess.findMany({
    where: {
      userId: user.id,
      role: { name: { in: ['reviewer', 'validator', 'printer'] } },
      stepId: { not: null }  // Only entries with step assignment
    },
    select: {
      stepId: true,
      step: {
        include: {
          workflow: {
            include: { event: true, participantType: true }
          }
        }
      }
    }
  })

  const stepIds = stepAccess.map(a => a.stepId).filter(Boolean) as string[]

  // Only show participants at steps this user can work on
  const participants = await prisma.participant.findMany({
    where: {
      stepId: { in: stepIds }
    },
    include: {
      event: true,
      participantType: true,
      step: true
    }
  })
}
```

**How step assignment works:**
1. Admin assigns user to a step via UserEventAccess (userId + eventId + roleId + stepId)
2. User sees only participants currently at that step
3. Same user can be assigned to multiple steps (multiple UserEventAccess records)
4. Step → Workflow → ParticipantType means assignment is implicitly scoped to participant type

---

## Phase 6: Focal User Dashboard

### 6.1 Create Focal Routes
New files to create:
- `app/routes/focal+/_layout.tsx` - Focal layout with navigation
- `app/routes/focal+/index.tsx` - Focal dashboard
- `app/routes/focal+/events+/index.tsx` - List events focal has access to
- `app/routes/focal+/events+/$eventId+/participants+/index.tsx` - Participants for event
- `app/routes/focal+/events+/$eventId+/participants+/$participantId.tsx` - Participant detail

### 6.2 Update Root Redirect
Modify `app/routes/_index.tsx` to redirect focal users to `/focal` instead of logging out.

### 6.3 Bind Focal Users to Events
When creating focal user from invitation, also create UserEventAccess:
```typescript
// In invitation processing
await prisma.userEventAccess.create({
  data: {
    userId: focalUser.id,
    eventId: invitation.eventId,
    roleId: focalRole.id, // 'focal' role
  }
})
```

Files to modify:
- `app/routes/admin+/events+/$eventId+/invitations+/__invitation-editor.server.tsx`
- `app/routes/admin+/events+/$eventId+/invitations+/index.tsx` (generate secret action)

---

## Phase 7: UI Updates

### 7.1 Navigation Updates
- Database-driven menus already handle role-based visibility
- Add focal dashboard to navigation for focal users
- Ensure menu items respect role scopes

### 7.2 Admin Event Access Management
Create UI for admins to assign event roles and steps to users:
- `app/routes/admin+/events+/$eventId+/access+/index.tsx` - List users with access
- `app/routes/admin+/events+/$eventId+/access+/new.tsx` - Grant access (select user, role, and optionally step)
- `app/routes/admin+/events+/$eventId+/access+/$accessId.delete.tsx` - Revoke access

**Access Assignment Form Fields:**
- User (select from tenant's users)
- Role (validator, reviewer, printer, focal, broadcaster)
- Step (required for validator/reviewer/printer, shows steps from all workflows in the event)

**Example UI:**
```
| User       | Role      | Step                          | Actions |
|------------|-----------|-------------------------------|---------|
| John Doe   | validator | Delegate > Review             | Remove  |
| John Doe   | validator | Delegate > Approve            | Remove  |
| Jane Smith | validator | Media > Review                | Remove  |
| Bob Wilson | focal     | (all participants)            | Remove  |
```

---

## Implementation Sequence

### Step 1: Foundation
1. Schema changes (Phase 1)
2. Run migration
3. Auth helpers (Phase 2)
4. Data migration script (Phase 3)

### Step 2: Critical Security Fixes
5. Fix participant routes (Phase 4.1)
6. Fix event routes (Phase 4.2)
7. Fix resource routes (Phase 4.3)
8. Fix analytics (Phase 4.4)
9. Lock down tenant routes (Phase 4.5)
10. Fix user management routes (Phase 4.6)

### Step 3: Validator & Focal
11. Fix validator routes (Phase 5)
12. Build focal dashboard (Phase 6)
13. Event access management UI (Phase 7.2)

### Step 4: Polish & Testing
14. Navigation updates (Phase 7.1)
15. Comprehensive testing
16. Documentation update

---

## Critical Files Reference

### Schema
- `prisma/schema.prisma` (Role model, User model, Event model)

### Auth
- `app/utils/auth.server.ts` (role checks, tenant filtering)

### Admin Routes (fix tenant scoping)
- `app/routes/admin+/participants+/index.tsx`
- `app/routes/admin+/participants+/$participantId.tsx`
- `app/routes/admin+/events+/index.tsx`
- `app/routes/admin+/charts.tsx`
- `app/routes/admin+/resources+/participants.tsx` (NO AUTH currently)

### Validator Routes (add event scoping)
- `app/routes/validator+/requests+/index.tsx`
- `app/routes/validator+/requests+/$participantId.tsx`

### Focal User Creation (add event binding)
- `app/routes/admin+/events+/$eventId+/invitations+/__invitation-editor.server.tsx`
- `app/routes/admin+/events+/$eventId+/invitations+/index.tsx`

### Root Redirect
- `app/routes/_index.tsx`

---

## Role Hierarchy Summary

```
GLOBAL (admin)
  └── Access all tenants, all events, all data
  └── See all tenants at /admin/tenants
  └── Create/manage tenant admins
  └── Assign users to any event/step

TENANT (tenant)
  └── Access only resources where tenantId matches user.tenantId
  └── Can access /admin/tenants but only sees their own tenant
  └── Can manage their tenant's events, users
  └── Can assign users to events/steps within their tenant

EVENT - Step-based (validator, reviewer, printer)
  └── Access via UserEventAccess with stepId
  └── Only see participants at their assigned steps
  └── Step → Workflow → ParticipantType (scoped to participant type)
  └── Can be assigned to multiple steps

EVENT - Event-wide (focal, broadcaster)
  └── Access via UserEventAccess without stepId
  └── See all participants in their assigned events
  └── Focal: manage participants for their events
  └── Broadcaster: send messages to event participants
```

---

## Data Visibility Summary

| Route | admin (GLOBAL) | tenant (TENANT) |
|-------|----------------|-----------------|
| `/admin/tenants` | All tenants | Only their own tenant |
| `/admin/events` | All events | Only their tenant's events |
| `/admin/participants` | All participants | Only their tenant's participants |
| `/admin/users` | All users | Only their tenant's users |
| `/admin/charts` | Global analytics | Their tenant's analytics |

---

## Testing Checklist

### Global Admin (admin role)
- [ ] Can access all tenants at `/admin/tenants`
- [ ] Can see all events, participants, users across all tenants
- [ ] Can assign users to events/steps

### Tenant Admin (tenant role)
- [ ] Can access `/admin/tenants` but only sees their own tenant
- [ ] Cannot access other tenants' participants or events
- [ ] Can manage their tenant's events and users
- [ ] Can assign users to steps within their tenant's events

### Validator/Reviewer/Printer (step-based roles)
- [ ] Only sees participants at their assigned steps
- [ ] Cannot see participants at other steps
- [ ] Can work on multiple steps if assigned to multiple
- [ ] Step assignment respects participant type (via workflow)

### Focal (event-based role)
- [ ] Can access focal dashboard at `/focal`
- [ ] Only sees events they are assigned to
- [ ] Sees all participants in their assigned events (no step restriction)

### Broadcaster (event-based role)
- [ ] Only sees events they are assigned to
- [ ] Can send messages to participants in assigned events

### Security
- [ ] Resource exports are protected and tenant-scoped
- [ ] Analytics respect tenant boundaries
- [ ] Users cannot access events/steps they are not assigned to
