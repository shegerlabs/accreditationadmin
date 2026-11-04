# Multi-Tenancy Security Refactor - Change Log

This document tracks all changes made during the multi-tenancy security refactor implementation.

---

## Phase 1: Schema Changes

**Date:** 2026-01-09

### Files Modified
- `prisma/schema.prisma`

### Changes Made

#### 1.1 Added RoleScope Enum (line 138-142)
```prisma
enum RoleScope {
  GLOBAL // Global admin - sees all tenants
  TENANT // Tenant admin - manages own tenant
  EVENT  // Event roles - per-event/step access
}
```

#### 1.2 Updated Role Model (line 251-265)
- Added `scope RoleScope @default(EVENT)` field
- Added relation `eventAccess UserEventAccess[]`

#### 1.3 Added Relations to Existing Models
- **User model:** Added `eventAccess UserEventAccess[]`
- **Event model:** Added `userAccess UserEventAccess[]`
- **Step model:** Added `userAccess UserEventAccess[]`

#### 1.4 Created UserEventAccess Model (line 532-548)
```prisma
model UserEventAccess {
  id        String   @id @default(cuid())
  userId    String
  user      User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  roleId    String
  role      Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)
  stepId    String?
  step      Step?    @relation(fields: [stepId], references: [id], onDelete: Cascade)
  createdAt DateTime @default(now())

  @@unique([userId, eventId, roleId, stepId])
  @@index([userId])
  @@index([eventId])
  @@index([stepId])
}
```

### Validation Results
| Check | Status |
|-------|--------|
| `prisma validate` | Passed |
| `prisma generate` | Passed |
| `prisma db push` | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |

---

## Phase 2: Auth Infrastructure

**Date:** 2026-01-09

### Files Modified
- `app/utils/auth.server.ts`

### Changes Made

#### 2.1 Added RoleScope Import
```typescript
import { Password, RoleScope, User } from '@prisma/client'
```

#### 2.2 Added TenantAuthUser Type (line 578-585)
```typescript
export type TenantAuthUser = {
  id: string
  email: string
  username: string
  tenantId: string | null
  isGlobalAdmin: boolean
  isTenantAdmin?: boolean
}
```

#### 2.3 New Auth Helper Functions

| Function | Purpose | Lines |
|----------|---------|-------|
| `requireGlobalAdmin(request)` | Requires GLOBAL scope user (super-admin) | 591-612 |
| `requireTenantAdmin(request, targetTenantId?)` | Requires GLOBAL or TENANT scope, validates tenant ownership | 622-704 |
| `getTenantFilter(user)` | Returns `{ tenantId }` or `{}` for Prisma queries | 713-722 |
| `requireEventAccess(request, eventId, allowedRoles)` | Checks UserEventAccess for event-scoped roles | 732-817 |
| `getUserAccessibleStepIds(userId)` | Gets step IDs user can work on (for validators) | 826-848 |
| `getUserAccessibleEventIds(userId, roles)` | Gets event IDs user has access to (for focal/broadcaster) | 858-871 |

#### 2.4 Function Details

**requireGlobalAdmin:**
- Checks if user has any role with `scope: RoleScope.GLOBAL`
- Returns `TenantAuthUser` with `isGlobalAdmin: true`
- Throws 403 if not a global admin

**requireTenantAdmin:**
- Global admins bypass all checks
- Tenant admins (TENANT scope or 'admin' role) can only access their own tenant
- Validates `targetTenantId` matches `user.tenantId` if provided
- Returns `TenantAuthUser` with tenant context

**getTenantFilter:**
- Global admins: returns `{}` (no filter, sees all)
- Others: returns `{ tenantId: user.tenantId }` for query filtering

**requireEventAccess:**
- Global admins bypass
- Tenant admins can access events in their tenant
- Event-scoped users checked via `UserEventAccess` table

**getUserAccessibleStepIds / getUserAccessibleEventIds:**
- Query `UserEventAccess` to get authorized step/event IDs
- Used by validator and focal routes for filtering

### Validation Results
| Check | Status |
|-------|--------|
| `npm run typecheck` | Passed |
| `npm run build` | Passed |

### Post-Review Critical Fixes

After code review by general-purpose agent, the following critical issues were fixed:

#### Fix 1: Removed Magic String in `getTenantFilter`
**Before:**
```typescript
return { tenantId: user.tenantId ?? '__no_tenant_access__' }
```
**After:**
```typescript
if (!user.tenantId) {
  throw json({ error: 'Unauthorized', message: 'User has no tenant assignment' }, { status: 403 })
}
return { tenantId: user.tenantId }
```
**Reason:** Magic string was fragile and could leak data if a tenant was named `__no_tenant_access__`.

#### Fix 2: Standardized HTTP Status Codes
**Before:** "User not found" returned 404
**After:** Changed to 403 with message "Access denied"
**Reason:** Using 404 could leak information about user existence. All auth failures now return 403.

---

## Phase 3: Critical Route Security Fixes

**Date:** 2026-01-09

### Overview
Applied tenant filtering to all admin routes to ensure proper data isolation between tenants. Global admins see all data; tenant admins see only their tenant's data.

### Files Modified

| File | Changes |
|------|---------|
| `app/routes/admin+/resources+/participants.tsx` | Added authentication and tenant filtering to export |
| `app/routes/admin+/participants+/index.tsx` | Added tenant filtering to main query and dropdowns |
| `app/routes/admin+/events+/index.tsx` | Added tenant filtering and conditional tenant dropdown |
| `app/routes/admin+/tenants+/index.tsx` | Tenant scoping for list view |
| `app/routes/admin+/tenants+/$tenantId.tsx` | Tenant access validation |
| `app/routes/admin+/users+/index.tsx` | Tenant filtering with conditional UI |
| `app/routes/admin+/charts.tsx` | Tenant filtering for all analytics queries |

---

### 3.1 Resource Export Route (CRITICAL)

**File:** `app/routes/admin+/resources+/participants.tsx`

**Issue:** Route had NO authentication - anyone could export participant data!

**Fix:**
```typescript
import { getTenantFilter, requireTenantAdmin } from '~/utils/auth.server'

export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireTenantAdmin(request)
  const tenantFilter = getTenantFilter(user)
  // Applied tenantFilter to all queries
}
```

---

### 3.2 Admin Participants Route

**File:** `app/routes/admin+/participants+/index.tsx`

**Changes:**
- Added `requireTenantAdmin(request)` for authentication
- Added `tenantFilter` to main participant query
- Added tenant filtering to dropdown data (participantTypes, meetingTypes, invitations)
- Countries remain unfiltered (global reference data)

---

### 3.3 Admin Events Route

**File:** `app/routes/admin+/events+/index.tsx`

**Changes:**
- Added tenant filtering to event queries
- Conditional tenant dropdown: only shown for global admins
- Returns `isGlobalAdmin` flag to frontend for conditional rendering

---

### 3.4 Admin Tenants Routes

**File:** `app/routes/admin+/tenants+/index.tsx`
- Global admins see all tenants: `where: {}`
- Tenant admins see only their tenant: `where: { id: user.tenantId }`

**File:** `app/routes/admin+/tenants+/$tenantId.tsx`
- Uses `requireTenantAdmin(request, tenantId)` with target validation
- Ensures tenant admins can only access their own tenant's details

---

### 3.5 Admin Users Route

**File:** `app/routes/admin+/users+/index.tsx`

**Changes:**
- Added tenant filtering to user list query
- Tenant dropdown conditionally shown for global admins
- **Action handler** validates tenant ownership before unlocking users

---

### 3.6 Analytics Dashboard

**File:** `app/routes/admin+/charts.tsx`

**Changes:**
- Added authentication via `requireTenantAdmin(request)`
- Added tenant filtering to 15+ queries (both Prisma and raw SQL)

**Queries Updated:**

| Query Type | Filter Applied |
|------------|----------------|
| AuditLog (daily activity) | Raw SQL with tenantId condition |
| AuditLog (action distribution) | Raw SQL with tenantId condition |
| AuditLog (entity distribution) | Raw SQL with tenantId condition |
| AuditLog (top users) | Raw SQL with tenantId condition |
| AuditLog (activity by hour) | Raw SQL with tenantId condition |
| AuditLog (recent activity) | Prisma with tenantFilter |
| Participant (by type) | Prisma groupBy with tenantFilter |
| Participant (status counts) | Prisma groupBy with tenantFilter |
| Participant (by country) | Prisma groupBy with tenantFilter |
| Participant (registration trend) | Raw SQL with tenantId condition |
| Participant (total count) | Raw SQL with tenantId condition |
| Participant (country distribution) | Raw SQL with tenantId condition |
| Event (status stats) | Prisma with tenantFilter |
| Event (performance) | Prisma with tenantFilter |
| ParticipantType (analysis) | Prisma with tenantFilter |

**Defense-in-Depth Fix:**
```typescript
// Changed from findUnique to findFirst with tenant validation
const participantType = await prisma.participantType.findFirst({
  where: { id: type.participantTypeId, ...tenantFilter },
})
```

---

### Validation Results

| Check | Status |
|-------|--------|
| `npm run typecheck` | Passed |
| `npm run build` | Passed |

### Code Review Findings

The general-purpose agent reviewed all Phase 3 changes and found:

| Finding | Severity | Status |
|---------|----------|--------|
| ParticipantType lookup without tenant check | LOW | Fixed |
| Raw SQL uses parameterized queries (no SQL injection) | N/A | Verified |
| Countries correctly unfiltered (global data) | N/A | Correct |
| All routes properly authenticated | N/A | Verified |

---

## Phase 4: Validator Route Security

**Date:** 2026-01-09

### Overview
Implemented step-based filtering for validator routes using `UserEventAccess` table, with backward compatibility to role-based filtering for systems without UserEventAccess records configured.

### Files Modified

| File | Changes |
|------|---------|
| `app/routes/validator+/requests+/index.tsx` | Step-based filtering for participant list |
| `app/routes/validator+/requests+/$participantId.tsx` | Step-based filtering for detail view and actions |
| `app/routes/validator+/requests+/$participantId.approve.tsx` | Step-based filtering for approve action |
| `app/routes/validator+/requests+/$participantId.reject.tsx` | Step-based filtering for reject action |
| `app/routes/validator+/requests+/$participantId.print.tsx` | Step-based filtering for print action |
| `app/routes/validator+/requests+/$participantId_.badge.tsx` | Step-based filtering for badge view |
| `app/routes/validator+/requests+/$participantId_.edit.tsx` | Step-based filtering for wishlist edit |
| `app/utils/auth.server.ts` | Added 'broadcast' to getUserAccessibleStepIds |

---

### Step-Based Filtering Pattern

All validator routes now use this pattern:

```typescript
// Get user's roles for backward compatibility
const userRoles = await prisma.user.findUniqueOrThrow({
  where: { id: user.id },
  include: { roles: true },
})

// Try step-based filtering first (new multi-tenancy approach)
const accessibleStepIds = await getUserAccessibleStepIds(user.id)

// Build where clause: use step-based if available, otherwise fall back to role-based
const stepFilter =
  accessibleStepIds.length > 0
    ? { stepId: { in: accessibleStepIds } }
    : { step: { roleId: { in: userRoles.roles.map(role => role.id) } } }
```

---

### Security Improvements

1. **Step-based access control**: Validators now access participants based on specific step assignments in `UserEventAccess`, not just role membership

2. **Backward compatibility**: Falls back to role-based filtering if no `UserEventAccess` records exist

3. **Error message standardization**: Changed all "Not Found" (404) responses to "Access denied" (403) to prevent information leakage about participant existence

4. **Explicit access verification**: Added access check before update in edit route to prevent unauthorized modifications

---

### Validation Results

| Check | Status |
|-------|--------|
| `npm run typecheck` | Passed |
| `npm run build` | Passed |

### Code Review Findings

| Finding | Severity | Status |
|---------|----------|--------|
| `$participantId.tsx` loader used 404 instead of 403 | MEDIUM | Fixed |
| `broadcast` role missing from `getUserAccessibleStepIds` | MEDIUM | Fixed |
| `$participantId_.edit.tsx` no explicit access check before update | HIGH | Fixed |
| Missing ErrorBoundary in several files | LOW | Deferred |

---

## Phase 5: Focal User Routes

**Date:** 2026-01-09

### Overview
Created a complete focal user dashboard with event-based access control using `UserEventAccess` table, with backward compatibility to tenant-based access.

### Files Modified

| File | Changes |
|------|---------|
| `app/routes/_index.tsx` | Redirect focal users to `/focal` instead of logout |

### Files Created

| File | Purpose |
|------|---------|
| `app/routes/focal+/index.tsx` | Redirect to `/focal/events` |
| `app/routes/focal+/events.tsx` | Layout route with event access filtering |
| `app/routes/focal+/events+/index.tsx` | List assigned events with auto-redirect |
| `app/routes/focal+/events+/$eventId.tsx` | Event layout with access validation |
| `app/routes/focal+/events+/$eventId+/participants+/index.tsx` | Participant list for event |
| `app/routes/focal+/events+/$eventId+/participants+/$participantId.tsx` | Participant detail view |

---

### Route Structure

```
app/routes/focal+/
├── index.tsx                    # Redirects to /focal/events
├── events.tsx                   # Layout with event context
└── events+/
    ├── index.tsx                # Events list (auto-redirect if single event)
    └── $eventId+/
        ├── $eventId.tsx         # Event layout with access check
        └── participants+/
            ├── index.tsx        # Participants list
            └── $participantId.tsx # Participant detail
```

---

### Access Control Pattern

All focal routes use this pattern:

```typescript
const user = await requireUserWithRoles(request, ['focal'])
const accessibleEventIds = await getUserAccessibleEventIds(user.id, ['focal'])

if (accessibleEventIds.length > 0) {
    // New approach: Check UserEventAccess table
    if (!accessibleEventIds.includes(eventId)) {
        throw json({ error: 'Access denied' }, { status: 403 })
    }
} else {
    // Backward compatibility: Check tenant-based access
    const userWithTenant = await prisma.user.findUnique({
        where: { id: user.id },
        select: { tenantId: true },
    })
    // Verify event belongs to user's tenant
}
```

---

### Features

1. **Event List**: Shows all accessible events with participant counts
2. **Auto-Redirect**: If user has only one event, redirects directly to participants
3. **Participant List**: Searchable/filterable list with photo, status, stage
4. **Participant Detail**: Read-only view with approval history

---

### Security Features

- All routes require `focal` role via `requireUserWithRoles`
- Event access validated via `getUserAccessibleEventIds`
- Backward compatibility with tenant-based filtering
- 403 status for all access denied scenarios (prevents enumeration)
- ErrorBoundary with appropriate status handlers

---

### Validation Results

| Check | Status |
|-------|--------|
| `npm run typecheck` | Passed |
| `npm run build` | Passed |

### Code Review Findings

| Finding | Severity | Status |
|---------|----------|--------|
| Code duplication in access validation | LOW | Noted - could extract to helper |
| Inconsistent 404 in participants index | MEDIUM | Fixed (changed to 403) |
| Photo URL uses /admin/ path prefix | LOW | Noted - verify resource auth |

---

## Phase 6: Event Access Management UI

**Date:** 2026-01-09

### Overview
Created admin UI for managing user access to events via the `UserEventAccess` table. Admins can grant specific users access to events with particular roles and optional step assignments.

### Files Created

| File | Purpose |
|------|---------|
| `app/routes/admin+/events+/$eventId+/access.tsx` | Layout route with shared context |
| `app/routes/admin+/events+/$eventId+/access+/index.tsx` | List users with access |
| `app/routes/admin+/events+/$eventId+/access+/new.tsx` | Grant access form |
| `app/routes/admin+/events+/$eventId+/access+/$accessId_.delete.tsx` | Revoke access |
| `app/routes/admin+/events+/$eventId+/access+/__access-editor.tsx` | Editor component |
| `app/routes/admin+/events+/$eventId+/access+/__access-editor.server.tsx` | Server action |

---

### Route Structure

```
app/routes/admin+/events+/$eventId+/access+/
├── access.tsx                    # Layout with event/users/roles/steps context
├── index.tsx                     # List with search/filter
├── new.tsx                       # Grant access form
├── $accessId_.delete.tsx         # Revoke access
├── __access-editor.tsx           # Shared editor component
└── __access-editor.server.tsx    # Shared action handler
```

---

### Features

1. **List View**: Shows all users with access to the event
   - Displays user, role, step (if assigned), and grant date
   - Filterable by role and step
   - Searchable by user info

2. **Grant Access**: Form to assign access
   - Select user (filtered by tenant for non-global admins)
   - Select role (EVENT scoped roles)
   - Optional step assignment (for step-specific access)
   - Duplicate prevention

3. **Revoke Access**: Confirmation dialog to remove access

---

### Security Features

- All routes require `requireTenantAdmin` authentication
- Global admins see all users/events; tenant admins see only their tenant's
- Tenant validation before granting access
- User existence verification with tenant check
- Role and step validation
- CSRF and honeypot protection
- Audit logging for create/delete operations
- Consistent 403 errors for access denied

---

### Access Control Pattern

```typescript
// Non-global admins must have a tenant
if (!user.isGlobalAdmin && !user.tenantId) {
    throw json({ error: 'Access denied' }, { status: 403 })
}

// Event access check
const event = await prisma.event.findFirst({
    where: {
        id: eventId,
        ...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
    },
    ...
})

invariantResponse(event, 'Access denied', { status: 403 })

// User access check (for granting)
const targetUser = await prisma.user.findFirst({
    where: {
        id: userId,
        ...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
    },
    ...
})
```

---

### Validation Results

| Check | Status |
|-------|--------|
| `npm run typecheck` | Passed |
| `npm run build` | Passed |

### Code Review Findings

| Finding | Severity | Status |
|---------|----------|--------|
| No security issues identified | N/A | All checks passed |

---

## Phase 7: Data Migration Script

**Date:** 2026-01-09

### Overview
Created a migration script to set role scopes and create UserEventAccess records for existing users with event-scoped roles.

### File Created

| File | Purpose |
|------|---------|
| `scripts/migrate-multi-tenancy.ts` | Migration script for multi-tenancy security refactor |

---

### Usage

```bash
# Preview changes (recommended first)
npx tsx scripts/migrate-multi-tenancy.ts --dry-run

# Apply changes
npx tsx scripts/migrate-multi-tenancy.ts
```

---

### Migration Steps

**Phase 1: Role Scope Updates**
- `super-admin` → GLOBAL
- `admin` → GLOBAL
- `tenant` → TENANT
- All others → EVENT (default)

**Phase 2: User Tenant Check**
- Reports users with event roles but no tenant assignment
- These users need manual tenant assignment

**Phase 3: UserEventAccess Creation**
- For each user with event roles (focal, first-validator, second-validator, badge-printer, broadcast, reviewer):
  - Finds events in their tenant
  - Creates UserEventAccess records
  - For validator roles: links to specific steps matching their role
  - For focal/broadcast: creates event-wide access

---

### Features

- **Idempotent**: Safe to run multiple times
- **Dry Run Mode**: Preview changes before applying
- **Duplicate Prevention**: Skips existing access records
- **Progress Reporting**: Shows tables of changes made
- **User Warnings**: Reports users without tenant assignment

---

### Validation Results

| Check | Status |
|-------|--------|
| Script executes without errors | Passed |
| `npm run typecheck` | Passed |
| `npm run build` | Passed |

---

## Implementation Complete

All 7 phases of the multi-tenancy security refactor have been completed:

| Phase | Description | Status |
|-------|-------------|--------|
| 1 | Schema changes (RoleScope enum, UserEventAccess model) | ✅ Complete |
| 2 | Auth infrastructure (new helper functions) | ✅ Complete |
| 3 | Critical route security fixes (admin routes) | ✅ Complete |
| 4 | Validator route security (step-based filtering) | ✅ Complete |
| 5 | Focal user routes (new dashboard) | ✅ Complete |
| 6 | Event access management UI | ✅ Complete |
| 7 | Data migration script | ✅ Complete |

### Post-Implementation Checklist

- [ ] Run migration script on production database
- [ ] Assign tenants to users without tenant assignment
- [ ] Test tenant isolation with different user accounts
- [ ] Verify focal users can only see assigned events
- [ ] Verify validators only see participants at assigned steps
- [ ] Test event access management UI

---

