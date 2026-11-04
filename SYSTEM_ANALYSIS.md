# Accreditation Admin System - Comprehensive Analysis & Enhancement Roadmap

**Date:** February 5, 2026
**Scope:** Full codebase audit covering architecture, features, security, infrastructure, and UX
**Codebase Metrics:** 305 route files | 30 database models | 13 enums | 32 UI components | 9 form components | 12 CLI scripts

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Current System Architecture](#2-current-system-architecture)
3. [Feature Inventory](#3-feature-inventory)
4. [Database Design Analysis](#4-database-design-analysis)
5. [Security Audit](#5-security-audit)
6. [Workflow Engine Analysis](#6-workflow-engine-analysis)
7. [Infrastructure & DevOps Assessment](#7-infrastructure--devops-assessment)
8. [UI/UX Assessment](#8-uiux-assessment)
9. [Critical Issues](#9-critical-issues)
10. [Enhancement Recommendations](#10-enhancement-recommendations)
11. [New Feature Proposals](#11-new-feature-proposals)
12. [Prioritized Roadmap](#12-prioritized-roadmap)
13. [Dynamic Schema Architecture](#13-dynamic-schema-architecture---making-events--participants-fully-configurable)
14. [Visual Form Designer](#14-visual-form-designer)

---

## 1. Executive Summary

The Accreditation Admin platform is a **multi-tenant, full-stack web application** for managing event accreditation workflows. Built on Remix 2, React 18, Prisma/PostgreSQL, and Azure cloud services, it handles participant registration, document verification, multi-step approval workflows, badge generation, and collection tracking.

### Strengths

- **Mature domain model** with 30 database models covering the full accreditation lifecycle
- **Flexible workflow engine** using a linked-list step model with visual builder (React Flow)
- **Multi-tenant architecture** with tenant-scoped data isolation
- **Comprehensive RBAC** with 10 roles, entity-level permissions, and event-scoped access
- **Strong audit trail** covering all actions with metadata, IP, and user agent
- **Production security posture** with Helmet, rate limiting, CSRF, honeypot, account lockout
- **Rich CLI toolset** for operational management (12 scripts)
- **Well-structured UI** using Radix primitives, Tailwind CSS, and Conform form handling

### Critical Gaps

- **Zero automated tests** despite MSW and faker being installed
- **No CI/CD pipeline** or containerization
- **No real-time capabilities** (polling-only for workflow updates)
- **No internationalization** despite being a multi-country system
- **No API layer** for external integrations
- **No mobile-responsive validator interface** for on-the-ground operations
- **Environment secrets committed** to the repository

---

## 2. Current System Architecture

### Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| **Runtime** | Node.js | >= 20.0 |
| **Framework** | Remix | 2.11 |
| **Bundler** | Vite | 5.1 |
| **Server** | Express | 4.19 |
| **Database** | PostgreSQL + Prisma | 5.19 |
| **UI Library** | Radix UI | 14 packages |
| **Styling** | Tailwind CSS | 3.x |
| **Forms** | Conform + Zod | - |
| **File Storage** | Azure Blob Storage | - |
| **Email** | Azure Communication Services | - |
| **PDF** | @react-pdf/renderer | - |
| **Workflow Visual** | @xyflow/react (React Flow) | 12.10 |

### Application Layers

```
┌──────────────────────────────────────────────────────────┐
│  Express Server (server.js)                              │
│  ├── Helmet Security Headers                             │
│  ├── Rate Limiting (3-tier: 10/50/100 req/min)          │
│  ├── Compression + Logging (Morgan)                      │
│  └── Suspicious Request Blocking                         │
├──────────────────────────────────────────────────────────┤
│  Remix SSR Handler                                       │
│  ├── Loaders (data fetching + auth guards)               │
│  ├── Actions (form submissions + workflow execution)     │
│  └── Components (React 18 + Radix UI)                   │
├──────────────────────────────────────────────────────────┤
│  Business Logic Layer                                    │
│  ├── Workflow Engine (workflow.server.ts)                 │
│  ├── Authentication (auth.server.ts)                     │
│  ├── Audit System (audit.server.ts)                      │
│  ├── Settings Engine (settings.server.ts)                │
│  ├── Reports Engine (reports.server.ts)                  │
│  └── Backup System (backup.server.ts)                    │
├──────────────────────────────────────────────────────────┤
│  Data Access Layer                                       │
│  ├── Prisma ORM (singleton client)                       │
│  ├── filterAndPaginate() utility                         │
│  └── In-memory cache (countries, roles, titles)          │
├──────────────────────────────────────────────────────────┤
│  External Services                                       │
│  ├── Azure Blob Storage (documents, photos, backups)     │
│  └── Azure Communication Services (email)                │
└──────────────────────────────────────────────────────────┘
```

### Routing Architecture

The application uses `remix-flat-routes` with the `+` suffix convention for nested layouts:

| Area | Route Count | Description |
|------|------------|-------------|
| `admin+/` | 182 | Admin dashboard with deeply nested CRUD |
| `validator+/` | 12 | Approval workflow interface |
| `printer+/` | 14 | Badge printing queue |
| `dispatcher+/` | 8 | Badge collection management |
| `settings+/` | 11 | User profile and 2FA |
| `_auth+/` | 7 | Authentication pages |
| `_misc+/` | 4 | Static pages (FAQ, privacy, terms) |
| `resources+/` | 13 | API/file download endpoints |

---

## 3. Feature Inventory

### Core Features (Implemented)

#### 3.1 Multi-Tenancy
- Tenant isolation across all data models
- Tenant-scoped unique constraints
- Global vs. tenant-scoped admin roles
- Tenant-level configuration (feature flags, billing info, usage metrics as JSON)

#### 3.2 Event Lifecycle Management
- Full CRUD with status transitions: DRAFT → PUBLISHED → COMPLETED/CANCELED
- Soft deletion with restore capability
- Event-scoped access control via `UserEventAccess`
- Nested management: meetings, restrictions, workflows, invitations, templates

#### 3.3 Workflow Engine
- Linked-list step model with `nextStepId`
- 9 action types: APPROVE, REJECT, NOTIFY, PRINT, COLLECT, ARCHIVE, CANCEL, BYPASS, REPRINT
- Rejection and bypass target steps
- Role-based step assignment with SLA tracking
- Visual builder with React Flow and dagre auto-layout
- Workflow templates at tenant level, clonable to events

#### 3.4 Participant Registration & Tracking
- 30+ fields including personal data, travel, vehicle, visa needs
- Document management (passport, photo, letter)
- Registration code generation
- Status tracking through full lifecycle
- Quota enforcement per invitation constraints

#### 3.5 Invitation & Quota System
- Organization-level invitations with per-type quotas
- `InvitationConstraint` for granular access level control (OPEN/CLOSED)
- `Restriction` → `Constraint` for event-level quota policies
- Quota exemption flags per participant type

#### 3.6 Approval Workflow
- Role-filtered validator queues
- Step-level access control (UserEventAccess + stepId)
- Approval audit trail with remarks
- Admin overrides: advance, bypass, undo-bypass, admin-reject

#### 3.7 Badge System
- Template designer with drag-and-drop elements
- Element types: PHOTO, QR_CODE, TEXT, DYNAMIC_TEXT, IMAGE, SHAPE
- 3 default CR80/CR100/CR120 card sizes
- PDF generation for printing
- Reprint tracking with configurable limits

#### 3.8 Reporting & Analytics
- 5 predefined reports: Event Overview, Participant Summary, Invitation Usage, Validator Activity, Workflow Performance
- Custom report builder (data source, fields, filters, output)
- Excel/PDF export capabilities
- KPI cards with chart visualizations (Recharts)

#### 3.9 System Administration
- User management with bulk import
- Role & permission CRUD with matrix assignment
- Dynamic menu system (role-scoped navigation)
- System settings (auth, email, OTP, cache, SLA, reprint, backup, maintenance)
- Database backup with SQL dump generation, compression, Azure storage
- Audit log viewer with entity/action filtering
- System monitor dashboard

#### 3.10 Security
- Session-based authentication with browser fingerprinting
- Progressive account lockout (configurable thresholds)
- Two-factor authentication (TOTP)
- CSRF protection + honeypot fields
- Admin user impersonation (JWT, 60-second tokens)
- Comprehensive audit logging

#### 3.11 Operational CLIs
12 interactive CLI scripts for: user management, role/permission setup, workflow creation, country/title/meeting-type/participant-type management, password reset, photo download.

---

## 4. Database Design Analysis

### 4.1 Model Relationship Map

```
Tenant ──┬── Event ──┬── Meeting
         │           ├── Restriction ── Constraint
         │           ├── Workflow ── Step
         │           ├── Invitation ── InvitationConstraint
         │           ├── Participant ── ParticipantDocument
         │           │                  └── Approval
         │           ├── Template ── Attachment
         │           └── UserEventAccess
         │
         ├── Venue
         ├── MeetingType
         ├── ParticipantType
         ├── BadgeTemplate
         ├── WorkflowTemplate ── StepTemplate
         ├── AuditLog
         └── CustomReport

User ──┬── Password
       ├── UserImage
       ├── Session
       ├── Role ──── Permission
       ├── Approval
       ├── UserEventAccess
       └── AuditLog

Country ──── Participant (nationality + country)
Title ──── Participant
```

### 4.2 What's Done Well

| Pattern | Implementation |
|---------|---------------|
| **Soft deletes** | `deletedAt` on Event and Participant with indexes |
| **Tenant isolation** | `tenantId` FK + composite unique constraints on most models |
| **Linked-list workflow** | `nextStepId` on Step for flexible routing |
| **Comprehensive indexing** | Composite indexes on high-query paths (participant status, event+step, approval+time) |
| **Audit granularity** | 22 audit actions, 27 entity types, metadata JSON |
| **Configurable settings** | Database-backed with category/type/label, tenant override support |
| **Quota enforcement** | Multi-level: Restriction → Constraint + Invitation → InvitationConstraint |

### 4.3 Issues & Improvement Opportunities

#### Missing Indexes

| Table | Field(s) | Impact |
|-------|----------|--------|
| `Participant` | `titleId` | Slow joins with Title table |
| `Country` | `code`, `name` | Slow lookups for participant nationality/country |
| `Step` | `roleId` | Slow role-based step queries |
| `Event` | `tenantId` (standalone) | Slow tenant-scoped event lists |
| `Participant` | `registrationCode` | Already unique but explicit index aids query planner |

#### Schema Design Issues

1. **Self-referential `Step.nextStepId` lacks FK constraint** - Can point to steps in different workflows or nonexistent IDs, enabling circular references or orphaned links. Should add a self-referencing relation with optional cross-workflow validation at the application level.

2. **`Approval` unique constraint includes `createdAt`** - Allows same user to approve same participant at same step multiple times (just at different timestamps). This is likely intentional for re-approvals after rejection but should be documented. Consider adding an `isLatest` boolean for quick "current state" queries.

3. **JSON columns without schema validation** - `BadgeTemplate.elements`, `CustomReport.config`, `Tenant.featureFlags`, `Tenant.usageMetrics`, `Session.metadata` are untyped JSON. Validated at the application layer with Zod, but database-level CHECK constraints or a migration to JSONB with schema validation would add defense in depth.

4. **`Role.name` is globally unique** - Prevents tenants from defining custom role names. Should be `@@unique([tenantId, name])` with a nullable tenantId for system roles.

5. **Missing soft deletes on critical entities** - `WorkflowTemplate`, `Workflow`, `Step`, `User` lack `deletedAt`. Deleting a workflow template that existing event workflows were cloned from loses audit trail lineage.

6. **No versioning on Workflow/Step** - When a workflow is modified mid-event, participants already in the pipeline may be affected. A version field or snapshot mechanism would preserve workflow state at the time each participant entered it.

7. **`Participant.email` is optional but email notifications exist** - The workflow engine sends rejection and archive emails. If email is null, these silently fail. Should either require email or have an explicit "notification preference" field.

8. **Meeting composite unique is overly strict** - `[tenantId, eventId, meetingTypeId, venueId, accessLevel, startDate, endDate]` prevents any two meetings with identical attributes. However, this also prevents legitimate scenarios like splitting a meeting into two with the same type/venue/dates but different names.

#### Recommendations

- Add a `version` or `snapshotId` to `Workflow` for immutable workflow snapshots
- Add `deletedAt` to `Workflow`, `WorkflowTemplate`, `Step`, and `User`
- Add standalone indexes on all foreign keys that lack them
- Add a `Meeting.name` or `Meeting.title` field and include it in the unique constraint
- Consider replacing the linked-list `nextStepId` pattern with an adjacency table for complex branching (conditional routing based on participant attributes)

---

## 5. Security Audit

### 5.1 Current Security Measures

| Category | Implementation | Rating |
|----------|---------------|--------|
| **Authentication** | Session-based with browser fingerprint | Good |
| **Password Storage** | bcrypt with configurable salt rounds | Good |
| **Account Lockout** | Progressive lockout with auto-unlock | Good |
| **2FA** | TOTP-based, optional per user | Good |
| **CSRF** | Cookie-based tokens via remix-utils | Good |
| **Bot Protection** | Honeypot fields | Adequate |
| **Rate Limiting** | 3-tier (10/50/100 req/min) | Good |
| **Security Headers** | Helmet with strict CSP, HSTS, permissions-policy | Good |
| **Audit Logging** | Comprehensive with 22 action types | Excellent |
| **XSS Prevention** | xss + dompurify libraries installed | Good |
| **Suspicious Request Blocking** | Missing User-Agent/Accept → 403 | Good |

### 5.2 Vulnerabilities & Risks

#### Critical

1. **`.env` file committed to repository** - Contains Azure connection strings, database URL, session secrets, and impersonation secrets in plaintext. Even if `.gitignore` lists `.env`, the file exists in the working tree and may already be in git history. This is the most urgent security fix needed.

2. **Seed credentials documented in `.env` comments** - Default passwords for admin, tenantadmin, and all operational users are visible. If these aren't changed in production, the system is immediately compromised.

3. **Rate limiting excludes admin/validator/printer/dispatcher routes** - These are authenticated routes, but an attacker with a stolen session could perform unlimited requests. At minimum, a higher rate limit (not unlimited) should apply.

#### High

4. **No Content Security Policy nonce/hash for inline scripts** - CSP uses `'unsafe-inline'` for scripts and styles. This weakens XSS protection. Should migrate to nonce-based CSP.

5. **Impersonation system uses short-lived JWT but no IP binding** - The 60-second JWT could be intercepted and used from a different IP within the window. Consider binding tokens to the requesting IP.

6. **Browser fingerprinting is weak validation** - User-Agent + Accept-Language + sec-ch-ua headers can be spoofed. This provides marginal security against session hijacking but shouldn't be relied upon.

7. **No file upload scanning** - Documents (passport, photo, letter) are uploaded to Azure Blob Storage without malware scanning. A compromised document could be served to validators.

#### Medium

8. **Session fixation risk** - No evidence of session ID regeneration after privilege escalation (e.g., after 2FA verification).

9. **No password complexity enforcement at the database level** - Password validation appears to be client-side only. Server-side validation should enforce minimum length, complexity, and breached-password checking.

10. **SQL dump in backup system** - The backup system generates raw SQL. If an attacker gains access to backup files, they get the entire database including password hashes.

### 5.3 Security Recommendations

| Priority | Recommendation |
|----------|---------------|
| P0 | Remove `.env` from repository and rotate ALL secrets |
| P0 | Add `.env.example` with placeholder values |
| P0 | Change all default seed passwords in production |
| P1 | Implement nonce-based CSP for scripts |
| P1 | Add rate limiting to authenticated routes (higher threshold) |
| P1 | Implement file upload virus scanning (ClamAV or Azure Defender) |
| P1 | Add password complexity validation server-side |
| P2 | Add IP binding to impersonation tokens |
| P2 | Regenerate session ID after 2FA verification |
| P2 | Encrypt backup files at rest (AES-256) |
| P2 | Implement session revocation on password change |
| P3 | Add breached password checking (HaveIBeenPwned API) |
| P3 | Implement subresource integrity (SRI) for CDN assets |

---

## 6. Workflow Engine Analysis

### 6.1 Current Architecture

The workflow engine (`app/utils/workflow.server.ts`) implements a **linked-list state machine**:

```
Step A (APPROVE) → nextStepId → Step B (APPROVE) → nextStepId → Step C (PRINT) → ...
                ↓ REJECT
        Step with isRejectionTarget: true
                ↓ BYPASS
        Step with isBypassTarget: true
```

**`processParticipant(participantId, userId, action, remarks)`** is the core execution function that:
1. Looks up the participant's current step
2. Executes the action (APPROVE, REJECT, BYPASS, PRINT, COLLECT, NOTIFY, ARCHIVE)
3. Updates participant's status and stepId
4. Creates an Approval audit record
5. Triggers side effects (email, status update)

### 6.2 Strengths

- Simple, understandable model
- Visual builder makes workflows accessible to non-technical users
- Template system enables workflow reuse across events
- SLA tracking per step with configurable durations
- Admin bypass and advance capabilities for emergency situations

### 6.3 Limitations

1. **Linear-only flow** - The linked-list model only supports sequential steps. No conditional branching (e.g., "if participant type is VIP, skip step 3"), no parallel paths, no merge points.

2. **Single rejection target** - All rejections return to the same step regardless of where in the pipeline the rejection occurred. More sophisticated workflows need rejection to different steps based on context.

3. **No automatic escalation** - SLA durations are tracked but not enforced. When an SLA expires, no automatic action occurs (no auto-escalation, no notification, no reassignment).

4. **No step reassignment** - Once a participant reaches a step, it stays there until someone with the right role acts. There's no mechanism to reassign to a specific user or escalate to a supervisor.

5. **No conditional logic** - Steps cannot have conditions (e.g., "auto-approve if document score > 90%"). All steps require manual human action.

6. **No parallel steps** - Cannot have two approvals happen simultaneously (e.g., security check AND document verification in parallel, then merge).

7. **No webhook/integration triggers** - Steps cannot trigger external system calls (e.g., notify an external security system, trigger background checks).

8. **No batch operations at the workflow level** - Bulk approve/reject must be built per-route rather than being a first-class workflow capability.

9. **No workflow versioning** - Editing a live workflow affects all participants currently in the pipeline. No way to freeze a workflow version and let in-flight participants complete under the original rules.

### 6.4 Recommended Workflow Enhancements

#### Phase 1: Robustness

| Enhancement | Description |
|-------------|-------------|
| **Workflow versioning** | Snapshot workflow state when a participant enters. In-flight participants complete under their entry version. |
| **SLA enforcement** | Background job that checks overdue steps and triggers configurable actions (email alert, auto-escalate, auto-approve). |
| **Step reassignment** | Allow admins to reassign a participant to a specific user within the step's role. |
| **Batch actions** | First-class batch approve/reject/bypass with a single audit entry per batch. |

#### Phase 2: Advanced Routing

| Enhancement | Description |
|-------------|-------------|
| **Conditional transitions** | Steps can define conditions on participant attributes (type, country, access level) to route to different next steps. |
| **Multiple rejection targets** | Each step can define its own rejection target rather than a single global one. |
| **Parallel paths** | Support fork/join nodes where multiple approval paths execute simultaneously and merge at a gate step. |
| **Loop detection** | Database-level or application-level check to prevent circular step references. |

#### Phase 3: Automation & Integration

| Enhancement | Description |
|-------------|-------------|
| **Auto-action rules** | Define rules that automatically execute step actions (e.g., auto-approve known delegates from specific organizations). |
| **Webhook steps** | Step type that calls an external URL and uses the response to determine routing. |
| **Timer steps** | Steps that auto-advance after a configurable delay (useful for notification waiting periods). |
| **Integration triggers** | On-step-enter and on-step-exit hooks for external system notification. |

---

## 7. Infrastructure & DevOps Assessment

### 7.1 Current State

| Aspect | Status | Notes |
|--------|--------|-------|
| **Containerization** | Missing | No Dockerfile or docker-compose |
| **CI/CD** | Missing | No GitHub Actions, GitLab CI, or other pipeline |
| **Testing** | Missing | Zero test files despite MSW + faker installed |
| **Monitoring** | Minimal | Morgan logging + custom monitor page |
| **APM** | Missing | No application performance monitoring |
| **Error Tracking** | Missing | No Sentry, Bugsnag, or similar |
| **Log Aggregation** | Missing | Console-only logging |
| **Environment Management** | Weak | Single `.env` file, no staging config |
| **Database Migrations** | Present | Prisma migrate dev |
| **Backup** | Present | SQL dump + Azure Blob Storage |
| **Health Check** | Present | `/up` endpoint |
| **Pre-commit Hooks** | Missing | No Husky or lint-staged |

### 7.2 Recommendations

#### Testing Strategy

```
Priority 1 - Unit Tests
├── Workflow engine (processParticipant with all action types)
├── Authentication functions (login, lockout, fingerprint)
├── Permission checking (requireUserWithPermission, requireAdminAccess)
├── Quota calculation logic
├── Report data aggregation
└── Backup SQL generation

Priority 2 - Integration Tests
├── Route loaders and actions (Remix testing utilities)
├── Database operations (Prisma with test database)
├── Email sending (MSW mocks)
└── File upload/download (Azure mock)

Priority 3 - E2E Tests
├── Login → approval workflow → badge print → collection
├── Event creation → workflow setup → participant registration
├── Admin operations (user management, settings)
└── Role-based access verification
```

**Recommended Framework:** Vitest (native Vite integration, faster than Jest for this stack).

#### Container & Deployment

```dockerfile
# Recommended Dockerfile structure
FROM node:20-alpine AS base
FROM base AS deps          # Install dependencies
FROM base AS build         # Build application
FROM base AS production    # Minimal production image
```

```yaml
# docker-compose.yml for local development
services:
  app:
    build: .
    ports: ["8080:8080"]
    depends_on: [db, storage]
  db:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
  storage:
    image: mcr.microsoft.com/azure-storage/azurite
```

#### CI/CD Pipeline

```yaml
# Recommended GitHub Actions workflow
on: [push, pull_request]
jobs:
  quality:
    - typecheck
    - lint
    - format check
  test:
    - unit tests
    - integration tests (with test database)
  build:
    - docker build
    - image scanning (Trivy)
  deploy:
    - staging (on merge to develop)
    - production (on merge to main, with approval gate)
```

#### Observability Stack

| Tool | Purpose |
|------|---------|
| **Sentry** | Error tracking and performance monitoring |
| **Pino** | Structured JSON logging (replace Morgan + console.log) |
| **Prometheus + Grafana** | Metrics (request latency, error rates, queue depths) |
| **Azure Application Insights** | Cloud-native APM (since already on Azure) |

---

## 8. UI/UX Assessment

### 8.1 Component Library Quality

The UI is built on a solid foundation of Radix UI primitives with Tailwind CSS styling and CVA (class-variance-authority) for variant management. 32 UI components, 9 Conform form wrappers, and several domain-specific component sets (workflow builder, badge designer, wizard) provide comprehensive coverage.

**Strengths:**
- Consistent design tokens via CSS variables
- Compound component pattern (Card/CardHeader/CardTitle etc.)
- Accessibility via Radix primitives (ARIA, keyboard nav, focus management)
- Type-safe props with React.forwardRef throughout
- StatusButton with loading/success/error states

**Weaknesses:**
- No design system documentation (Storybook or similar)
- No dark mode implementation despite `darkMode: ['class']` in Tailwind config
- No responsive breakpoint testing evidence
- No loading skeleton components for perceived performance

### 8.2 UX Issues Identified

1. **No real-time updates** - Validators must manually refresh to see new requests. In a high-volume event, this creates delays and confusion about who is working on what.

2. **No mobile experience for field operations** - Validators, printers, and dispatchers often work on-site. The current desktop-first UI is impractical for handheld devices or tablets.

3. **No offline capability** - Event venues may have unreliable internet. Badge printers and dispatchers need offline queueing.

4. **No collaborative indicators** - Two validators can view and act on the same participant simultaneously with no conflict detection, potentially causing double-approvals or race conditions.

5. **No participant search across events** - Finding a participant requires navigating to the correct event first. Cross-event search would help operations staff.

6. **305 route files with deep nesting** - Navigation depth like `admin/tenants/$id/workflow-templates/$id/steps/visual/$id` creates cognitive load. Breadcrumbs exist but the information architecture could be flattened.

7. **No keyboard shortcuts** - Power users (validators processing high volumes) would benefit from keyboard-driven approval workflows (e.g., press `A` to approve, `R` to reject).

### 8.3 Recommendations

| Category | Enhancement |
|----------|-------------|
| **Real-time** | Server-Sent Events (SSE) for live request queue updates |
| **Mobile** | Progressive Web App (PWA) with responsive validator/printer/dispatcher views |
| **Offline** | Service Worker with IndexedDB queue for badge collection and printing |
| **Collaboration** | Optimistic locking with "being reviewed by X" indicators |
| **Search** | Global search bar with cross-event participant/invitation lookup |
| **Productivity** | Keyboard shortcuts for common validator actions |
| **Loading** | Skeleton screens for data-heavy pages |
| **Documentation** | Storybook for component library documentation |

---

## 9. Critical Issues

### Priority 0 (Fix Immediately)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 1 | `.env` with secrets in repository | Full system compromise if repo is exposed | Low |
| 2 | Default seed passwords unchanged in production | Unauthorized admin access | Low |
| 3 | Zero automated tests | No confidence in changes, regression risk | High |

### Priority 1 (Fix Before Next Release)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 4 | No CI/CD pipeline | Manual, error-prone deployments | Medium |
| 5 | No error tracking (Sentry) | Silent production failures | Low |
| 6 | No file upload malware scanning | Potential malware distribution | Medium |
| 7 | Rate limiting gaps on authenticated routes | DoS potential | Low |
| 8 | No workflow versioning | Mid-event workflow edits break in-flight participants | High |
| 9 | CSP uses `unsafe-inline` | Weakened XSS protection | Medium |

### Priority 2 (Improve Soon)

| # | Issue | Impact | Effort |
|---|-------|--------|--------|
| 10 | No real-time updates | Validator workflow delays | Medium |
| 11 | No mobile interface | On-site operations hampered | High |
| 12 | Missing database indexes | Performance degradation at scale | Low |
| 13 | No structured logging | Difficult production debugging | Medium |
| 14 | No internationalization | Limited to English-speaking operators | High |

---

## 10. Enhancement Recommendations

### 10.1 Database Enhancements

```prisma
// 1. Add workflow versioning
model WorkflowVersion {
  id          String   @id @default(cuid())
  workflowId  String
  version     Int
  snapshot    Json     // Full serialized workflow + steps
  createdAt   DateTime @default(now())
  workflow    Workflow  @relation(fields: [workflowId], references: [id])
  participants Participant[]

  @@unique([workflowId, version])
}

// 2. Add soft deletes where missing
model Workflow {
  // ... existing fields
  deletedAt   DateTime?
  @@index([deletedAt])
}

// 3. Add notification preferences
model NotificationPreference {
  id            String   @id @default(cuid())
  userId        String
  channel       NotificationChannel  // EMAIL, SMS, PUSH
  enabled       Boolean  @default(true)
  user          User     @relation(fields: [userId], references: [id])

  @@unique([userId, channel])
}

// 4. Add step assignment tracking
model StepAssignment {
  id            String   @id @default(cuid())
  participantId String
  stepId        String
  assignedTo    String   // userId
  assignedBy    String   // userId
  assignedAt    DateTime @default(now())
  completedAt   DateTime?

  @@index([assignedTo, completedAt])
}

// 5. Add missing indexes
// Participant.titleId, Country.code, Country.name, Step.roleId
```

### 10.2 Workflow Engine Enhancements

```typescript
// SLA enforcement background job
async function checkOverdueSLAs() {
  const overdueParticipants = await prisma.participant.findMany({
    where: {
      status: { in: ['PENDING', 'INPROGRESS'] },
      step: { slaDurationMinutes: { not: null } },
    },
    include: { step: true, approvals: { orderBy: { createdAt: 'desc' }, take: 1 } },
  })

  for (const p of overdueParticipants) {
    const lastAction = p.approvals[0]?.createdAt ?? p.createdAt
    const slaDeadline = addMinutes(lastAction, p.step.slaDurationMinutes!)
    if (isAfter(new Date(), slaDeadline)) {
      await escalateParticipant(p.id, p.step)
    }
  }
}

// Conditional routing
interface StepCondition {
  field: string        // e.g., "participantType.name"
  operator: 'equals' | 'in' | 'notIn' | 'contains'
  value: string | string[]
  nextStepId: string
}
```

### 10.3 Real-Time Updates

```typescript
// Server-Sent Events for validator queue
// app/routes/validator+/requests+/stream.tsx
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUserWithRoles(request, ['validator', 'reviewer'])
  const accessibleStepIds = await getUserAccessibleStepIds(user.id, user.roles)

  return eventStream(request.signal, (send) => {
    const interval = setInterval(async () => {
      const counts = await getQueueCounts(accessibleStepIds)
      send({ event: 'queue-update', data: JSON.stringify(counts) })
    }, 5000)

    return () => clearInterval(interval)
  })
}
```

### 10.4 API Layer for External Integrations

```typescript
// app/routes/api+/v1+/
// RESTful API with API key authentication

// api/v1/events - List events
// api/v1/events/$eventId/participants - List participants
// api/v1/events/$eventId/participants/$id - Get participant
// api/v1/events/$eventId/participants/$id/approve - Approve participant
// api/v1/webhooks - Webhook subscription management

// Authentication: API key in X-API-Key header
// Rate limiting: Separate tier for API consumers
// Response format: JSON with pagination metadata
```

### 10.5 Internationalization

```typescript
// Recommended approach: remix-i18next
// Languages needed for AU context: English, French, Arabic, Portuguese

// File structure:
// public/locales/en/common.json
// public/locales/fr/common.json
// public/locales/ar/common.json
// public/locales/pt/common.json

// Key areas to internationalize:
// - UI labels and buttons
// - Email templates
// - Badge text elements
// - Error messages
// - Workflow step names (configurable per locale)
// - Report labels and descriptions
```

---

## 11. New Feature Proposals

### 11.1 Check-In/Access Control System

**Problem:** No way to verify badge holders at meeting entrances or restricted areas.

**Solution:**
- QR code scanner integration at meeting/venue entry points
- Real-time access verification against participant's access level (OPEN/CLOSED)
- Entry/exit logging for capacity management
- Mobile-first scanner interface for security staff
- Dashboard showing real-time venue occupancy

```prisma
model AccessLog {
  id              String   @id @default(cuid())
  participantId   String
  meetingId       String
  scanType        ScanType // ENTRY, EXIT
  scanResult      ScanResult // ALLOWED, DENIED_QUOTA, DENIED_ACCESS, DENIED_INVALID
  scannedBy       String   // userId
  scannedAt       DateTime @default(now())

  @@index([meetingId, scannedAt])
  @@index([participantId, scannedAt])
}
```

### 11.2 Delegation Management Portal

**Problem:** Focal points (delegation heads) have no self-service portal to manage their delegation's registrations.

**Solution:**
- Self-service portal for focal points to:
  - View invitation quotas and usage
  - Register participants within their quota
  - Upload required documents
  - Track approval status of their participants
  - Request quota increases
  - Manage participant replacements
- Separate from admin interface; accessible to `focal` role users

### 11.3 Document Verification AI

**Problem:** Validators manually verify passport photos, identity documents, and invitation letters. This is slow and error-prone.

**Solution:**
- Automated document quality checks (resolution, face detection, readability)
- OCR extraction of passport data fields for auto-population
- Duplicate detection across participants (same passport, same photo)
- Confidence scoring to prioritize manual review for low-confidence submissions
- Integration with external identity verification services

### 11.4 Notification Center

**Problem:** Participants and validators have no in-app notification system. Status changes are communicated only via email (which may not be configured for all participants).

**Solution:**
```prisma
model Notification {
  id          String             @id @default(cuid())
  userId      String
  type        NotificationType   // APPROVAL, REJECTION, SLA_WARNING, SYSTEM
  title       String
  body        String
  readAt      DateTime?
  metadata    Json?
  createdAt   DateTime           @default(now())

  @@index([userId, readAt, createdAt])
}
```
- In-app notification bell with unread count
- Real-time push via SSE
- Configurable notification preferences (email, in-app, both, none)
- Digest emails for low-priority notifications

### 11.5 Participant Self-Service Kiosk Mode

**Problem:** At large events, participants queue to check their status or collect badges from dispatchers.

**Solution:**
- Kiosk mode UI (touch-friendly, large text)
- Participant lookup by registration code or passport scan
- Status display with next-step information
- Self-service badge collection with identity verification
- Queue management with estimated wait times

### 11.6 Advanced Analytics Dashboard

**Problem:** Current reports are static exports. No real-time operational dashboard for event managers.

**Solution:**
- Real-time dashboard with:
  - Registration velocity (registrations per hour)
  - Approval pipeline visualization (funnel chart)
  - SLA compliance heatmap
  - Geographic distribution map
  - Validator workload balancing view
  - Bottleneck alerts
- Auto-refresh with SSE
- Configurable dashboard widgets
- PDF snapshot export for daily briefings

### 11.7 Multi-Event Calendar & Scheduling

**Problem:** Events are managed independently. No calendar view or scheduling conflict detection.

**Solution:**
- Calendar view of all events across tenants
- Meeting scheduling with venue conflict detection
- Participant schedule builder (which meetings they'll attend)
- Calendar export (iCal/Google Calendar)
- Automatic time zone handling for international events

### 11.8 Template Marketplace

**Problem:** Each tenant creates badge templates and workflow templates from scratch.

**Solution:**
- Cross-tenant template sharing marketplace
- Template categories (badge, workflow, report)
- Template versioning and previews
- Rating and usage statistics
- Admin approval for published templates

### 11.9 Bulk Operations Center

**Problem:** Bulk operations are scattered across different routes (bulk-create workflows, bulk-remove, bulk-collect). No unified interface.

**Solution:**
- Centralized bulk operations page
- CSV import/export for participants, invitations, users
- Bulk status changes with preview and confirmation
- Undo capability for bulk operations (within time window)
- Progress tracking for long-running bulk jobs
- Operation history with rollback option

### 11.10 Communication Hub

**Problem:** Communication with participants is limited to automated workflow emails.

**Solution:**
- Broadcast messaging to filtered participant groups
- SMS integration for urgent communications
- Email template builder with rich text editor
- Scheduled sends
- Delivery tracking and bounce handling
- Pre-event information campaigns
- Emergency broadcast capability

---

## 12. Prioritized Roadmap

### Phase 0: Foundation (Immediate)

| Item | Category | Description |
|------|----------|-------------|
| Security hardening | Security | Remove `.env` from repo, rotate secrets, add `.env.example` |
| Testing framework | Quality | Set up Vitest, write workflow engine tests |
| CI/CD pipeline | DevOps | GitHub Actions for lint + typecheck + test + build |
| Dockerization | DevOps | Dockerfile + docker-compose for reproducible environments |
| Error tracking | Observability | Sentry integration |
| Structured logging | Observability | Replace console.log/Morgan with Pino |
| Missing indexes | Performance | Add indexes identified in database analysis |
| Pre-commit hooks | Quality | Husky + lint-staged for consistent commits |

### Phase 1: Reliability & Performance

| Item | Category | Description |
|------|----------|-------------|
| Workflow versioning | Core | Snapshot workflows when participants enter |
| SLA enforcement | Core | Background job for overdue SLA detection + alerting |
| Real-time updates | UX | SSE for validator/printer/dispatcher queues |
| Nonce-based CSP | Security | Replace `unsafe-inline` with nonces |
| File upload scanning | Security | ClamAV or Azure Defender for document uploads |
| Rate limiting completeness | Security | Add limits to authenticated routes |
| Optimistic locking | Data | Prevent concurrent actions on same participant |
| Database backup encryption | Security | AES-256 for backup files |

### Phase 2: User Experience

| Item | Category | Description |
|------|----------|-------------|
| Mobile-responsive views | UX | PWA for validator, printer, dispatcher |
| Keyboard shortcuts | UX | Hotkeys for approval workflow |
| Global search | UX | Cross-event participant search |
| Notification center | Feature | In-app notifications with preferences |
| Skeleton loading | UX | Loading states for data-heavy pages |
| Offline mode | UX | Service Worker for badge collection/printing |
| Delegation portal | Feature | Focal point self-service |
| Storybook | Dev | Component library documentation |

### Phase 3: Intelligence & Scale

| Item | Category | Description |
|------|----------|-------------|
| Conditional workflow routing | Core | Route participants based on attributes |
| Parallel workflow paths | Core | Fork/join for simultaneous approvals |
| Document verification AI | Feature | Quality checks, OCR, duplicate detection |
| Advanced analytics dashboard | Feature | Real-time operational intelligence |
| Check-in/access control | Feature | QR scanner + venue access management |
| API layer | Platform | REST API for external integrations |
| Internationalization | UX | English, French, Arabic, Portuguese |

### Phase 4: Ecosystem

| Item | Category | Description |
|------|----------|-------------|
| Webhook integrations | Platform | External system notifications |
| Template marketplace | Feature | Cross-tenant template sharing |
| Kiosk mode | Feature | Self-service participant terminal |
| Communication hub | Feature | Broadcast messaging + SMS |
| Bulk operations center | Feature | Unified bulk operation interface |
| Calendar & scheduling | Feature | Multi-event calendar with conflict detection |
| Auto-action rules | Core | Rule-based automatic workflow actions |

---

## 13. Dynamic Schema Architecture - Making Events & Participants Fully Configurable

### 13.1 The Problem

Today, every participant form field is **hardcoded in three places** that require a developer to change:

**A. A developer adds a column to the Prisma schema:**
```prisma
model Participant {
  needsVisa  Boolean?   // ← developer writes this
}
```

**B. A developer runs a database migration:**
```bash
npx prisma migrate dev  # ← developer runs this
```

**C. A developer writes JSX in the form component:**
```tsx
<CheckboxField meta={fields.needsVisa} />  // ← developer writes this
```

This means **every new field requires a developer, a code change, a migration, and a deployment**. For 27 participant types that each need different fields across multiple tenants running different kinds of events, this does not scale.

The current `Participant` model has **35+ columns** hardcoded into the Prisma schema. Many of these are specific to the African Union summit use case:

| Category | Static Fields | Problem |
|----------|--------------|---------|
| **Travel/Logistics** | `needsVisa`, `needsCarPass`, `vehicleType`, `vehiclePlateNumber`, `needsCarFromOrganizer`, `flightNumber`, `arrivalDate` | A tech conference doesn't need visa or vehicle fields |
| **Session Access** | `attendClosedSession`, `attendExecutiveCouncilClosedSession` | Only relevant to AU-style events with closed sessions |
| **Collection** | `collectedBy`, `collectedByPhone`, `collectionNotes`, `collectedAt` | Some events use digital badges, no physical collection |
| **Identity** | `passportNumber`, `passportExpiry` | Domestic events may only need national ID |
| **Misc** | `wishList` | Extremely domain-specific |

Similarly, the `Event` model lacks customizable metadata - a music festival needs capacity/ticket-type fields that a diplomatic summit doesn't, and vice versa.

**The 27 participant types** (Minister, Driver, Press/Media, Armed Security, etc.) all share the same schema. But an "Armed Security" participant needs weapon permit details, while a "Press/Media" participant needs press card and outlet information. Today, there's no way to define type-specific fields.

### 13.2 The Solution: Field Definitions (Concept Explained)

A **field definition** is a database record that describes a form field. Instead of a developer hardcoding the field in Prisma and JSX, an **admin creates it through a UI** at runtime - no code, no migration, no deployment.

Think of it as a **recipe card** that tells the system: "render this form field, with this validation, for this participant type."

#### What a Field Definition Record Looks Like

One row in a `CustomFieldDef` database table:

```
┌──────────────────┬──────────────────────────────────────────────┐
│  id              │  "cuid_abc123"                               │
│  tenantId        │  "african_union_tenant_id"                   │
│  eventId         │  "38th_summit_event_id"                      │
│  participantTypeId│ null  (null = show for ALL types)           │
│                  │                                              │
│  name            │  "needs_visa"         ← key in JSON storage │
│  label           │  "Needs Visa?"        ← what user sees      │
│  dataType        │  "BOOLEAN"            ← renders a checkbox  │
│  isRequired      │  false                                       │
│  sortOrder       │  10                   ← position on form    │
│                  │                                              │
│  config          │  {}                   ← no extra config     │
│  uiConfig        │  {"section": "Travel Information"}           │
└──────────────────┴──────────────────────────────────────────────┘
```

Another row, but this one **only appears for Armed Security participants**:

```
┌──────────────────┬──────────────────────────────────────────────┐
│  id              │  "cuid_def456"                               │
│  tenantId        │  "african_union_tenant_id"                   │
│  eventId         │  "38th_summit_event_id"                      │
│  participantTypeId│ "armed_security_type_id"  ← ONLY this type │
│                  │                                              │
│  name            │  "weapon_serial"                             │
│  label           │  "Weapon Serial Number"                      │
│  dataType        │  "TEXT"                ← renders text input  │
│  isRequired      │  true                 ← mandatory!          │
│  sortOrder       │  20                                          │
│                  │                                              │
│  config          │  {"maxLength": 20,                           │
│                  │   "pattern": "^[A-Z0-9-]+$"}                │
│  uiConfig        │  {"section": "Security Details",             │
│                  │   "placeholder": "e.g., AK-2024-00123"}     │
└──────────────────┴──────────────────────────────────────────────┘
```

#### Where the Data Is Stored

Today, each custom field is a separate **column** on the Participant table:

```
Participant Table (today - 35+ columns):
┌────┬───────────┬────────────┬───────────┬──────────────────┬─────────────┐
│ id │ firstName │ familyName │ needsVisa │ vehiclePlateNumber│ weaponSerial│
├────┼───────────┼────────────┼───────────┼──────────────────┼─────────────┤
│ 1  │ John      │ Doe        │ true      │ null             │ null        │
│ 2  │ Jane      │ Smith      │ false     │ ABC-123          │ null        │
│ 3  │ Guard     │ One        │ null      │ null             │ AK-2024-001 │
└────┴───────────┴────────────┴───────────┴──────────────────┴─────────────┘
```

With the new approach, core fields (needed by every event) stay as columns, but event/type-specific fields go into a **single JSON column** called `customData`:

```
Participant Table (new - clean core columns + flexible JSON):
┌────┬───────────┬────────────┬───────────────────────────────────────────────┐
│ id │ firstName │ familyName │ customData (one JSON column)                  │
├────┼───────────┼────────────┼───────────────────────────────────────────────┤
│ 1  │ John      │ Doe        │ {"needs_visa": true}                         │
│ 2  │ Jane      │ Smith      │ {"needs_visa": false, "plate_number": "ABC"} │
│ 3  │ Guard     │ One        │ {"weapon_serial": "AK-2024-001"}             │
└────┴───────────┴────────────┴───────────────────────────────────────────────┘
```

The JSON column only contains the fields that were **defined for that event and participant type**. No nulls, no wasted columns.

#### How It Flows End-to-End

**Step 1: Admin defines a field** (through a UI, no code)

The admin goes to Event Settings > Custom Fields > Add Field and fills out a form:
- Label: "Weapon Serial Number"
- Type: Text
- Applies To: Armed Security (dropdown of participant types)
- Required: Yes
- Max Length: 20
- Section: "Security Details"

This creates a row in the `CustomFieldDef` table. **No developer. No deployment. No migration.**

**Step 2: Route loader fetches field definitions alongside participant data**

```typescript
export async function loader({ request, params }: LoaderFunctionArgs) {
  const participant = await prisma.participant.findUnique({
    where: { id: params.participantId },
  })

  // NEW: Fetch which fields apply to this event + participant type
  const customFieldDefs = await prisma.customFieldDef.findMany({
    where: {
      eventId: participant.eventId,
      OR: [
        { participantTypeId: null },                         // fields for ALL types
        { participantTypeId: participant.participantTypeId }, // fields for THIS type
      ],
    },
    orderBy: { sortOrder: 'asc' },
  })

  return json({ participant, customFieldDefs })
}
```

**Step 3: System auto-builds a Zod validation schema from the definitions**

Instead of a developer writing this by hand:
```typescript
// Today (manual):
const schema = z.object({
  needsVisa: z.boolean().optional(),
  weaponSerial: z.string().min(1).max(20).regex(/^[A-Z0-9-]+$/),
})
```

The system generates it from the field definition records:
```typescript
// New (automatic):
function buildSchema(fieldDefs) {
  const shape = {}
  for (const field of fieldDefs) {
    if (field.dataType === 'TEXT') {
      let s = z.string()
      if (field.config.maxLength) s = s.max(field.config.maxLength)
      if (field.config.pattern)   s = s.regex(new RegExp(field.config.pattern))
      shape[field.name] = field.isRequired ? s : s.optional()
    }
    if (field.dataType === 'BOOLEAN')
      shape[field.name] = z.boolean().optional()
    if (field.dataType === 'ENUM')
      shape[field.name] = z.enum(field.config.options.map(o => o.value))
    // ... each dataType maps to a Zod type
  }
  return z.object(shape)
}
```

**Step 4: Form renders the right components by looping over definitions**

The project already has all the form components needed (`InputField`, `SelectField`, `CheckboxField`, `DatePickerField`, `TextareaField`, `FileInputField`). The dynamic renderer just picks which one to use based on `dataType`:

```tsx
{customFieldDefs.map(fieldDef => {
  const meta = customFields[fieldDef.name]

  switch (fieldDef.dataType) {
    case 'TEXT':
      return <InputField key={fieldDef.name} meta={meta} type="text"
                         placeholder={fieldDef.uiConfig.placeholder} />
    case 'BOOLEAN':
      return <CheckboxField key={fieldDef.name} meta={meta} />
    case 'ENUM':
      return <SelectField key={fieldDef.name} meta={meta}
                          items={fieldDef.config.options}
                          placeholder={`Select ${fieldDef.label}`} />
    case 'DATE':
      return <DatePickerField key={fieldDef.name} meta={meta} />
    case 'LONG_TEXT':
      return <TextareaField key={fieldDef.name} meta={meta} />
    case 'FILE':
      return <FileInputField key={fieldDef.name} meta={meta} />
  }
})}
```

The mapping between `dataType` and existing components:

| `dataType` in Definition | Existing Component Used | What Renders |
|--------------------------|------------------------|--------------|
| `TEXT` | `<InputField type="text">` | Text input |
| `NUMBER` | `<InputField type="number">` | Number input |
| `BOOLEAN` | `<CheckboxField>` | Checkbox |
| `DATE` | `<DatePickerField>` | Calendar picker |
| `ENUM` | `<SelectField>` | Dropdown |
| `MULTI_ENUM` | `<CheckboxGroupField>` | Checkbox table |
| `LONG_TEXT` | `<TextareaField>` | Textarea |
| `FILE` | `<FileInputField>` | File upload |

**No new UI components needed.** The renderer just picks from the existing library.

**Step 5: Action saves values into the `customData` JSON column**

```typescript
export async function action({ request, params }: ActionFunctionArgs) {
  const formData = await request.formData()
  const customFieldDefs = await getFieldDefsForParticipant(params.participantId)
  const customSchema = buildSchema(customFieldDefs)

  const submission = parseWithZod(formData, { schema: customSchema })
  if (submission.status !== 'success') return json({ errors: submission.reply() })

  await prisma.participant.update({
    where: { id: params.participantId },
    data: {
      customData: submission.value,
      // saves: {"needs_visa": true, "weapon_serial": "AK-2024-001"}
    },
  })
}
```

#### Before vs After Summary

```
BEFORE (today):                          AFTER (with field definitions):

Developer adds Prisma column             Admin clicks "Add Field" in UI
        ↓                                        ↓
Developer runs migration                 Row created in CustomFieldDef table
        ↓                                        ↓
Developer writes JSX                     System reads definitions at runtime
        ↓                                        ↓
Developer deploys                        System auto-builds Zod schema
        ↓                                        ↓
Field appears in form                    System auto-renders correct component
                                                  ↓
                                         Data saved to customData JSON

Time: hours to days                      Time: seconds
Requires: developer                      Requires: admin user
```

#### What This Means for Different Tenants

**AU Summit admin** configures their event with: passport fields, visa, vehicle plates, closed session attendance, weapon permits for security, press cards for media.

**Tech Conference admin** (same software, different tenant) configures: t-shirt size, workshop selections, dietary requirements, GitHub username.

**Music Festival admin** configures: wristband color, camping zone, emergency contact, medical conditions.

All three use the **same deployed application**. No developer involved. Each tenant only sees the fields relevant to their event.

### 13.3 Industry Approaches - Comparison Matrix

| Pattern | How It Works | Query Complexity | Schema Change Cost | Type Safety | Prisma Compat | Used By |
|---------|-------------|-----------------|-------------------|-------------|---------------|---------|
| **Salesforce Slots** | 500 generic VARCHAR columns (`value0`...`value499`) mapped via metadata | Medium | Zero (metadata INSERT) | None (all strings) | Poor | Salesforce |
| **EAV (Entity-Attribute-Value)** | Separate rows per field value, typed tables per data type | Very High (N JOINs per N fields) | Zero (metadata INSERT) | Good (typed tables) | Poor | Magento, Jira |
| **Pure JSONB** | All data in a single JSONB column | Low | Zero | None (app layer) | Good | Airtable |
| **Hybrid (Fixed + JSONB)** | Core columns stay fixed, custom fields in JSONB | Low for core, Medium for custom | Normal for core, Zero for custom | Strong for core | Excellent | Shopify, GitHub |
| **Schema-per-Tenant** | Each tenant gets its own PostgreSQL schema with real DDL | Low (real SQL) | High (DDL operations) | Full | Very Poor | Regulated industries |
| **Virtual Tables** | Metadata defines tables/columns, universal JSONB storage | Medium | Zero | None (app layer) | Fair | Notion, Monday.com |

### 13.4 How Salesforce Actually Works (For Reference)

Salesforce's architecture (documented in their 2009 SIGMOD paper) uses a **universal storage table** with ~500 generic `VARCHAR(4000)` columns:

```
mt_data table:
┌──────────┬──────────┬───────────┬──────────┬──────────┬──────────┐
│ org_id   │ obj_id   │ value0    │ value1   │ value2   │ value3...│
├──────────┼──────────┼───────────┼──────────┼──────────┼──────────┤
│ ORG_001  │ Invoice  │ INV-0042  │ 5000.00  │ active   │ 2026-03  │
│ ORG_001  │ Invoice  │ INV-0043  │ 1200.00  │ draft    │ 2026-04  │
│ ORG_001  │ Contact  │ John Doe  │ john@... │ VP Sales │ USA      │
└──────────┴──────────┴───────────┴──────────┴──────────┴──────────┘

mt_fields table (metadata):
┌──────────┬──────────┬───────────────┬──────────┬──────────┐
│ org_id   │ obj_id   │ field_name    │ slot_num │ data_type│
├──────────┼──────────┼───────────────┼──────────┼──────────┤
│ ORG_001  │ Invoice  │ InvoiceNumber │ 0        │ TEXT     │
│ ORG_001  │ Invoice  │ Amount        │ 1        │ CURRENCY │
│ ORG_001  │ Invoice  │ Status        │ 2        │ PICKLIST │
│ ORG_001  │ Invoice  │ DueDate       │ 3        │ DATE     │
└──────────┴──────────┴───────────────┴──────────┴──────────┘
```

**Key insight:** Creating a "Custom Field" in Salesforce is just an INSERT into the metadata table, not a DDL ALTER TABLE. This makes schema changes instant, non-locking, and safe in multi-tenant environments.

Salesforce handles performance through **separate pivot index tables** with properly-typed columns, and a **custom query optimizer** that rewrites user queries (SOQL) into internal SQL using slot mappings.

This is brilliant engineering at massive scale, but overkill for most applications.

### 13.5 Recommended Architecture: Hybrid Approach

For this accreditation system, the **Hybrid Approach** is the clear winner because:

1. **Prisma compatibility** - Core columns remain in the Prisma schema with full type safety
2. **Zero migration for custom fields** - Adding per-event fields is a metadata operation
3. **Performance** - Fixed columns use standard B-tree indexes; JSONB uses GIN + expression indexes
4. **Query simplicity** - No EAV JOIN explosion (which crippled Jira at scale)
5. **Incremental adoption** - Can migrate domain-specific fields gradually without breaking existing code

#### Architecture Overview

```
┌─────────────────────────────────────────────────────────────┐
│                    METADATA LAYER                           │
│  ┌─────────────────┐  ┌──────────────────────────────────┐ │
│  │ CustomObjectDef  │  │ CustomFieldDef                   │ │
│  │ ─────────────── │  │ ──────────────                   │ │
│  │ name: "Event"   │  │ object: "Participant"            │ │
│  │ scope: event    │  │ scope: event + participantType   │ │
│  │ fields: [...]   │  │ name: "weaponPermitNumber"       │ │
│  │ layout: {...}   │  │ type: text                       │ │
│  └─────────────────┘  │ required: true                   │ │
│                        │ validation: {pattern: "WP-\\d+"} │ │
│                        │ uiConfig: {section: "Security"}  │ │
│                        └──────────────────────────────────┘ │
├─────────────────────────────────────────────────────────────┤
│                    STORAGE LAYER                            │
│  ┌──────────────────────────────────────────────────┐      │
│  │ Participant (Prisma Model)                        │      │
│  │ ─────────────────────────────                     │      │
│  │ FIXED: id, firstName, familyName, email, status,  │      │
│  │        participantTypeId, stepId, eventId, ...     │      │
│  │                                                    │      │
│  │ FLEXIBLE: customData JSONB = {                     │      │
│  │   "weaponPermitNumber": "WP-2026-0042",           │      │
│  │   "securityClearanceLevel": 3,                     │      │
│  │   "pressCardNumber": null,                         │      │
│  │   "dietaryRequirements": "vegetarian"              │      │
│  │ }                                                  │      │
│  └──────────────────────────────────────────────────┘      │
├─────────────────────────────────────────────────────────────┤
│                   VALIDATION LAYER                          │
│  Dynamic Zod schema built from CustomFieldDef metadata     │
│  → Integrated with existing Conform form handling          │
├─────────────────────────────────────────────────────────────┤
│                   RENDERING LAYER                           │
│  Dynamic form renderer reads CustomFieldDef + layout       │
│  → Emits existing Conform field components (InputField,    │
│    SelectField, DatePickerField, CheckboxField, etc.)      │
├─────────────────────────────────────────────────────────────┤
│                   QUERY LAYER                               │
│  Fixed fields: Standard Prisma queries                     │
│  Custom fields: JSONB operators + expression indexes       │
│  Reports: Raw SQL for custom field aggregations            │
└─────────────────────────────────────────────────────────────┘
```

### 13.6 Proposed Database Schema

#### New Models

```prisma
// ─── CUSTOM OBJECT DEFINITIONS ───────────────────────────────

/// Defines a custom entity type that a tenant can create
/// (e.g., "Vehicle", "Accommodation", "SecurityDetail")
model CustomObjectDef {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  name        String                // Display name: "Security Detail"
  slug        String                // API name: "security_detail"
  description String?
  icon        String?               // Lucide icon name
  color       String?               // Hex color for UI

  // Scoping: does this object exist globally for the tenant,
  // or is it created per-event?
  scope       ObjectScope @default(EVENT)  // TENANT | EVENT

  // Permissions
  permissions Json      @default("{}")
  // {"create": ["admin","focal"], "read": ["admin","validator"], ...}

  // UI layout definitions
  listLayout  Json      @default("{}")
  // {"columns": ["name","status"], "defaultSort": {"field":"createdAt","dir":"desc"}}

  detailLayout Json     @default("{}")
  // {"sections": [{"label":"Basic Info","fields":["name","email"]}, ...]}

  formLayout  Json      @default("{}")
  // {"sections": [{"label":"Basic Info","fields":["name","email"]}, ...]}

  fields      CustomFieldDef[]
  records     CustomObjectRecord[]

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, slug])
  @@index([tenantId])
}

enum ObjectScope {
  TENANT
  EVENT
}

// ─── CUSTOM FIELD DEFINITIONS ────────────────────────────────

/// Defines a custom field on either a built-in model or a custom object
model CustomFieldDef {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id])

  // Where does this field live?
  // For built-in models: targetModel = "Participant" | "Event" | "Invitation"
  // For custom objects: targetModel = null, customObjectDefId = <id>
  targetModel      String?             // "Participant", "Event", null
  customObjectDefId String?
  customObjectDef   CustomObjectDef?   @relation(fields: [customObjectDefId], references: [id])

  // Scoping: which events/participant types see this field?
  eventId           String?            // null = all events for this tenant
  event             Event?             @relation(fields: [eventId], references: [id])
  participantTypeId String?            // null = all participant types
  participantType   ParticipantType?   @relation(fields: [participantTypeId], references: [id])

  // Field definition
  name        String                   // Storage key: "weapon_permit_number"
  label       String                   // Display: "Weapon Permit Number"
  description String?                  // Help text shown under the field
  dataType    FieldDataType            // TEXT, NUMBER, BOOLEAN, DATE, ENUM, etc.
  sortOrder   Int       @default(0)

  // Constraints
  isRequired  Boolean   @default(false)
  isUnique    Boolean   @default(false)
  isSearchable Boolean  @default(false)  // Creates expression index
  isFilterable Boolean  @default(false)  // Shows in filter UI
  defaultValue String?

  // Type-specific configuration
  config      Json      @default("{}")
  // TEXT:    {"maxLength": 100, "pattern": "^WP-\\d+$", "multiline": false}
  // NUMBER:  {"min": 0, "max": 999, "decimalPlaces": 2, "format": "currency"}
  // ENUM:    {"options": [{"value":"low","label":"Low","color":"#22c55e"}, ...]}
  // DATE:    {"minDate": "2026-01-01", "maxDate": "2026-12-31"}
  // FILE:    {"allowedTypes": ["image/jpeg","application/pdf"], "maxSizeMB": 5}
  // REFERENCE: {"targetObjectSlug": "vehicle", "displayField": "plate_number"}

  // UI rendering hints
  uiConfig    Json      @default("{}")
  // {"widget": "textarea", "rows": 3, "section": "Travel Info",
  //  "placeholder": "Enter permit number", "width": "half"}

  // Validation rules (beyond basic type validation)
  validation  Json      @default("[]")
  // [{"rule": "regex", "value": "^[A-Z]{2}\\d{7}$", "message": "Invalid format"}]
  // [{"rule": "requiredIf", "field": "needsVisa", "value": true}]

  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  @@unique([tenantId, targetModel, customObjectDefId, eventId, participantTypeId, name])
  @@index([tenantId, targetModel, eventId])
  @@index([tenantId, customObjectDefId])
  @@index([eventId, participantTypeId, sortOrder])
}

enum FieldDataType {
  TEXT            // Single-line or multi-line text
  LONG_TEXT       // Rich text / markdown
  NUMBER          // Integer or decimal
  BOOLEAN         // True/false toggle
  DATE            // Date only
  DATETIME        // Date + time
  ENUM            // Single select from options
  MULTI_ENUM      // Multi-select from options
  EMAIL           // Email with format validation
  URL             // URL with format validation
  PHONE           // Phone number
  FILE            // File upload (stored in Azure Blob)
  IMAGE           // Image upload with preview
  REFERENCE       // FK to another custom object record
  FORMULA         // Computed field (read-only)
  AUTO_NUMBER     // Auto-incrementing (e.g., REG-0001)
  COUNTRY         // Country picker (references Country model)
  USER            // User picker (references User model)
}

// ─── CUSTOM OBJECT RECORDS ──────────────────────────────────

/// Stores actual data rows for custom objects
model CustomObjectRecord {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id])
  objectDefId     String
  objectDef       CustomObjectDef @relation(fields: [objectDefId], references: [id])

  // Optional scoping to event/participant
  eventId         String?
  event           Event?   @relation(fields: [eventId], references: [id])
  participantId   String?
  participant     Participant? @relation(fields: [participantId], references: [id])

  // All custom field values stored here
  data            Json     @default("{}")

  // Full-text search (populated by trigger or application code)
  // searchText   Unsupported("tsvector")?  // Would need raw SQL migration

  sortOrder       Float?                   // For manual ordering
  createdBy       String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt
  deletedAt       DateTime?

  @@index([tenantId, objectDefId, eventId])
  @@index([deletedAt])
}
```

#### Modifications to Existing Models

```prisma
// Add to existing Participant model:
model Participant {
  // ... all existing fixed fields stay ...

  customData  Json  @default("{}")  // ← NEW: stores custom field values
  // Example: {"weapon_permit": "WP-042", "dietary": "vegetarian", "press_card": "PC-789"}

  customObjectRecords CustomObjectRecord[]  // ← NEW: linked custom objects
}

// Add to existing Event model:
model Event {
  // ... all existing fixed fields stay ...

  customData  Json  @default("{}")  // ← NEW: event-level custom metadata
  // Example: {"theme": "Climate Action", "expected_attendance": 5000, "dress_code": "formal"}

  customFieldDefs  CustomFieldDef[]        // ← NEW: field definitions for this event
  customObjectRecords CustomObjectRecord[] // ← NEW: linked custom objects
}
```

### 13.7 Field Definition Examples by Use Case

#### AU Summit Event (Current Use Case)

```json
// These fields would be defined as CustomFieldDef records for the AU Summit event
// instead of being hardcoded in the Participant schema

// For ALL participant types at this event:
[
  {"name": "passport_number", "label": "Passport Number", "dataType": "TEXT",
   "isRequired": true, "isSearchable": true, "config": {"pattern": "^[A-Z0-9]{6,12}$"},
   "uiConfig": {"section": "Identity Documents", "width": "half"}},

  {"name": "passport_expiry", "label": "Passport Expiry", "dataType": "DATE",
   "isRequired": true, "config": {"minDate": "2026-06-01"},
   "validation": [{"rule": "afterToday", "message": "Passport must not be expired"}],
   "uiConfig": {"section": "Identity Documents", "width": "half"}},

  {"name": "needs_visa", "label": "Needs Visa?", "dataType": "BOOLEAN",
   "uiConfig": {"section": "Travel"}},

  {"name": "flight_number", "label": "Flight Number", "dataType": "TEXT",
   "uiConfig": {"section": "Travel", "placeholder": "e.g., ET-302"}},

  {"name": "arrival_date", "label": "Arrival Date", "dataType": "DATETIME",
   "uiConfig": {"section": "Travel"}},

  {"name": "attend_closed_session", "label": "Attend Closed Session", "dataType": "BOOLEAN",
   "uiConfig": {"section": "Sessions"}},

  {"name": "attend_executive_council", "label": "Attend Executive Council", "dataType": "BOOLEAN",
   "uiConfig": {"section": "Sessions"}}
]

// ONLY for "Armed Security" participant type:
[
  {"name": "weapon_type", "label": "Weapon Type", "dataType": "ENUM",
   "isRequired": true, "config": {"options": [
     {"value": "pistol", "label": "Pistol"},
     {"value": "rifle", "label": "Rifle"},
     {"value": "other", "label": "Other"}
   ]}, "uiConfig": {"section": "Security Details"}},

  {"name": "weapon_serial", "label": "Weapon Serial Number", "dataType": "TEXT",
   "isRequired": true, "isUnique": true,
   "uiConfig": {"section": "Security Details"}},

  {"name": "weapon_permit", "label": "Weapon Permit", "dataType": "FILE",
   "isRequired": true, "config": {"allowedTypes": ["application/pdf", "image/jpeg"]},
   "uiConfig": {"section": "Security Details"}}
]

// ONLY for "Press / Media" participant type:
[
  {"name": "media_outlet", "label": "Media Outlet", "dataType": "TEXT",
   "isRequired": true, "isFilterable": true,
   "uiConfig": {"section": "Press Credentials"}},

  {"name": "press_card_number", "label": "Press Card Number", "dataType": "TEXT",
   "isRequired": true, "uiConfig": {"section": "Press Credentials"}},

  {"name": "equipment_list", "label": "Equipment List", "dataType": "LONG_TEXT",
   "uiConfig": {"section": "Press Credentials", "widget": "textarea", "rows": 4}},

  {"name": "coverage_type", "label": "Coverage Type", "dataType": "MULTI_ENUM",
   "config": {"options": [
     {"value": "tv", "label": "Television"},
     {"value": "radio", "label": "Radio"},
     {"value": "print", "label": "Print"},
     {"value": "online", "label": "Online"},
     {"value": "photo", "label": "Photography"}
   ]}, "uiConfig": {"section": "Press Credentials"}}
]

// ONLY for "Driver" participant type:
[
  {"name": "vehicle_type", "label": "Vehicle Type", "dataType": "ENUM",
   "isRequired": true, "config": {"options": [
     {"value": "sedan", "label": "Sedan"},
     {"value": "suv", "label": "SUV"},
     {"value": "van", "label": "Van"},
     {"value": "bus", "label": "Bus"}
   ]}, "uiConfig": {"section": "Vehicle Information"}},

  {"name": "plate_number", "label": "Plate Number", "dataType": "TEXT",
   "isRequired": true, "isSearchable": true,
   "uiConfig": {"section": "Vehicle Information"}},

  {"name": "drivers_license", "label": "Driver's License", "dataType": "FILE",
   "isRequired": true, "config": {"allowedTypes": ["application/pdf", "image/jpeg"]},
   "uiConfig": {"section": "Vehicle Information"}}
]
```

#### Tech Conference (Different Tenant)

```json
// Event-level custom fields:
[
  {"name": "conference_track", "label": "Track", "dataType": "ENUM",
   "config": {"options": [
     {"value": "frontend", "label": "Frontend"},
     {"value": "backend", "label": "Backend"},
     {"value": "devops", "label": "DevOps"},
     {"value": "ai_ml", "label": "AI/ML"}
   ]}},

  {"name": "tshirt_size", "label": "T-Shirt Size", "dataType": "ENUM",
   "config": {"options": [
     {"value": "xs", "label": "XS"}, {"value": "s", "label": "S"},
     {"value": "m", "label": "M"}, {"value": "l", "label": "L"},
     {"value": "xl", "label": "XL"}, {"value": "xxl", "label": "XXL"}
   ]}},

  {"name": "dietary_requirements", "label": "Dietary Requirements", "dataType": "MULTI_ENUM",
   "config": {"options": [
     {"value": "none", "label": "None"},
     {"value": "vegetarian", "label": "Vegetarian"},
     {"value": "vegan", "label": "Vegan"},
     {"value": "halal", "label": "Halal"},
     {"value": "kosher", "label": "Kosher"},
     {"value": "gluten_free", "label": "Gluten Free"}
   ]}},

  {"name": "github_username", "label": "GitHub Username", "dataType": "TEXT",
   "uiConfig": {"placeholder": "@username"}},

  {"name": "workshop_selections", "label": "Workshop Selections", "dataType": "MULTI_ENUM",
   "config": {"options": [
     {"value": "react_advanced", "label": "Advanced React Patterns"},
     {"value": "rust_wasm", "label": "Rust + WebAssembly"},
     {"value": "k8s_workshop", "label": "Kubernetes Deep Dive"}
   ]}}
]
```

#### Music Festival (Another Tenant)

```json
[
  {"name": "wristband_color", "label": "Wristband Color", "dataType": "ENUM",
   "config": {"options": [
     {"value": "gold", "label": "Gold (VIP)", "color": "#FFD700"},
     {"value": "silver", "label": "Silver (Premium)", "color": "#C0C0C0"},
     {"value": "green", "label": "Green (General)", "color": "#22C55E"}
   ]}},

  {"name": "camping_zone", "label": "Camping Zone", "dataType": "ENUM",
   "config": {"options": [
     {"value": "a", "label": "Zone A (Near Stage)"},
     {"value": "b", "label": "Zone B (Quiet Area)"},
     {"value": "none", "label": "No Camping"}
   ]}},

  {"name": "emergency_contact_name", "label": "Emergency Contact Name", "dataType": "TEXT",
   "isRequired": true},

  {"name": "emergency_contact_phone", "label": "Emergency Contact Phone", "dataType": "PHONE",
   "isRequired": true},

  {"name": "medical_conditions", "label": "Medical Conditions", "dataType": "LONG_TEXT",
   "uiConfig": {"section": "Health & Safety"}}
]
```

### 13.8 Implementation: Dynamic Validation with Zod

The existing Conform + Zod form system extends naturally to support dynamic fields:

```typescript
// app/utils/custom-fields.server.ts

import { z } from 'zod'
import { FieldDataType } from '@prisma/client'

interface CustomFieldDef {
  name: string
  label: string
  dataType: FieldDataType
  isRequired: boolean
  config: Record<string, any>
  validation: Array<{ rule: string; value?: any; message: string }>
}

/**
 * Builds a Zod schema dynamically from custom field definitions.
 * This integrates with the existing Conform form handling.
 */
export function buildCustomDataSchema(fieldDefs: CustomFieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of fieldDefs) {
    let schema: z.ZodTypeAny

    switch (field.dataType) {
      case 'TEXT':
      case 'LONG_TEXT':
        schema = z.string()
        if (field.config.maxLength) schema = (schema as z.ZodString).max(field.config.maxLength)
        if (field.config.pattern) schema = (schema as z.ZodString).regex(new RegExp(field.config.pattern))
        break

      case 'NUMBER':
        schema = z.number()
        if (field.config.min !== undefined) schema = (schema as z.ZodNumber).min(field.config.min)
        if (field.config.max !== undefined) schema = (schema as z.ZodNumber).max(field.config.max)
        break

      case 'BOOLEAN':
        schema = z.boolean()
        break

      case 'DATE':
      case 'DATETIME':
        schema = z.string().datetime()
        break

      case 'ENUM':
        const values = field.config.options?.map((o: any) => o.value) ?? []
        schema = z.enum(values as [string, ...string[]])
        break

      case 'MULTI_ENUM':
        const multiValues = field.config.options?.map((o: any) => o.value) ?? []
        schema = z.array(z.enum(multiValues as [string, ...string[]]))
        break

      case 'EMAIL':
        schema = z.string().email()
        break

      case 'URL':
        schema = z.string().url()
        break

      case 'PHONE':
        schema = z.string().min(7).max(20)
        break

      case 'FILE':
      case 'IMAGE':
        schema = z.string()  // File reference ID
        break

      case 'REFERENCE':
        schema = z.string()  // Record ID
        break

      default:
        schema = z.any()
    }

    // Apply custom validation rules
    for (const rule of field.validation || []) {
      if (rule.rule === 'regex' && typeof rule.value === 'string') {
        schema = schema.refine(
          (val: any) => new RegExp(rule.value).test(String(val)),
          { message: rule.message }
        )
      }
      // Additional rules: requiredIf, minDate, maxDate, etc.
    }

    // Required vs optional
    if (!field.isRequired) {
      schema = schema.optional().nullable()
    }

    shape[field.name] = schema
  }

  return z.object(shape)
}
```

### 13.9 Implementation: Dynamic Form Renderer

```typescript
// app/components/dynamic-fields/DynamicFieldRenderer.tsx

/**
 * Reads CustomFieldDef metadata and renders the appropriate
 * Conform form component. Reuses the existing component library.
 */
export function DynamicFieldRenderer({
  fieldDef,
  meta,  // Conform field metadata
}: {
  fieldDef: CustomFieldDef
  meta: FieldMetadata<string>
}) {
  const { dataType, label, config, uiConfig } = fieldDef

  switch (dataType) {
    case 'TEXT':
    case 'EMAIL':
    case 'URL':
    case 'PHONE':
      return <InputField meta={meta} label={label} type={mapInputType(dataType)}
                         placeholder={uiConfig.placeholder} />

    case 'LONG_TEXT':
      return <TextareaField meta={meta} label={label}
                            rows={uiConfig.rows ?? 3} />

    case 'NUMBER':
      return <InputField meta={meta} label={label} type="number"
                         min={config.min} max={config.max}
                         step={config.decimalPlaces ? `0.${'0'.repeat(config.decimalPlaces - 1)}1` : '1'} />

    case 'BOOLEAN':
      return <CheckboxField meta={meta} label={label} />

    case 'DATE':
    case 'DATETIME':
      return <DatePickerField meta={meta} label={label}
                              minDate={config.minDate} maxDate={config.maxDate} />

    case 'ENUM':
      return <SelectField meta={meta} label={label}
                          options={config.options.map((o: any) => ({
                            value: o.value, label: o.label
                          }))} />

    case 'MULTI_ENUM':
      return <CheckboxGroupField meta={meta} label={label}
                                 options={config.options} />

    case 'FILE':
    case 'IMAGE':
      return <FileInputField meta={meta} label={label}
                             accept={config.allowedTypes?.join(',')} />

    default:
      return <InputField meta={meta} label={label} type="text" />
  }
}

/**
 * Renders all custom fields for a participant, grouped by section.
 */
export function DynamicFieldSection({
  fieldDefs,
  formFields,  // Conform form fields object
}: {
  fieldDefs: CustomFieldDef[]
  formFields: Record<string, FieldMetadata<string>>
}) {
  // Group fields by section
  const sections = groupBy(fieldDefs, f => f.uiConfig.section ?? 'Additional Information')

  return (
    <>
      {Object.entries(sections).map(([sectionName, fields]) => (
        <fieldset key={sectionName}>
          <legend className="text-lg font-semibold mb-4">{sectionName}</legend>
          <div className="grid grid-cols-2 gap-4">
            {fields
              .sort((a, b) => a.sortOrder - b.sortOrder)
              .map(field => (
                <div key={field.name}
                     className={field.uiConfig.width === 'full' ? 'col-span-2' : ''}>
                  <DynamicFieldRenderer
                    fieldDef={field}
                    meta={formFields[field.name]}
                  />
                </div>
              ))}
          </div>
        </fieldset>
      ))}
    </>
  )
}
```

### 13.10 Implementation: Query Layer for Custom Fields

```typescript
// app/utils/custom-query.server.ts

/**
 * Extends the existing filterAndPaginate() to support JSONB custom fields.
 */
export async function filterWithCustomFields({
  request,
  where,
  customFieldDefs,
}: {
  request: Request
  where: Prisma.ParticipantWhereInput
  customFieldDefs: CustomFieldDef[]
}) {
  const url = new URL(request.url)
  const customFilters: Prisma.Sql[] = []

  for (const field of customFieldDefs.filter(f => f.isFilterable)) {
    const value = url.searchParams.get(`cf_${field.name}`)
    if (!value) continue

    switch (field.dataType) {
      case 'TEXT':
      case 'EMAIL':
        customFilters.push(
          Prisma.sql`"customData"->>${field.name} ILIKE ${'%' + value + '%'}`
        )
        break
      case 'NUMBER':
        customFilters.push(
          Prisma.sql`("customData"->>${field.name})::NUMERIC = ${Number(value)}`
        )
        break
      case 'BOOLEAN':
        customFilters.push(
          Prisma.sql`("customData"->>${field.name})::BOOLEAN = ${value === 'true'}`
        )
        break
      case 'ENUM':
        customFilters.push(
          Prisma.sql`"customData"->>${field.name} = ${value}`
        )
        break
      case 'DATE':
        const [from, to] = value.split(',')
        if (from) customFilters.push(
          Prisma.sql`("customData"->>${field.name})::DATE >= ${from}::DATE`
        )
        if (to) customFilters.push(
          Prisma.sql`("customData"->>${field.name})::DATE <= ${to}::DATE`
        )
        break
    }
  }

  // If no custom filters, use standard Prisma query
  if (customFilters.length === 0) {
    return prisma.participant.findMany({ where })
  }

  // Otherwise, combine Prisma where with raw JSONB conditions
  const customWhere = Prisma.sql`AND ${Prisma.join(customFilters, ' AND ')}`
  // ... build hybrid query using prisma.$queryRaw
}
```

### 13.11 Implementation: Dynamic Index Management

When an admin marks a custom field as `isSearchable`, create expression indexes for query performance:

```typescript
// app/utils/custom-index.server.ts

export async function ensureCustomFieldIndex(field: CustomFieldDef) {
  if (!field.isSearchable) return

  const indexName = `idx_participant_cf_${field.name}`
  const cast = getCastForType(field.dataType)

  // CREATE INDEX CONCURRENTLY is non-blocking
  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}"
    ON "Participant" ((("customData"->>'${field.name}')${cast}))
    WHERE "deletedAt" IS NULL
  `)
}

function getCastForType(dataType: FieldDataType): string {
  switch (dataType) {
    case 'NUMBER': return '::NUMERIC'
    case 'BOOLEAN': return '::BOOLEAN'
    case 'DATE':
    case 'DATETIME': return '::TIMESTAMP'
    default: return ''  // TEXT comparison, no cast needed
  }
}
```

### 13.12 Migration Strategy: Moving Static Fields to Dynamic

This should happen gradually, not all at once:

#### Phase 1: Add Infrastructure (Non-Breaking)
1. Add `customData Json @default("{}")` to Participant and Event models
2. Create `CustomFieldDef` and `CustomObjectDef` models
3. Build the admin UI for defining custom fields
4. Build the dynamic form renderer

#### Phase 2: Migrate Domain-Specific Fields
Move the AU-specific static fields to custom field definitions while keeping backward compatibility:

| Current Static Field | Becomes Custom Field | Notes |
|---------------------|---------------------|-------|
| `needsVisa` | `{ name: "needs_visa", dataType: "BOOLEAN" }` | |
| `needsCarPass` | `{ name: "needs_car_pass", dataType: "BOOLEAN" }` | |
| `vehicleType` | `{ name: "vehicle_type", dataType: "ENUM" }` | Only for Driver types |
| `vehiclePlateNumber` | `{ name: "plate_number", dataType: "TEXT" }` | Only for Driver types |
| `needsCarFromOrganizer` | `{ name: "needs_organizer_car", dataType: "BOOLEAN" }` | |
| `flightNumber` | `{ name: "flight_number", dataType: "TEXT" }` | |
| `arrivalDate` | `{ name: "arrival_date", dataType: "DATETIME" }` | |
| `attendClosedSession` | `{ name: "attend_closed_session", dataType: "BOOLEAN" }` | |
| `attendExecutiveCouncilClosedSession` | `{ name: "attend_exec_council", dataType: "BOOLEAN" }` | |
| `wishList` | `{ name: "wish_list", dataType: "LONG_TEXT" }` | |
| `passportNumber` | `{ name: "passport_number", dataType: "TEXT" }` | Keep if most events need it |
| `passportExpiry` | `{ name: "passport_expiry", dataType: "DATE" }` | Keep if most events need it |

**Data migration script:**
```typescript
// For each participant with static field values, copy to customData JSONB
await prisma.$executeRaw`
  UPDATE "Participant"
  SET "customData" = jsonb_build_object(
    'needs_visa', "needsVisa",
    'needs_car_pass', "needsCarPass",
    'vehicle_type', "vehicleType",
    'plate_number', "vehiclePlateNumber",
    'flight_number', "flightNumber",
    'arrival_date', "arrivalDate",
    'attend_closed_session', "attendClosedSession",
    'attend_exec_council', "attendExecutiveCouncilClosedSession",
    'wish_list', "wishList"
  )
  WHERE "customData" = '{}'::jsonb
`
```

#### Phase 3: Remove Static Columns
After all consumers read from `customData`, drop the old columns in a Prisma migration.

#### Phase 4: Custom Object Support
Enable tenants to define entirely new objects (Vehicle Registry, Accommodation Assignments, Equipment Tracking) with full CRUD, relationships, and workflow integration.

### 13.13 Admin UI for Field Management

The field definition admin should support:

```
┌─────────────────────────────────────────────────────────────────┐
│  Event: 38th AU Summit  →  Custom Fields                        │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [+ Add Field]  [Import from Template]  [Export as Template]     │
│                                                                  │
│  Filter by: [All Types ▾]  [All Sections ▾]                    │
│                                                                  │
│  ┌───┬─────────────────┬──────────┬──────────┬────────┬───────┐ │
│  │ ⋮ │ Field Name       │ Type     │ Applies To│ Req'd │       │ │
│  ├───┼─────────────────┼──────────┼──────────┼────────┼───────┤ │
│  │ ⋮ │ Passport Number  │ Text     │ All      │ ✓      │ Edit  │ │
│  │ ⋮ │ Passport Expiry  │ Date     │ All      │ ✓      │ Edit  │ │
│  │ ⋮ │ Needs Visa       │ Boolean  │ All      │        │ Edit  │ │
│  │ ⋮ │ Flight Number    │ Text     │ All      │        │ Edit  │ │
│  │ ⋮ │ Weapon Type      │ Enum     │ Armed Sec│ ✓      │ Edit  │ │
│  │ ⋮ │ Weapon Serial    │ Text     │ Armed Sec│ ✓      │ Edit  │ │
│  │ ⋮ │ Weapon Permit    │ File     │ Armed Sec│ ✓      │ Edit  │ │
│  │ ⋮ │ Media Outlet     │ Text     │ Press    │ ✓      │ Edit  │ │
│  │ ⋮ │ Press Card #     │ Text     │ Press    │ ✓      │ Edit  │ │
│  │ ⋮ │ Coverage Type    │ Multi    │ Press    │        │ Edit  │ │
│  │ ⋮ │ Vehicle Type     │ Enum     │ Driver   │ ✓      │ Edit  │ │
│  │ ⋮ │ Plate Number     │ Text     │ Driver   │ ✓      │ Edit  │ │
│  └───┴─────────────────┴──────────┴──────────┴────────┴───────┘ │
│                                                                  │
│  Drag ⋮ to reorder  │  Fields marked ⚡ are indexed for search  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.14 View System (Airtable-Style)

Beyond custom fields, add **saved views** that let different roles see the same data differently:

```prisma
model SavedView {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String?
  name        String
  type        ViewType @default(TABLE)  // TABLE, KANBAN, CALENDAR, GALLERY

  // Which model this view is for
  targetModel String   // "Participant", "Invitation", or custom object slug

  // View configuration
  config      Json
  // {
  //   "columns": ["firstName","familyName","status","cf_weapon_type"],
  //   "filters": [{"field":"status","op":"in","value":["PENDING","INPROGRESS"]}],
  //   "sorts": [{"field":"createdAt","direction":"desc"}],
  //   "groupBy": "participantType",
  //   "colorBy": {"field":"status","rules":{"APPROVED":"green","REJECTED":"red"}}
  // }

  // Access control
  isDefault   Boolean  @default(false)  // Default view for this model
  isPublic    Boolean  @default(false)  // Visible to all users with access
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([tenantId, targetModel])
}

enum ViewType {
  TABLE
  KANBAN
  CALENDAR
  GALLERY
}
```

This enables:
- **Validators** see a table view filtered to their step, showing only relevant fields
- **Printers** see a kanban board grouped by print status
- **Admins** see a comprehensive table with all custom fields visible
- **Focal points** see a calendar view of their delegation's arrival dates

### 13.15 Summary: What Changes and What Stays

| Stays Fixed (Prisma Schema) | Becomes Dynamic (JSONB + Metadata) |
|-----------------------------|------------------------------------|
| `id`, `tenantId`, `eventId` | All domain-specific participant fields |
| `firstName`, `familyName` | Event metadata beyond name/dates/status |
| `email`, `organization`, `jobTitle` | Type-specific fields (weapon, press card, vehicle) |
| `gender`, `titleId`, `dateOfBirth` | Conditional fields (visa, car pass, sessions) |
| `participantTypeId`, `status`, `stepId` | Entirely new entity types (custom objects) |
| `registrationCode` | View configurations |
| `createdAt`, `updatedAt`, `deletedAt` | Layout/section groupings |
| Workflow system (Step, Approval) | Validation rules beyond basic type checks |
| RBAC (Role, Permission, UserEventAccess) | Per-event form configurations |

This architecture transforms the system from a **single-purpose AU summit tool** into a **platform** that can handle any accreditation scenario while preserving the performance and type safety of the core domain model.

---

## 14. Visual Form Designer

Section 13 introduced **field definitions** - database records that describe what fields to show. But an admin still needs a way to *arrange* those fields into a usable form. That's what the visual form designer does.

### 14.1 What It Is (And What It Isn't)

The visual form designer is a **drag-and-drop admin interface** where a non-technical user designs the registration form that participants will fill out. It answers the question: **"I've defined 15 custom fields for this event - now how should the form look?"**

```
Without form designer:                With form designer:

Fields appear in a flat list,         Admin arranges fields into:
ordered only by sortOrder number.     - Pages (multi-step wizard)
No sections, no columns,              - Sections with titles
no conditional show/hide.             - Multi-column grid layouts
                                      - Conditional show/hide rules
                                      - Live preview as they design
```

Think of it this way:
- **Field definitions** (Section 13) = "what data to collect" (the ingredients)
- **Form designer** (this section) = "how the form looks and flows" (the recipe)

### 14.2 You Already Have Two Visual Editors

The codebase already contains two drag-and-drop visual editors that prove the team can build this:

**1. Workflow Builder** (`app/components/workflow-builder/`)
- Uses `@xyflow/react` (React Flow) for a node-based canvas
- Drag steps from a palette onto the canvas
- Auto-layout with `dagre` library
- Positions saved as `positionX`/`positionY` on Step records

**2. Badge Designer** (`app/components/badge-designer/`)
- Custom HTML/React implementation (no external canvas library)
- Elements positioned absolutely inside a scaled container
- Mouse-based drag, resize handles, grid snapping
- Keyboard shortcuts (arrows to move, Ctrl+D to duplicate, Delete to remove)
- Multi-selection with alignment tools
- Properties panel with tabbed editing (Position | Content | Style)
- Live preview that updates as you edit

**The form designer follows the same patterns** - specifically the Badge Designer approach, since forms are layout-based (sections and grids) rather than graph-based (nodes and edges).

### 14.3 How It Works: The Three-Panel Layout

```
┌──────────────┬──────────────────────────────────┬──────────────┐
│              │                                    │              │
│   FIELD      │        DESIGN CANVAS               │  PROPERTIES  │
│   PALETTE    │                                    │  PANEL       │
│              │  ┌──────────────────────────────┐  │              │
│  ─ Input     │  │  Page 1: Personal Info       │  │  Selected:   │
│  ─ Textarea  │  │  ┌────────────┬─────────────┐│  │  "First Name"│
│  ─ Number    │  │  │ Title [▾]  │ First Name  ││  │              │
│  ─ Email     │  │  ├────────────┼─────────────┤│  │  Label: ___  │
│  ─ Phone     │  │  │ Family Name│ Gender (●)  ││  │  Width: [half]│
│  ─ Date      │  │  └────────────┴─────────────┘│  │  Required: ☑ │
│  ─ Dropdown  │  │                                │  │  Placeholder:│
│  ─ Radio     │  │  ┌────────────────────────────┐│  │    _________ │
│  ─ Checkbox  │  │  │ Passport Number            ││  │  Validation: │
│  ─ Toggle    │  │  │ Passport Expiry            ││  │    Min: ___  │
│  ─ File      │  │  └────────────────────────────┘│  │    Max: ___  │
│  ─ Image     │  │                                │  │    Pattern:  │
│  ─ Heading   │  │  [+ Add Section]               │  │    _________ │
│  ─ Divider   │  │                                │  │              │
│              │  │  Page 2: Travel Info  ►         │  │  Show if:    │
│              │  │                                │  │  [field ▾]   │
│              │  └──────────────────────────────┘  │  [equals ▾]   │
│              │                                    │  [value  ___]  │
│              │   [Editor]  [Split]  [Preview]     │              │
│              │                                    │              │
└──────────────┴──────────────────────────────────┴──────────────┘
```

**Left panel (Field Palette):** Draggable field types organized by category - just like the step palette in the workflow builder.

**Center panel (Design Canvas):** The form layout with pages, sections, and fields arranged in a 12-column grid. Fields are draggable within and between sections. Sections are collapsible and reorderable.

**Right panel (Properties):** When you click a field on the canvas, its properties appear here - just like the element editor in the badge designer. You edit label, width, validation, conditional rules, placeholder text, etc.

### 14.4 What Gets Stored: The Form Layout JSON

The form design is saved as a **single JSON document** in the database. Here's the complete structure with a real example:

#### The Data Model

```
FormTemplate table:
┌──────────────┬──────────────────────────────────────────────────┐
│ id           │ "cuid_form001"                                   │
│ tenantId     │ "african_union_tenant_id"                        │
│ name         │ "AU Summit Registration"                         │
│ version      │ 1                                                │
│ isActive     │ true                                             │
│ definition   │ { ... the JSON below ... }                       │
└──────────────┴──────────────────────────────────────────────────┘
```

The `definition` JSON has this hierarchy:

```
FormDefinition
  ├── settings (display mode, progress bar, submit button text)
  │
  └── pages[] (each page = one wizard step)
       ├── title, description
       ├── visibleIf (conditional: show this page only if...)
       │
       └── sections[] (visual groupings within a page)
            ├── title, columns (1-4), collapsible
            ├── visibleIf (conditional: show this section only if...)
            │
            └── fields[] (the actual form inputs)
                 ├── key (maps to customData JSON key)
                 ├── type (text, select, date, file, etc.)
                 ├── label, placeholder, description
                 ├── layout: { colSpan, row, order }
                 ├── validation: { required, min, max, pattern }
                 ├── visibleIf (conditional: show this field only if...)
                 └── properties (type-specific: options, file types, etc.)
```

#### Concrete Example: AU Summit Registration Form

```json
{
  "settings": {
    "displayMode": "wizard",
    "showProgressBar": true,
    "submitButtonText": "Submit Application"
  },
  "pages": [
    {
      "id": "page_personal",
      "title": "Personal Information",
      "description": "Please provide your personal details",
      "order": 1,
      "sections": [
        {
          "id": "sec_name",
          "title": "Full Name",
          "columns": 2,
          "order": 1,
          "fields": [
            {
              "id": "f1",
              "key": "titleId",
              "type": "select",
              "label": "Title",
              "layout": { "colSpan": 3, "row": "row1", "order": 1 },
              "validation": { "required": true },
              "properties": {
                "optionsUrl": "/api/titles",
                "optionsValueField": "id",
                "optionsLabelField": "name"
              }
            },
            {
              "id": "f2",
              "key": "firstName",
              "type": "text",
              "label": "First Name",
              "placeholder": "Enter first name",
              "layout": { "colSpan": 4, "row": "row1", "order": 2 },
              "validation": { "required": true, "minLength": 2 }
            },
            {
              "id": "f3",
              "key": "familyName",
              "type": "text",
              "label": "Family Name",
              "layout": { "colSpan": 5, "row": "row1", "order": 3 },
              "validation": { "required": true }
            },
            {
              "id": "f4",
              "key": "gender",
              "type": "radio",
              "label": "Gender",
              "layout": { "colSpan": 6, "row": "row2", "order": 4 },
              "validation": { "required": true },
              "properties": {
                "options": [
                  { "label": "Male", "value": "male" },
                  { "label": "Female", "value": "female" }
                ]
              }
            },
            {
              "id": "f5",
              "key": "dateOfBirth",
              "type": "date",
              "label": "Date of Birth",
              "layout": { "colSpan": 6, "row": "row2", "order": 5 },
              "validation": { "required": true }
            }
          ]
        },
        {
          "id": "sec_identity",
          "title": "Passport Details",
          "columns": 2,
          "order": 2,
          "fields": [
            {
              "id": "f6",
              "key": "passport_number",
              "type": "text",
              "label": "Passport Number",
              "layout": { "colSpan": 6, "order": 1 },
              "validation": {
                "required": true,
                "pattern": "^[A-Z0-9]{5,15}$",
                "patternMessage": "Must be 5-15 uppercase letters/digits"
              }
            },
            {
              "id": "f7",
              "key": "passport_expiry",
              "type": "date",
              "label": "Passport Expiry",
              "layout": { "colSpan": 6, "order": 2 },
              "validation": { "required": true }
            }
          ]
        }
      ]
    },
    {
      "id": "page_travel",
      "title": "Travel Information",
      "order": 2,
      "sections": [
        {
          "id": "sec_travel",
          "title": "Travel & Logistics",
          "columns": 2,
          "order": 1,
          "fields": [
            {
              "id": "f8",
              "key": "needs_visa",
              "type": "switch",
              "label": "Do you need visa assistance?",
              "layout": { "colSpan": 6, "order": 1 },
              "defaultValue": false
            },
            {
              "id": "f9",
              "key": "flight_number",
              "type": "text",
              "label": "Flight Number",
              "placeholder": "e.g., ET-302",
              "layout": { "colSpan": 6, "order": 2 },
              "visibleIf": {
                "type": "simple",
                "field": "needs_visa",
                "operator": "eq",
                "value": true
              }
            },
            {
              "id": "f10",
              "key": "arrival_date",
              "type": "datetime",
              "label": "Arrival Date & Time",
              "layout": { "colSpan": 6, "order": 3 },
              "visibleIf": {
                "type": "simple",
                "field": "flight_number",
                "operator": "notEmpty"
              }
            }
          ]
        }
      ]
    },
    {
      "id": "page_security",
      "title": "Security Details",
      "order": 3,
      "visibleIf": {
        "type": "compound",
        "operator": "or",
        "conditions": [
          { "type": "simple", "field": "participantType", "operator": "eq", "value": "Armed Security" },
          { "type": "simple", "field": "participantType", "operator": "eq", "value": "Special Armed Security" }
        ]
      },
      "sections": [
        {
          "id": "sec_weapon",
          "title": "Weapon Registration",
          "columns": 2,
          "order": 1,
          "fields": [
            {
              "id": "f11",
              "key": "weapon_type",
              "type": "select",
              "label": "Weapon Type",
              "layout": { "colSpan": 6, "order": 1 },
              "validation": { "required": true },
              "properties": {
                "options": [
                  { "label": "Pistol", "value": "pistol" },
                  { "label": "Rifle", "value": "rifle" },
                  { "label": "Other", "value": "other" }
                ]
              }
            },
            {
              "id": "f12",
              "key": "weapon_serial",
              "type": "text",
              "label": "Weapon Serial Number",
              "layout": { "colSpan": 6, "order": 2 },
              "validation": { "required": true, "maxLength": 20 }
            },
            {
              "id": "f13",
              "key": "weapon_permit",
              "type": "file",
              "label": "Weapon Permit (PDF or Image)",
              "layout": { "colSpan": 12, "order": 3 },
              "validation": { "required": true },
              "properties": {
                "accept": ".pdf,.jpg,.jpeg,.png",
                "maxFileSize": 5242880
              }
            }
          ]
        }
      ]
    }
  ]
}
```

**Key things to notice:**
- **Page 3 (Security Details) has a `visibleIf`** - it only appears when the participant type is Armed Security. A Minister filling out this form never sees that page.
- **Flight Number has a `visibleIf`** - it only appears when "needs visa" is toggled on. The form adapts in real time.
- **Arrival Date has a `visibleIf`** tied to Flight Number - cascading conditions.
- **`colSpan` uses a 12-column grid** - `6` = half width, `4` = third, `3` = quarter, `12` = full. Same system as Tailwind's `col-span-*`.
- **`row` groups fields** - fields with the same `row` value sit on the same horizontal line.

### 14.5 The 12-Column Grid Explained

The grid system controls field widths within a section:

```
colSpan: 12 (full width)
┌────────────────────────────────────────────────────────┐
│  Full Name                                              │
└────────────────────────────────────────────────────────┘

colSpan: 6 + 6 (two halves)
┌──────────────────────────┬─────────────────────────────┐
│  First Name              │  Family Name                │
└──────────────────────────┴─────────────────────────────┘

colSpan: 3 + 4 + 5 (custom split)
┌──────────┬──────────────┬──────────────────────────────┐
│  Title ▾ │  First Name  │  Family Name                 │
└──────────┴──────────────┴──────────────────────────────┘

colSpan: 4 + 4 + 4 (three thirds)
┌────────────────┬────────────────┬──────────────────────┐
│  Country       │  City          │  Phone               │
└────────────────┴────────────────┴──────────────────────┘
```

In the designer, the admin controls this by clicking a field and choosing its width from the Properties panel:

```
Width:  [Quarter ¼]  [Third ⅓]  [Half ½]  [Full ▬]
```

Or by dragging the field's right edge to resize it on the grid.

### 14.6 Conditional Visibility Rules

This is one of the most powerful features. The admin defines rules like:

> "Show the 'Flight Number' field **only if** 'Needs Visa' is checked"

In the Properties panel, this looks like:

```
┌─────────────────────────────────────────────┐
│  Visibility Rule                             │
│                                              │
│  Show this field only when:                  │
│  ┌───────────────────┐ ┌──────────┐ ┌─────┐│
│  │ needs_visa       ▾│ │ equals  ▾│ │ Yes ▾││
│  └───────────────────┘ └──────────┘ └─────┘│
│                                              │
│  [+ Add another condition]                   │
│  Match: (●) All conditions  ( ) Any condition│
└─────────────────────────────────────────────┘
```

This generates the JSON:

```json
{
  "visibleIf": {
    "type": "simple",
    "field": "needs_visa",
    "operator": "eq",
    "value": true
  }
}
```

For complex rules (e.g., show for Armed Security OR Special Armed Security):

```json
{
  "visibleIf": {
    "type": "compound",
    "operator": "or",
    "conditions": [
      { "type": "simple", "field": "participantType", "operator": "eq", "value": "Armed Security" },
      { "type": "simple", "field": "participantType", "operator": "eq", "value": "Special Armed Security" }
    ]
  }
}
```

The evaluation is simple - at render time, the system checks the current form data against the rule:

```typescript
function evaluateCondition(condition, formData) {
  if (!condition) return true  // No rule = always visible

  if (condition.type === 'simple') {
    const value = formData[condition.field]
    switch (condition.operator) {
      case 'eq':       return value === condition.value
      case 'neq':      return value !== condition.value
      case 'empty':    return !value
      case 'notEmpty': return !!value
      case 'gt':       return Number(value) > Number(condition.value)
      case 'contains': return String(value).includes(condition.value)
    }
  }

  if (condition.type === 'compound') {
    const results = condition.conditions.map(c => evaluateCondition(c, formData))
    return condition.operator === 'and'
      ? results.every(Boolean)   // ALL must be true
      : results.some(Boolean)    // ANY must be true
  }
}
```

### 14.7 Three View Modes

The designer supports three view modes (toggled by tabs at the bottom of the canvas):

**Editor Mode** - Full design interface with drag handles, grid lines, property panel:
```
┌──────────┬──────────────────────────────────────┬───────────┐
│ Palette  │  Canvas (editable, grid visible)      │Properties │
└──────────┴──────────────────────────────────────┴───────────┘
```

**Split Mode** - Side-by-side editor and live preview:
```
┌──────────┬──────────────────┬───────────────────┬───────────┐
│ Palette  │  Canvas (edit)   │  Live Preview      │Properties │
└──────────┴──────────────────┴───────────────────┴───────────┘
```

**Preview Mode** - Full-width preview showing exactly what the participant sees:
```
┌────────────────────────────────────────────────────────────┐
│                                                            │
│          ┌──────────────────────────────┐                 │
│          │   The actual form as it      │                 │
│          │   will appear to             │                 │
│          │   participants               │                 │
│          │                              │                 │
│          │   [Previous]    [Next]        │                 │
│          └──────────────────────────────┘                 │
│                                                            │
└────────────────────────────────────────────────────────────┘
```

The live preview uses the **same renderer component** that the actual registration form uses. This guarantees WYSIWYG accuracy - what the admin sees in preview is exactly what participants see.

### 14.8 Implementation: Reusing Existing Patterns

The form designer follows the **Badge Designer pattern** already in the codebase, adapted for form layout:

| Aspect | Badge Designer (existing) | Form Designer (new) |
|--------|--------------------------|---------------------|
| **Canvas** | Absolute-positioned HTML divs | CSS Grid (`grid-cols-12`) with sections |
| **Drag library** | Custom mouse events (onMouseDown/Move/Up) | `@dnd-kit` (sortable + droppable) |
| **Palette** | Buttons to add element types | Draggable field type cards |
| **Properties** | Tabbed panel (Position, Content, Style) | Tabbed panel (General, Validation, Visibility) |
| **Preview** | Live badge render component | Live form render component |
| **Data format** | `BadgeElement[]` JSON in `elements` column | `FormDefinition` JSON in `definition` column |
| **Keyboard** | Arrow keys, Ctrl+D, Delete | Same patterns |
| **Multi-select** | Shift+Click, alignment tools | Not needed (fields are grid-based, not free-form) |

#### Technology Choices

| Concern | Choice | Why |
|---------|--------|-----|
| **Drag-and-drop** | `@dnd-kit` | Active, accessible, supports sortable lists + multiple droppable containers. Better fit than React Flow (workflow) or raw mouse events (badge) for list/grid reordering. |
| **Form rendering** | Existing Conform + Radix UI components | `InputField`, `SelectField`, `CheckboxField`, `DatePickerField`, etc. are already built. The preview renders with these exact components. |
| **Validation** | Dynamic Zod (from Section 13.8) | Schema built at runtime from field definitions. |
| **Layout** | Tailwind `grid-cols-12` + `col-span-*` | Already used throughout the app. Maps directly to `colSpan` in the JSON. |
| **State** | `useState` + `useCallback` | Same pattern as badge designer. No Redux/Zustand needed. |

#### File Structure

```
app/components/form-designer/
  form-designer.tsx            # Top-level: three-panel layout + view mode toggle
  field-palette.tsx            # Left panel: draggable field types by category
  design-canvas.tsx            # Center: DndContext with pages/sections/fields
  section-drop-zone.tsx        # Droppable section with sortable fields inside
  sortable-field.tsx           # Individual field card on canvas (drag handle, type icon, label)
  field-properties-panel.tsx   # Right panel: edit selected field (tabs: General | Validation | Visibility)
  condition-builder.tsx        # Visibility rule editor (field + operator + value dropdowns)
  form-renderer.tsx            # Live preview / actual form (shared between designer and registration)
  field-renderer.tsx           # Renders one field by type → existing Conform components
  types.ts                     # TypeScript interfaces for FormDefinition, FormPage, FormSection, FormField
  index.ts                     # Barrel export

app/utils/
  form-schema-builder.server.ts   # Build Zod schema from FormDefinition JSON
  condition-evaluator.ts          # Evaluate visibleIf/requiredIf conditions
  form-definition.server.ts       # CRUD for FormTemplate records
```

### 14.9 Prisma Schema Addition

```prisma
model FormTemplate {
  id           String   @id @default(cuid())
  tenantId     String
  tenant       Tenant   @relation(fields: [tenantId], references: [id])
  eventId      String?
  event        Event?   @relation(fields: [eventId], references: [id])

  name         String
  description  String?
  version      Int      @default(1)

  // The entire form layout JSON (pages → sections → fields)
  definition   Json

  // Which participant types use this form layout
  // null = default for all types without a specific template
  participantTypeId String?
  participantType   ParticipantType? @relation(fields: [participantTypeId], references: [id])

  isActive     Boolean  @default(true)
  publishedAt  DateTime?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  @@unique([tenantId, eventId, participantTypeId, name])
  @@index([tenantId, eventId])
}
```

### 14.10 How Field Definitions and Form Templates Work Together

These two systems are complementary:

```
CustomFieldDef (Section 13)          FormTemplate (Section 14)
─────────────────────────           ────────────────────────
"What fields exist"                  "How they're arranged"

Records like:                        JSON like:
- weapon_serial (TEXT, required)     - Page 1: Personal Info
- weapon_type (ENUM, required)         - Section: Name (2 columns)
- weapon_permit (FILE, required)         - firstName (colSpan: 6)
- needs_visa (BOOLEAN)                   - familyName (colSpan: 6)
- flight_number (TEXT)               - Page 2: Security
                                       - Section: Weapon Details
                                         - weapon_type (colSpan: 6)
                                         - weapon_serial (colSpan: 6)
                                         - weapon_permit (colSpan: 12)
```

**You can use field definitions WITHOUT the form designer** - fields just render in a flat list sorted by `sortOrder`. The form designer is an upgrade that gives admins control over layout.

**The form designer reads from field definitions** - the palette shows fields that are defined for this event/participant type. The admin drags them onto the canvas to arrange the layout. The field's type, validation, and options come from the `CustomFieldDef` record.

#### The Flow

```
1. Admin defines fields          2. Admin designs form           3. Participant fills form
   (Section 13)                     (Section 14)                    (Runtime)

   CustomFieldDef table →          FormTemplate table →           Form renderer reads both:
   "weapon_serial"                 definition JSON with           - FormTemplate for layout
   type: TEXT                      pages, sections,               - CustomFieldDef for
   required: true                  field arrangement                validation & type info
   maxLength: 20                   and conditions                 - Saves to customData JSON
```

### 14.11 What the Admin Experience Looks Like

**Step 1:** Admin navigates to `Event > 38th AU Summit > Form Designer`

**Step 2:** They see the three-panel interface. The field palette on the left shows all custom fields defined for this event (from Section 13), grouped by category.

**Step 3:** They create pages by clicking `[+ Add Page]`:
- Page 1: "Personal Information"
- Page 2: "Travel Information"
- Page 3: "Security Details"

**Step 4:** Within each page, they add sections with `[+ Add Section]`:
- "Full Name" (2 columns)
- "Passport Details" (2 columns)

**Step 5:** They drag fields from the palette into sections. The field snaps to the grid. They adjust width by choosing Quarter/Third/Half/Full.

**Step 6:** They click a field to select it. The Properties panel opens on the right. They set:
- Label override (optional)
- Placeholder text
- Help text
- Width (colSpan)
- Visibility rule ("Show only when participant type is Armed Security")

**Step 7:** They toggle to Split or Preview mode to see the form as participants will see it. Conditional rules are live - toggling a switch shows/hides dependent fields in real time.

**Step 8:** They click `[Save Form]`. The JSON is saved to the `FormTemplate.definition` column. No deployment needed.

**Step 9:** When a participant registers, the system loads the `FormTemplate` for their event + participant type and renders the form using the same `FormRenderer` component that powers the preview.

### 14.12 Industry Reference: Who Does This Well

| Product | Approach | Notable Feature |
|---------|----------|-----------------|
| **Salesforce Lightning** | Page layout editor with sections + columns + field slots | Dynamic Forms: per-field visibility rules on record pages |
| **Typeform** | One-question-per-screen with logic jumps | Beautiful UX, but too limited for data-heavy registration |
| **SurveyJS** | Pages > panels > elements with `colSpan` grid | Most comprehensive JSON schema for conditional logic |
| **formio.js** | 12-column grid with panels, columns, wizard mode | Closest open-source reference to what we need (MIT licensed) |
| **bpmn-io/form-js** | 12-column grid with row grouping | Cleanest data model - great reference for the JSON schema |
| **Google Forms** | Flat list, single column, page breaks | Too simple for accreditation but good UX inspiration for wizard flow |

The recommended design takes the **grid system from formio.js/bpmn-io**, the **conditional logic from SurveyJS**, and the **visual builder UX from the existing badge designer** in this codebase.

### 14.13 Working with Sections

Sections are the main organizational unit inside a page. They group related fields under a title, control column layout, and can be conditionally shown or hidden. Here's exactly how an admin works with them.

#### What a Section Is

A section is a **titled card** on the canvas that contains fields arranged in a grid:

```
┌─ Personal Information ──────────────────────────────────────┐
│                                                              │
│  ┌──────────┐  ┌────────────────┐  ┌────────────────────┐  │
│  │ Title  ▾ │  │ First Name     │  │ Family Name        │  │
│  └──────────┘  └────────────────┘  └────────────────────┘  │
│                                                              │
│  ┌────────────────────────┐  ┌──────────────────────────┐  │
│  │ Date of Birth   📅     │  │ Gender  (●) M  ( ) F    │  │
│  └────────────────────────┘  └──────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘

┌─ Passport Details ──────────────────────────────────────────┐
│                                                              │
│  ┌────────────────────────┐  ┌──────────────────────────┐  │
│  │ Passport Number        │  │ Passport Expiry   📅     │  │
│  └────────────────────────┘  └──────────────────────────┘  │
│                                                              │
└──────────────────────────────────────────────────────────────┘

           [+ Add Section]
```

Each section maps to this JSON:

```json
{
  "id": "sec_personal",
  "title": "Personal Information",
  "description": "Basic identity details",
  "order": 1,
  "columns": 2,
  "collapsible": false,
  "visibleIf": null,
  "fields": [ ... ]
}
```

#### Adding a Section

The admin clicks **[+ Add Section]** at the bottom of a page. A dialog appears:

```
┌─ New Section ───────────────────────────────────────┐
│                                                      │
│  Title:  [________________________]                  │
│                                                      │
│  Description (optional):                             │
│  [____________________________________________]      │
│                                                      │
│  Columns:                                            │
│  [① Single]  [② Two columns]  [③ Three]  [④ Four]  │
│      ▬            ▬ ▬          ▬ ▬ ▬       ▬▬▬▬     │
│                                                      │
│  Options:                                            │
│  ☐ Collapsible (participant can expand/collapse)     │
│  ☐ Start collapsed                                   │
│                                                      │
│              [Cancel]  [Add Section]                 │
│                                                      │
└──────────────────────────────────────────────────────┘
```

The "Columns" choice is a visual hint for the admin - it sets the default `colSpan` when fields are dropped in:

| Columns Setting | Default colSpan per field | Visual |
|----------------|--------------------------|--------|
| 1 (Single) | 12 (full width) | Fields stack vertically |
| 2 (Two) | 6 (half width) | Two fields per row |
| 3 (Three) | 4 (one third) | Three fields per row |
| 4 (Four) | 3 (one quarter) | Four fields per row |

The admin can still override individual field widths after dropping them in - this just sets the starting default so they don't have to resize every field.

#### Reordering Sections

Sections within a page are **drag-sortable**. Each section has a drag handle on its title bar:

```
┌─ ⋮⋮ Personal Information ──────────── [⚙] [🗑] ──┐
│  ...fields...                                       │
└─────────────────────────────────────────────────────┘
                        ↕  drag to reorder
┌─ ⋮⋮ Passport Details ──────────────── [⚙] [🗑] ──┐
│  ...fields...                                       │
└─────────────────────────────────────────────────────┘
```

The `⋮⋮` is the drag handle. `⚙` opens section settings. `🗑` deletes the section (with confirmation if it contains fields).

Implementation uses the same `@dnd-kit` SortableContext used for fields, but at the section level:

```tsx
<SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
  {page.sections
    .sort((a, b) => a.order - b.order)
    .map(section => (
      <SortableSection key={section.id} section={section}>
        {/* Fields inside are their own SortableContext */}
        <SortableContext items={fieldIds} strategy={rectSortingStrategy}>
          <div className="grid grid-cols-12 gap-3">
            {section.fields.map(field => (
              <SortableField key={field.id} field={field} />
            ))}
          </div>
        </SortableContext>
      </SortableSection>
    ))}
</SortableContext>
```

This gives **nested drag-and-drop**: sections can be reordered among themselves, and fields can be reordered within a section or dragged between sections.

#### Editing a Section

Clicking the `⚙` gear icon on a section opens its settings in the Properties panel:

```
┌─ Section Properties ────────────────────────────────┐
│                                                      │
│  ┌─ General ─────────────────────────────────────┐  │
│  │                                                │  │
│  │  Title:  [Personal Information     ]           │  │
│  │                                                │  │
│  │  Description:                                  │  │
│  │  [Basic identity details           ]           │  │
│  │                                                │  │
│  │  Columns:                                      │  │
│  │  [① ] [②✓] [③ ] [④ ]                         │  │
│  │                                                │  │
│  │  ☐ Collapsible                                 │  │
│  │  ☐ Start collapsed                             │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Visibility ──────────────────────────────────┐  │
│  │                                                │  │
│  │  ☐ Add visibility rule                         │  │
│  │                                                │  │
│  │  Show this section only when:                  │  │
│  │  [participantType ▾] [equals ▾] [Driver    ▾] │  │
│  │                                                │  │
│  │  [+ Add another condition]                     │  │
│  │  Match: (●) All conditions  ( ) Any condition  │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

The visibility rule on a section hides **the entire section and all its fields** when the condition is false. This is more efficient than putting the same `visibleIf` on every individual field.

**Example use case:** A "Vehicle Information" section only appears for Driver and Security Driver participant types:

```json
{
  "id": "sec_vehicle",
  "title": "Vehicle Information",
  "columns": 2,
  "order": 3,
  "visibleIf": {
    "type": "compound",
    "operator": "or",
    "conditions": [
      { "type": "simple", "field": "participantType", "operator": "eq", "value": "Driver" },
      { "type": "simple", "field": "participantType", "operator": "eq", "value": "Security Driver" }
    ]
  },
  "fields": [
    { "key": "vehicle_type", "type": "select", "label": "Vehicle Type", "layout": { "colSpan": 6 } },
    { "key": "plate_number", "type": "text", "label": "Plate Number", "layout": { "colSpan": 6 } },
    { "key": "drivers_license", "type": "file", "label": "Driver's License", "layout": { "colSpan": 12 } }
  ]
}
```

#### Moving Fields Between Sections

Fields can be dragged from one section to another. When a field is dragged over a different section, the target section highlights:

```
┌─ Personal Information ──────────────────────────────┐
│  ┌──────────┐  ┌────────────────┐                   │
│  │ Title  ▾ │  │ First Name  ⤡  │  ← dragging this │
│  └──────────┘  └────────┼───────┘                   │
│                          │                           │
└──────────────────────────┼───────────────────────────┘
                           │
                           ↓  drop zone highlights
┌─ Passport Details ════════════════════════════════════┐
│  ┌ ─ ─ ─ ─ ─ ─ ─ ─ ┐  ┌──────────────────────────┐ │
│  │  Drop here        │  │ Passport Number          │ │
│  └ ─ ─ ─ ─ ─ ─ ─ ─ ┘  └──────────────────────────┘ │
│                                                       │
└═══════════════════════════════════════════════════════┘
```

The `@dnd-kit` library handles this with multiple `SortableContext` containers. When a drag moves between containers, the `onDragOver` event detects the new container and shows the insertion indicator.

#### Empty Section State

A freshly added section with no fields shows a drop target:

```
┌─ Travel Information ────────────────────────────────┐
│                                                      │
│         ┌ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┐       │
│         │                                   │       │
│         │   Drag fields here from the       │       │
│         │   palette, or from another         │       │
│         │   section                          │       │
│         │                                   │       │
│         └ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

#### Collapsible Sections

When `collapsible: true`, the section renders with a chevron that participants can click to expand/collapse:

```
Expanded:
┌─ ▼ Travel Information ──────────────────────────────┐
│  ┌────────────────────────┐  ┌─────────────────────┐│
│  │ Flight Number          │  │ Arrival Date    📅  ││
│  └────────────────────────┘  └─────────────────────┘│
└──────────────────────────────────────────────────────┘

Collapsed:
┌─ ► Travel Information ──────────────────────────────┐
└──────────────────────────────────────────────────────┘
```

If `defaultCollapsed: true`, the section starts collapsed when the form loads. Useful for optional information that most participants don't need.

#### Deleting a Section

Clicking `🗑` shows a confirmation:

```
┌─ Delete Section ────────────────────────────────────┐
│                                                      │
│  Delete "Passport Details" and its 2 fields?         │
│                                                      │
│  ☐ Move fields to the section above instead          │
│                                                      │
│              [Cancel]  [Delete]                       │
│                                                      │
└──────────────────────────────────────────────────────┘
```

The "move fields" option prevents accidental data loss - the fields are relocated rather than removed.

#### Duplicating a Section

Right-click context menu or a `⋯` overflow menu on the section title bar includes "Duplicate Section". This copies the section and all its fields (with new IDs) immediately below the original. Useful when two participant types need similar but slightly different field groups.

#### Section Templates

For common groupings that admins reuse across events, sections can be saved as **section templates**:

```
┌─ Save as Section Template ──────────────────────────┐
│                                                      │
│  Name:  [Personal Information Standard  ]            │
│                                                      │
│  This saves the section layout and field             │
│  arrangement (but not field data) as a reusable      │
│  template for future forms.                          │
│                                                      │
│              [Cancel]  [Save Template]                │
│                                                      │
└──────────────────────────────────────────────────────┘
```

When adding a new section, the admin can choose **"From Template"** to start from a saved section template instead of from scratch:

```
[+ Add Section]  [+ From Template ▾]
                  ├─ Personal Information Standard
                  ├─ Passport & Identity
                  ├─ Travel & Logistics
                  ├─ Vehicle Details
                  └─ Weapon Registration
```

### 14.14 Working with Pages

Pages are the top-level containers - each page becomes one step in the wizard. Here's how admins manage them.

#### Adding Pages

A tab bar at the top of the canvas shows all pages with an add button:

```
┌─────────────────────────────────────────────────────────────────┐
│ [Personal Info] [Organization] [Travel] [Documents]  [+ Page]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  (canvas for the selected page)                                 │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

Clicking `[+ Page]` opens a dialog:

```
┌─ New Page ──────────────────────────────────────────┐
│                                                      │
│  Title:       [________________________]             │
│                                                      │
│  Description (shown to participant):                 │
│  [____________________________________________]      │
│                                                      │
│  ☐ Add visibility rule                               │
│    (show this page only for certain conditions)      │
│                                                      │
│              [Cancel]  [Add Page]                     │
│                                                      │
└──────────────────────────────────────────────────────┘
```

#### Reordering Pages

Pages can be reordered by dragging their tabs:

```
[Personal Info] [Organization] ← → [Travel] [Documents]
                                drag
```

#### Page-Level Visibility

The most powerful use of page-level `visibleIf` is **showing different pages for different participant types**:

```
Page: "Security Details"
visibleIf: participantType equals "Armed Security"

Page: "Press Credentials"
visibleIf: participantType equals "Press / Media"

Page: "Vehicle Registration"
visibleIf: participantType in ["Driver", "Security Driver"]
```

A Minister filling out the form sees: Personal Info → Organization → Travel → Documents (4 pages).

An Armed Security guard sees: Personal Info → Organization → Travel → **Security Details** → Documents (5 pages).

A Press/Media participant sees: Personal Info → Organization → Travel → **Press Credentials** → Documents (5 pages).

All from the **same form template**, with the wizard automatically adjusting its steps based on conditions.

#### Page Settings

Right-clicking a page tab or clicking a gear icon opens page settings in the Properties panel:

```
┌─ Page Properties ───────────────────────────────────┐
│                                                      │
│  Title:       [Travel Information      ]             │
│  Description: [Flight and visa details ]             │
│  Order:       [3]                                    │
│                                                      │
│  ┌─ Visibility ──────────────────────────────────┐  │
│  │  ☑ Add visibility rule                         │  │
│  │                                                │  │
│  │  Show this page only when:                     │  │
│  │  [needs_visa ▾] [equals ▾] [Yes ▾]           │  │
│  │                                                │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
│  ┌─ Navigation ──────────────────────────────────┐  │
│  │  Previous button text: [◀ Back          ]      │  │
│  │  Next button text:     [Continue ▶      ]      │  │
│  └────────────────────────────────────────────────┘  │
│                                                      │
└──────────────────────────────────────────────────────┘
```

### 14.15 Putting It All Together: Complete Admin Walkthrough

Here is the full experience of designing a registration form from scratch:

**1. Create form template**
Admin navigates to `Event > 38th AU Summit > Form Designer > [New Form]`
Enters name: "Standard Registration Form"

**2. First page auto-created**
The designer opens with one blank page titled "Page 1". Admin renames it to "Personal Information" via the page settings.

**3. Add sections to the page**
Admin clicks `[+ Add Section]` three times:
- "Full Name" (3 columns)
- "Contact Details" (2 columns)
- "Passport & Identity" (2 columns)

**4. Drag fields into sections**
From the field palette on the left, admin drags:
- `Title`, `First Name`, `Family Name` → into "Full Name" section (each gets `colSpan: 4` because section is 3-column)
- `Email`, `Phone`, `Organization`, `Job Title` → into "Contact Details" (each gets `colSpan: 6`)
- `Passport Number`, `Passport Expiry`, `Nationality` → into "Passport & Identity"

**5. Adjust field widths**
Admin clicks "Title" field, changes width from Third to Quarter (`colSpan: 3`). Clicks "First Name", changes to `colSpan: 4`. Clicks "Family Name", changes to `colSpan: 5`. The grid adjusts: 3 + 4 + 5 = 12.

**6. Add second page**
Clicks `[+ Page]`, names it "Travel Information". Adds a "Visa & Flight" section (2 columns). Drags in `Needs Visa` (switch), `Flight Number` (text), `Arrival Date` (date).

**7. Add conditional visibility**
Clicks "Flight Number" field. In Properties panel, under Visibility tab, enables rule: "Show when `needs_visa` equals `true`". Now the flight number field only appears when the visa toggle is on.

**8. Add participant-type-specific page**
Clicks `[+ Page]`, names it "Security Details". Adds visibility rule on the page: "Show when `participantType` equals `Armed Security`". Adds a "Weapon Registration" section. Drags in `Weapon Type`, `Weapon Serial`, `Weapon Permit` fields.

**9. Preview**
Toggles to Split view. The right side shows the live form. Admin selects "Armed Security" as participant type in the preview - the Security Details page appears in the wizard progress bar. Switches to "Minister" - it disappears. Toggles the visa switch - Flight Number appears/disappears.

**10. Save and publish**
Clicks `[Save Form]`. The JSON is stored. Clicks `[Publish]` to make it active. From now on, any participant registering for this event sees this form layout.

**11. Later: create a variant for Press**
Admin duplicates the form template, names it "Press Registration Form". Removes the Security Details page. Adds a "Press Credentials" page with `Media Outlet`, `Press Card Number`, `Coverage Type` fields. Assigns this template to the "Press / Media" participant type.

Now Armed Security participants see one form layout, Press participants see another, and everyone else sees the standard layout. **All from the admin UI, no code changes.**

---

## Appendix A: File Structure Overview

```
accreditationadmin/
├── app/
│   ├── components/
│   │   ├── ui/                    # 32 Radix-based UI components
│   │   ├── conform/               # 9 form field wrappers
│   │   ├── workflow-builder/      # Visual workflow editor
│   │   ├── badge-designer/        # Badge template designer
│   │   ├── wizard/                # Multi-step wizard
│   │   ├── custom-reports/        # Report builder UI
│   │   ├── reports/               # Report display + PDF
│   │   └── *.tsx                  # Shared components
│   ├── routes/
│   │   ├── _auth+/               # 7 auth routes
│   │   ├── _misc+/               # 4 static pages
│   │   ├── admin+/               # 182 admin routes
│   │   ├── validator+/           # 12 validator routes
│   │   ├── printer+/             # 14 printer routes
│   │   ├── dispatcher+/          # 8 dispatcher routes
│   │   ├── settings+/            # 11 user settings routes
│   │   └── resources+/           # 13 API/file routes
│   ├── utils/
│   │   ├── auth.server.ts         # Authentication & RBAC
│   │   ├── workflow.server.ts     # Workflow execution engine
│   │   ├── db.server.ts           # Database + pagination
│   │   ├── audit.server.ts        # Audit logging
│   │   ├── settings.server.ts     # System settings
│   │   ├── reports.server.ts      # Report generators
│   │   ├── backup.server.ts       # Database backup
│   │   ├── email.server.ts        # Azure email
│   │   ├── storage.server.ts      # Azure Blob Storage
│   │   ├── verification.server.ts # OTP/2FA
│   │   ├── cache.server.ts        # In-memory cache
│   │   ├── csrf.server.ts         # CSRF tokens
│   │   ├── honeypot.server.ts     # Bot protection
│   │   ├── session.server.ts      # Session management
│   │   ├── toast.server.ts        # Flash messages
│   │   └── impersonation.server.ts # Admin impersonation
│   └── root.tsx                    # App shell
├── prisma/
│   ├── schema.prisma              # 30 models, 13 enums
│   ├── seed.ts                    # 2000+ lines of seed data
│   └── migrations/                # Database migrations
├── scripts/                       # 12 CLI management tools
├── config/svgs/                   # Source SVGs for icons
├── server.js                      # Express server (200 lines)
├── vite.config.ts                 # Build configuration
├── tailwind.config.ts             # Design tokens
└── package.json                   # 83 deps + 43 dev deps
```

## Appendix B: Database Model Count Summary

| Category | Models | Description |
|----------|--------|-------------|
| **Identity** | 6 | User, Password, UserImage, Session, Verification, Role/Permission |
| **Organization** | 3 | Tenant, Venue, Menu/MenuItem |
| **Event** | 4 | Event, Meeting, MeetingType, Country/Title |
| **Workflow** | 4 | Workflow, Step, WorkflowTemplate, StepTemplate |
| **Participant** | 5 | Participant, ParticipantDocument, ParticipantType, Approval, UserEventAccess |
| **Invitation** | 4 | Invitation, InvitationConstraint, Restriction, Constraint |
| **Content** | 3 | Template, Attachment, BadgeTemplate |
| **System** | 4 | AuditLog, SystemSetting, DatabaseBackup, CustomReport |

---

*This document represents a point-in-time analysis. Recommendations should be validated against current business priorities and resource availability.*
