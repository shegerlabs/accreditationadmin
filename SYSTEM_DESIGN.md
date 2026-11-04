# Accreditation Platform - System Design Document

**Date:** February 5, 2026
**Version:** 1.0
**Status:** Draft

---

## Table of Contents

1. [Vision & Goals](#1-vision--goals)
2. [System Architecture](#2-system-architecture)
3. [Data Model](#3-data-model)
4. [Dynamic Schema Engine](#4-dynamic-schema-engine)
5. [Visual Form Designer](#5-visual-form-designer)
6. [Workflow Engine](#6-workflow-engine)
7. [Security Architecture](#7-security-architecture)
8. [Infrastructure & DevOps](#8-infrastructure--devops)
9. [API Layer](#9-api-layer)
10. [Real-Time System](#10-real-time-system)
11. [UI/UX Design](#11-uiux-design)
12. [Feature Specifications](#12-feature-specifications)
13. [Settings & Configuration Management](#13-settings--configuration-management)
14. [Implementation Roadmap](#14-implementation-roadmap)

---

## 1. Vision & Goals

### 1.1 Product Vision

A **multi-tenant accreditation platform** that enables any organization to manage event registration, document verification, multi-step approval workflows, and badge generation — without developer intervention for per-event customization.

The platform transforms from a single-purpose tool into a **configurable engine** where tenant administrators define their own data models, form layouts, approval pipelines, and badge designs through visual interfaces.

### 1.2 Design Principles

| Principle | Description |
|-----------|-------------|
| **Configuration over Code** | Admins customize events through UI-based field definitions, form designers, and workflow builders — no migrations or deployments |
| **Tenant Isolation** | Every data record, file, and configuration is scoped to a tenant with no cross-tenant data leakage |
| **Type Safety at the Core** | Universal fields (identity, status, workflow position) remain as typed Prisma columns; only event-specific fields use dynamic JSONB |
| **Progressive Disclosure** | Simple events work out of the box; advanced features (conditional forms, parallel workflows, custom objects) are available but not required |
| **Offline-First Operations** | Badge printing, collection, and scanning work without continuous connectivity |
| **Audit Everything** | Every state change, approval, login, and configuration change is logged with user, timestamp, IP, and metadata |

### 1.3 Key Stakeholders and Their Needs

| Stakeholder | Primary Need |
|-------------|-------------|
| **Tenant Admin** | Configure events, define fields, design forms, set up workflows — all without developers |
| **Focal Point** | Self-service portal to register delegation members within assigned quotas |
| **Validator** | Fast, mobile-friendly queue to review and approve/reject registrations |
| **Printer** | Print queue with batch operations and offline support |
| **Dispatcher** | Badge collection tracking with QR scanning |
| **Participant** | Clean, adaptive registration form that shows only relevant fields |
| **Platform Admin** | System health, tenant management, and cross-tenant operations |

---

## 2. System Architecture

### 2.1 Technology Stack

| Layer | Technology | Rationale |
|-------|-----------|-----------|
| **Runtime** | Node.js >= 20 | LTS support, native ESM, performance improvements |
| **Framework** | React Router 7 + Vite | Server-first rendering, nested routing, progressive enhancement |
| **Server** | Express 4 | Middleware ecosystem (rate limiting, Helmet, compression) |
| **Database** | PostgreSQL 16 + Prisma 5 | JSONB for dynamic fields, GIN indexes, full-text search, Prisma type safety |
| **UI** | React 18, Radix UI, Tailwind CSS | Accessible primitives, utility-first styling, design token consistency |
| **Forms** | Conform + Zod | Server-validated forms with progressive enhancement |
| **File Storage** | Azure Blob Storage | Document, photo, and backup persistence |
| **Email** | Azure Communication Services | Transactional and broadcast email |
| **Real-Time** | Server-Sent Events (SSE) | Live queue updates for validators, printers, dispatchers |
| **PDF** | @react-pdf/renderer | Badge and report generation |
| **Visual Editors** | @dnd-kit (forms), @xyflow/react (workflows) | Drag-and-drop form design, node-based workflow building |
| **Testing** | Vitest + MSW + Playwright | Unit, integration, and E2E testing with Vite-native runner |
| **Monitoring** | Sentry + Pino + Azure App Insights | Error tracking, structured logging, APM |

### 2.2 Architecture Diagram

```
┌──────────────────────────────────────────────────────────────────┐
│  CLIENT (Browser / PWA)                                          │
│  ├── React 18 + Radix UI + Tailwind CSS                         │
│  ├── Conform forms (progressive enhancement)                     │
│  ├── SSE connection (live queue updates)                         │
│  ├── Service Worker (offline badge collection/printing)          │
│  └── @dnd-kit / @xyflow/react (visual editors)                  │
├──────────────────────────────────────────────────────────────────┤
│  EXPRESS SERVER                                                   │
│  ├── Helmet (CSP with nonces, HSTS, permissions-policy)          │
│  ├── Rate Limiting (3-tier: general 100, mutations 50, auth 10)  │
│  ├── Compression + Structured Logging (Pino)                     │
│  └── Suspicious Request Blocking                                  │
├──────────────────────────────────────────────────────────────────┤
│  REACT ROUTER 7 SSR LAYER                                         │
│  ├── Loaders: data fetching + auth guards + tenant scoping       │
│  ├── Actions: form submissions + workflow execution               │
│  ├── SSE Streams: validator/printer/dispatcher queue updates     │
│  └── Resource Routes: file downloads, API endpoints               │
├──────────────────────────────────────────────────────────────────┤
│  BUSINESS LOGIC LAYER                                             │
│  ├── Workflow Engine (state machine + conditional routing)        │
│  ├── Dynamic Schema Engine (field defs → Zod → Conform)          │
│  ├── Form Layout Engine (JSON definition → rendered form)        │
│  ├── Authentication (session + 2FA + progressive lockout)        │
│  ├── Authorization (RBAC + tenant scope + event access)          │
│  ├── Audit System (every state change logged)                    │
│  ├── Notification Engine (in-app + email + configurable prefs)   │
│  ├── Report Engine (predefined + custom + JSONB aggregations)    │
│  └── SLA Enforcement (background job for overdue step detection) │
├──────────────────────────────────────────────────────────────────┤
│  DATA ACCESS LAYER                                                │
│  ├── Prisma ORM (typed queries for fixed columns)                │
│  ├── Raw SQL (JSONB queries for custom fields)                   │
│  ├── Expression Indexes (auto-created for searchable fields)     │
│  └── In-Memory Cache (countries, roles, titles, field defs)      │
├──────────────────────────────────────────────────────────────────┤
│  EXTERNAL SERVICES                                                │
│  ├── Azure Blob Storage (documents, photos, backups)             │
│  ├── Azure Communication Services (email)                        │
│  ├── Sentry (error tracking)                                     │
│  └── Azure Application Insights (APM)                            │
├──────────────────────────────────────────────────────────────────┤
│  INFRASTRUCTURE                                                   │
│  ├── Docker (multi-stage build: deps → build → production)       │
│  ├── PostgreSQL 16 (primary database)                            │
│  ├── GitHub Actions CI/CD (lint → test → build → deploy)         │
│  └── Health Check (/up endpoint)                                  │
└──────────────────────────────────────────────────────────────────┘
```

### 2.3 Request Flow

```
Browser → Express (Helmet, Rate Limit, Compression)
       → React Router Handler
       → Loader/Action (auth guard → tenant scoping)
       → Business Logic (workflow, schema, validation)
       → Prisma / Raw SQL
       → PostgreSQL
       → Response (SSR HTML or JSON)
```

### 2.4 Multi-Tenancy Model

Every data record includes a `tenantId` foreign key. Queries are scoped by tenant at the data access layer. Unique constraints are composite with `tenantId` to prevent cross-tenant conflicts.

```
Tenant A: Event 1, Event 2 → isolated data
Tenant B: Event 3, Event 4 → isolated data
Platform Admin: cross-tenant visibility (GLOBAL scope)
```

---

## 3. Data Model

### 3.1 Model Relationship Map

```
Tenant ──┬── Event ──┬── Meeting
         │           ├── Restriction ── Constraint
         │           ├── Workflow ── WorkflowVersion ── Step
         │           ├── Invitation ── InvitationConstraint
         │           ├── Participant ── ParticipantDocument
         │           │                  └── Approval
         │           ├── Template ── Attachment
         │           ├── FormTemplate
         │           ├── CustomFieldDef
         │           ├── CustomObjectRecord
         │           └── UserEventAccess
         │
         ├── Venue
         ├── MeetingType
         ├── ParticipantType
         ├── BadgeTemplate
         ├── WorkflowTemplate ── StepTemplate
         ├── CustomObjectDef ── CustomFieldDef
         ├── SavedView
         ├── SectionTemplate
         ├── AuditLog
         ├── Notification
         └── CustomReport

User ──┬── Password
       ├── UserImage
       ├── Session
       ├── Role ──── Permission
       ├── Approval
       ├── NotificationPreference
       ├── UserEventAccess
       └── AuditLog
```

### 3.2 Core Schema

#### Identity & Access

```prisma
model Tenant {
  id               String   @id @default(cuid())
  name             String   @unique
  email            String   @unique
  phone            String
  website          String?
  address          String?
  city             String?
  state            String?
  zip              String?
  country          String?
  billingInfo      Json?
  subscriptionPlan String
  featureFlags     Json?
  usageMetrics     Json?
  createdAt        DateTime @default(now())
  updatedAt        DateTime @updatedAt

  // Relations
  events            Event[]
  users             User[]
  venues            Venue[]
  meetingTypes      MeetingType[]
  participantTypes  ParticipantType[]
  meetings          Meeting[]
  restrictions      Restriction[]
  constraints       Constraint[]
  workflows         Workflow[]
  workflowTemplates WorkflowTemplate[]
  steps             Step[]
  invitations       Invitation[]
  participants      Participant[]
  templates         Template[]
  badgeTemplates    BadgeTemplate[]
  formTemplates     FormTemplate[]
  customObjectDefs  CustomObjectDef[]
  customFieldDefs   CustomFieldDef[]
  customObjectRecords CustomObjectRecord[]
  savedViews        SavedView[]
  sectionTemplates  SectionTemplate[]
  notifications     Notification[]
  auditLogs         AuditLog[]
  customReports     CustomReport[]
  systemSettings    SystemSetting[]

  @@index([name, email])
}

model User {
  id                  String     @id @default(cuid())
  email               String     @unique
  username            String     @unique
  name                String?
  status              UserStatus @default(ACTIVE)
  failedLoginAttempts Int        @default(0)
  lastFailedLoginAt   DateTime?
  lockedAt            DateTime?
  lockReason          String?
  lockCount           Int        @default(0)
  autoUnlockAt        DateTime?
  createdAt           DateTime   @default(now())
  updatedAt           DateTime   @updatedAt
  deletedAt           DateTime?

  image                  UserImage?
  password               Password?
  tenantId               String?
  tenant                 Tenant?    @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  roles                  Role[]
  sessions               Session[]
  approvals              Approval[]
  participants           Participant[]
  auditLogs              AuditLog[]
  eventAccess            UserEventAccess[]
  backups                DatabaseBackup[]
  customReports          CustomReport[]
  notifications          Notification[]
  notificationPreferences NotificationPreference[]

  @@index([deletedAt])
}

model Role {
  id          String    @id @default(cuid())
  name        String
  scope       RoleScope @default(EVENT)
  description String?
  tenantId    String?
  createdAt   DateTime  @default(now())
  updatedAt   DateTime  @updatedAt

  permissions   Permission[]
  users         User[]
  menus         Menu[]
  menuItems     MenuItem[]
  steps         Step[]
  stepTemplates StepTemplate[]
  eventAccess   UserEventAccess[]

  @@unique([tenantId, name])
  @@index([scope])
}

enum RoleScope {
  GLOBAL
  TENANT
  EVENT
}

model Permission {
  id          String   @id @default(cuid())
  action      String
  entity      String
  access      String
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt
  roles       Role[]

  @@unique([action, entity, access])
}

model Session {
  id             String   @id @default(cuid())
  expirationDate DateTime
  userId         String
  user           User     @relation(fields: [userId], references: [id], onDelete: Cascade)
  metadata       Json?
  createdAt      DateTime @default(now())
  updatedAt      DateTime @updatedAt

  @@index([userId])
}
```

#### Event Management

```prisma
model Event {
  id          String      @id @default(cuid())
  name        String
  description String
  tenantId    String
  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  status      EventStatus
  startDate   DateTime
  endDate     DateTime
  customData  Json        @default("{}")  // Event-level custom metadata
  createdAt   DateTime    @default(now())
  updatedAt   DateTime    @updatedAt
  deletedAt   DateTime?

  meetings          Meeting[]
  restrictions      Restriction[]
  workflows         Workflow[]
  invitations       Invitation[]
  participants      Participant[]
  templates         Template[]
  formTemplates     FormTemplate[]
  customFieldDefs   CustomFieldDef[]
  customObjectRecords CustomObjectRecord[]
  userAccess        UserEventAccess[]

  @@unique([tenantId, name])
  @@index([tenantId, status])
  @@index([deletedAt])
}

enum EventStatus {
  DRAFT
  PUBLISHED
  CANCELED
  COMPLETED
  POSTPONED
  RESCHEDULED
}

model ParticipantType {
  id                               String   @id @default(cuid())
  tenantId                         String
  tenant                           Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name                             String
  description                      String
  priority                         Priority
  isExemptedFromFullQuota          Boolean
  isExemptedFromOpenSessionQuota   Boolean
  isExemptedFromClosedSessionQuota Boolean
  createdAt                        DateTime @default(now())
  updatedAt                        DateTime @updatedAt

  constraints           Constraint[]
  workflows             Workflow[]
  invitations           Invitation[]
  participants          Participant[]
  templates             Template[]
  formTemplates         FormTemplate[]
  customFieldDefs       CustomFieldDef[]
  invitationConstraints InvitationConstraint[]

  @@unique([tenantId, name])
}
```

#### Participant & Registration

```prisma
model Participant {
  id                String        @id @default(cuid())
  userId            String
  user              User          @relation(fields: [userId], references: [id], onDelete: Cascade)
  tenantId          String
  tenant            Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId           String
  event             Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  invitationId      String?
  invitation        Invitation?   @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  participantTypeId String
  participantType   ParticipantType @relation(fields: [participantTypeId], references: [id], onDelete: Cascade)

  // Universal fields (every event needs these)
  registrationCode  String        @unique
  gender            String
  titleId           String
  title             Title         @relation(fields: [titleId], references: [id], onDelete: Cascade)
  firstName         String
  familyName        String
  dateOfBirth       DateTime
  nationalityId     String
  nationality       Country       @relation("Nationality", fields: [nationalityId], references: [id], onDelete: Cascade)
  organization      String
  jobTitle          String
  countryId         String
  country           Country       @relation("Country", fields: [countryId], references: [id], onDelete: Cascade)
  email             String?

  // Dynamic fields (event/type-specific, defined by CustomFieldDef)
  customData        Json          @default("{}")

  // Workflow state
  status            RequestStatus
  stepId            String
  step              Step          @relation(fields: [stepId], references: [id], onDelete: Cascade)
  workflowVersionId String?
  workflowVersion   WorkflowVersion? @relation(fields: [workflowVersionId], references: [id])

  // Collection tracking
  collectedBy       String?
  collectedByPhone  String?
  collectionNotes   String?
  collectedAt       DateTime?
  reprintCount      Int           @default(0)

  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt
  deletedAt         DateTime?

  approvals           Approval[]
  documents           ParticipantDocument[]
  customObjectRecords CustomObjectRecord[]

  @@unique([tenantId, eventId, registrationCode])
  @@index([deletedAt])
  @@index([eventId, stepId, status])
  @@index([tenantId, eventId, participantTypeId])
  @@index([status, createdAt])
  @@index([userId])
  @@index([invitationId])
  @@index([titleId])
}

enum RequestStatus {
  PENDING
  INPROGRESS
  APPROVED
  REJECTED
  CANCELLED
  PRINTED
  COLLECTED
  NOTIFIED
  ARCHIVED
  BYPASSED
}
```

#### Workflow System

```prisma
model Workflow {
  id                String          @id @default(cuid())
  name              String
  tenantId          String
  tenant            Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId           String
  event             Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)
  participantTypeId String
  participantType   ParticipantType @relation(fields: [participantTypeId], references: [id], onDelete: Cascade)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  deletedAt         DateTime?

  steps    Step[]
  versions WorkflowVersion[]

  @@unique([tenantId, eventId, participantTypeId, name])
  @@index([eventId, participantTypeId])
  @@index([deletedAt])
}

model WorkflowVersion {
  id         String   @id @default(cuid())
  workflowId String
  workflow   Workflow  @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  version    Int
  snapshot   Json     // Full serialized workflow + steps at time of version
  createdAt  DateTime @default(now())

  participants Participant[]

  @@unique([workflowId, version])
  @@index([workflowId])
}

model Step {
  id         String   @id @default(cuid())
  tenantId   String
  tenant     Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  order      Int
  name       String
  action     Action
  workflowId String
  workflow   Workflow @relation(fields: [workflowId], references: [id], onDelete: Cascade)
  roleId     String
  role       Role     @relation(fields: [roleId], references: [id], onDelete: Cascade)

  // Routing
  nextStepId         String?
  isRejectionTarget  Boolean  @default(false)
  isBypassTarget     Boolean  @default(false)

  // Conditional routing (advanced)
  conditions         Json     @default("[]")
  // [{"field": "participantType.name", "op": "eq", "value": "VIP", "nextStepId": "..."}]

  // Configuration
  requiresAssignment Boolean  @default(true)
  slaDurationMinutes Int?
  autoAction         Json?    // Auto-action rules: {"rule": "autoApprove", "conditions": [...]}

  // Visual builder position
  positionX          Float?
  positionY          Float?

  createdAt    DateTime          @default(now())
  updatedAt    DateTime          @updatedAt
  participants Participant[]
  approvals    Approval[]
  userAccess   UserEventAccess[]
  assignments  StepAssignment[]

  @@unique([tenantId, workflowId, roleId, action, name])
  @@index([workflowId, action])
  @@index([workflowId, isBypassTarget])
  @@index([workflowId, isRejectionTarget])
  @@index([roleId])
}

model StepAssignment {
  id            String    @id @default(cuid())
  participantId String
  stepId        String
  assignedTo    String
  assignedBy    String
  assignedAt    DateTime  @default(now())
  completedAt   DateTime?

  @@index([assignedTo, completedAt])
  @@index([participantId])
}

model Approval {
  id            String         @id @default(cuid())
  participantId String
  participant   Participant    @relation(fields: [participantId], references: [id], onDelete: Cascade)
  stepId        String
  step          Step           @relation(fields: [stepId], references: [id], onDelete: Cascade)
  action        Action         @default(APPROVE)
  result        ApprovalResult
  remarks       String?
  userId        String
  user          User           @relation(fields: [userId], references: [id], onDelete: Cascade)
  createdAt     DateTime       @default(now())
  updatedAt     DateTime       @updatedAt

  @@unique([participantId, stepId, userId, createdAt])
  @@index([participantId, createdAt])
  @@index([userId, createdAt])
  @@index([stepId])
}

enum Action {
  APPROVE
  REJECT
  NOTIFY
  PRINT
  COLLECT
  ARCHIVE
  CANCEL
  BYPASS
  REPRINT
}
```

#### Invitation & Quota System

```prisma
model Invitation {
  id                String        @id @default(cuid())
  tenantId          String
  tenant            Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  organization      String
  name              String?
  email             String
  eventId           String
  event             Event         @relation(fields: [eventId], references: [id], onDelete: Cascade)
  participantTypeId String?
  participantType   ParticipantType? @relation(fields: [participantTypeId], references: [id], onDelete: Cascade)
  restrictionId     String?
  restriction       Restriction?  @relation(fields: [restrictionId], references: [id], onDelete: Cascade)
  maximumQuota      Int?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  participants          Participant[]
  invitationConstraints InvitationConstraint[]

  @@unique([tenantId, eventId, organization, email])
  @@index([tenantId, eventId, email])
}

model Restriction {
  id        String   @id @default(cuid())
  tenantId  String
  tenant    Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId   String
  event     Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name      String
  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  constraints           Constraint[]
  invitations           Invitation[]
  invitationConstraints InvitationConstraint[]

  @@unique([tenantId, eventId, name])
  @@index([eventId, name])
}

model Constraint {
  id                String          @id @default(cuid())
  tenantId          String
  tenant            Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name              String
  restrictionId     String
  restriction       Restriction     @relation(fields: [restrictionId], references: [id], onDelete: Cascade)
  participantTypeId String
  participantType   ParticipantType @relation(fields: [participantTypeId], references: [id], onDelete: Cascade)
  accessLevel       AccessLevel
  quota             Int
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  @@unique([tenantId, restrictionId, participantTypeId, accessLevel])
  @@index([restrictionId, participantTypeId])
}

model InvitationConstraint {
  id                  String          @id @default(cuid())
  invitationId        String
  invitation          Invitation      @relation(fields: [invitationId], references: [id], onDelete: Cascade)
  participantTypeId   String
  participantType     ParticipantType @relation(fields: [participantTypeId], references: [id], onDelete: Cascade)
  accessLevel         AccessLevel
  quota               Int?
  sourceRestrictionId String?
  sourceRestriction   Restriction?    @relation(fields: [sourceRestrictionId], references: [id], onDelete: SetNull)
  createdAt           DateTime        @default(now())
  updatedAt           DateTime        @updatedAt

  @@unique([invitationId, participantTypeId, accessLevel])
  @@index([invitationId])
  @@index([sourceRestrictionId])
}

enum AccessLevel {
  OPEN
  CLOSED
}
```

#### Badge & Template System

```prisma
model BadgeTemplate {
  id          String  @id @default(cuid())
  tenantId    String
  tenant      Tenant  @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name        String
  description String?
  width       Float   @default(153)
  height      Float   @default(243)
  borderWidth  Float  @default(0)
  borderColor  String @default("#000000")
  borderRadius Float  @default(0)
  elements    Json    @default("[]")
  badgeIdPrefix String @default("BADGE")
  isDefault   Boolean @default(false)
  templates   Template[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, name])
  @@index([tenantId])
}

model Template {
  id                String          @id @default(cuid())
  name              String
  description       String?
  templateType      TemplateType
  tenantId          String
  tenant            Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId           String
  event             Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)
  participantTypeId String
  participantType   ParticipantType @relation(fields: [participantTypeId], references: [id], onDelete: Cascade)
  badgeTemplateId   String?
  badgeTemplate     BadgeTemplate?  @relation(fields: [badgeTemplateId], references: [id], onDelete: SetNull)
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt
  attachments       Attachment[]

  @@unique([tenantId, eventId, templateType, name])
}
```

#### Notification System

```prisma
model Notification {
  id        String           @id @default(cuid())
  tenantId  String
  tenant    Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userId    String
  user      User             @relation(fields: [userId], references: [id], onDelete: Cascade)
  type      NotificationType
  title     String
  body      String
  readAt    DateTime?
  metadata  Json?
  createdAt DateTime         @default(now())

  @@index([userId, readAt, createdAt])
  @@index([tenantId])
}

enum NotificationType {
  APPROVAL
  REJECTION
  SLA_WARNING
  ASSIGNMENT
  SYSTEM
  BROADCAST
}

model NotificationPreference {
  id      String              @id @default(cuid())
  userId  String
  user    User                @relation(fields: [userId], references: [id], onDelete: Cascade)
  channel NotificationChannel
  enabled Boolean             @default(true)

  @@unique([userId, channel])
}

enum NotificationChannel {
  EMAIL
  IN_APP
  SMS
}
```

#### Audit & System

```prisma
model AuditLog {
  id          String          @id @default(cuid())
  tenantId    String?
  tenant      Tenant?         @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  userId      String?
  user        User?           @relation(fields: [userId], references: [id], onDelete: SetNull)
  action      AuditAction
  entityType  AuditEntityType
  entityId    String?
  description String
  metadata    Json?
  ipAddress   String?
  userAgent   String?
  createdAt   DateTime        @default(now())

  @@index([tenantId, action])
  @@index([tenantId, entityType, entityId])
  @@index([tenantId, userId])
  @@index([createdAt])
}

model SystemSetting {
  id          String      @id @default(cuid())
  key         String
  value       String
  type        SettingType @default(STRING)
  category    String
  label       String
  description String?
  tenantId    String?

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([key, tenantId])
  @@index([category])
  @@index([tenantId])
}
```

---

## 4. Dynamic Schema Engine

### 4.1 Design Philosophy

The system uses a **Hybrid Approach**: universal fields remain as typed Prisma columns with full type safety and standard indexing, while event-specific and participant-type-specific fields are stored in a `customData` JSONB column and defined through metadata records.

```
┌─────────────────────────────────────────────────────────────┐
│                    METADATA LAYER                           │
│  CustomFieldDef records describe fields:                    │
│  "weapon_serial" → TEXT, required, max 20 chars             │
│  "needs_visa" → BOOLEAN, optional                           │
├─────────────────────────────────────────────────────────────┤
│                    STORAGE LAYER                            │
│  Participant.customData JSONB:                              │
│  {"weapon_serial": "AK-2024-001", "needs_visa": true}     │
├─────────────────────────────────────────────────────────────┤
│                    VALIDATION LAYER                          │
│  Zod schema auto-built from CustomFieldDef metadata         │
├─────────────────────────────────────────────────────────────┤
│                    RENDERING LAYER                           │
│  Dynamic renderer maps dataType → Conform component         │
├─────────────────────────────────────────────────────────────┤
│                    QUERY LAYER                               │
│  Fixed: Prisma queries | Custom: JSONB + expression indexes │
└─────────────────────────────────────────────────────────────┘
```

### 4.2 Custom Field Definitions

```prisma
model CustomFieldDef {
  id                String           @id @default(cuid())
  tenantId          String
  tenant            Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Target: built-in model or custom object
  targetModel       String?          // "Participant", "Event", null for custom objects
  customObjectDefId String?
  customObjectDef   CustomObjectDef? @relation(fields: [customObjectDefId], references: [id])

  // Scoping
  eventId           String?
  event             Event?           @relation(fields: [eventId], references: [id])
  participantTypeId String?
  participantType   ParticipantType? @relation(fields: [participantTypeId], references: [id])

  // Definition
  name        String           // Storage key: "weapon_permit_number"
  label       String           // Display: "Weapon Permit Number"
  description String?          // Help text
  dataType    FieldDataType
  sortOrder   Int    @default(0)

  // Constraints
  isRequired   Boolean @default(false)
  isUnique     Boolean @default(false)
  isSearchable Boolean @default(false)
  isFilterable Boolean @default(false)
  defaultValue String?

  // Type-specific configuration
  config     Json @default("{}")
  // TEXT:    {"maxLength": 100, "pattern": "^WP-\\d+$"}
  // NUMBER:  {"min": 0, "max": 999, "decimalPlaces": 2}
  // ENUM:    {"options": [{"value":"low","label":"Low","color":"#22c55e"}]}
  // DATE:    {"minDate": "2026-01-01", "maxDate": "2026-12-31"}
  // FILE:    {"allowedTypes": ["image/jpeg","application/pdf"], "maxSizeMB": 5}
  // REFERENCE: {"targetObjectSlug": "vehicle", "displayField": "plate_number"}

  // UI rendering hints
  uiConfig   Json @default("{}")
  // {"widget": "textarea", "rows": 3, "section": "Travel",
  //  "placeholder": "Enter permit number", "width": "half"}

  // Validation rules (beyond basic type validation)
  validation Json @default("[]")
  // [{"rule": "regex", "value": "^[A-Z]{2}\\d{7}$", "message": "Invalid format"}]
  // [{"rule": "requiredIf", "field": "needsVisa", "value": true}]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, targetModel, customObjectDefId, eventId, participantTypeId, name])
  @@index([tenantId, targetModel, eventId])
  @@index([eventId, participantTypeId, sortOrder])
}

enum FieldDataType {
  TEXT
  LONG_TEXT
  NUMBER
  BOOLEAN
  DATE
  DATETIME
  ENUM
  MULTI_ENUM
  EMAIL
  URL
  PHONE
  FILE
  IMAGE
  REFERENCE
  FORMULA
  AUTO_NUMBER
  COUNTRY
  USER
}
```

### 4.3 Custom Object Definitions

For tenants that need entirely new entity types (Vehicle Registry, Accommodation Assignments, Equipment Tracking):

```prisma
model CustomObjectDef {
  id          String      @id @default(cuid())
  tenantId    String
  tenant      Tenant      @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name        String
  slug        String
  description String?
  icon        String?
  color       String?
  scope       ObjectScope @default(EVENT)

  permissions  Json @default("{}")
  listLayout   Json @default("{}")
  detailLayout Json @default("{}")
  formLayout   Json @default("{}")

  fields  CustomFieldDef[]
  records CustomObjectRecord[]

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  @@unique([tenantId, slug])
  @@index([tenantId])
}

enum ObjectScope {
  TENANT
  EVENT
}

model CustomObjectRecord {
  id            String          @id @default(cuid())
  tenantId      String
  tenant        Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  objectDefId   String
  objectDef     CustomObjectDef @relation(fields: [objectDefId], references: [id], onDelete: Cascade)
  eventId       String?
  event         Event?          @relation(fields: [eventId], references: [id])
  participantId String?
  participant   Participant?    @relation(fields: [participantId], references: [id])
  data          Json            @default("{}")
  sortOrder     Float?
  createdBy     String?
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt
  deletedAt     DateTime?

  @@index([tenantId, objectDefId, eventId])
  @@index([deletedAt])
}
```

### 4.4 Dynamic Zod Validation

The system generates Zod schemas at runtime from field definitions:

```typescript
// app/utils/custom-fields.server.ts

import { z } from 'zod'
import type { FieldDataType } from '@prisma/client'

interface FieldDef {
  name: string
  label: string
  dataType: FieldDataType
  isRequired: boolean
  config: Record<string, any>
  validation: Array<{ rule: string; value?: any; message: string }>
}

export function buildCustomDataSchema(fieldDefs: FieldDef[]) {
  const shape: Record<string, z.ZodTypeAny> = {}

  for (const field of fieldDefs) {
    let schema: z.ZodTypeAny

    switch (field.dataType) {
      case 'TEXT':
      case 'LONG_TEXT': {
        let s = z.string()
        if (field.config.maxLength) s = s.max(field.config.maxLength)
        if (field.config.pattern) s = s.regex(new RegExp(field.config.pattern))
        schema = s
        break
      }
      case 'NUMBER': {
        let n = z.number()
        if (field.config.min !== undefined) n = n.min(field.config.min)
        if (field.config.max !== undefined) n = n.max(field.config.max)
        schema = n
        break
      }
      case 'BOOLEAN':
        schema = z.boolean()
        break
      case 'DATE':
      case 'DATETIME':
        schema = z.string().datetime()
        break
      case 'ENUM': {
        const values = field.config.options?.map((o: any) => o.value) ?? []
        schema = z.enum(values as [string, ...string[]])
        break
      }
      case 'MULTI_ENUM': {
        const multiValues = field.config.options?.map((o: any) => o.value) ?? []
        schema = z.array(z.enum(multiValues as [string, ...string[]]))
        break
      }
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
      case 'REFERENCE':
        schema = z.string()
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
    }

    shape[field.name] = field.isRequired ? schema : schema.optional().nullable()
  }

  return z.object(shape)
}
```

### 4.5 Dynamic Form Renderer

Maps `dataType` values to existing Conform components:

```typescript
// app/components/dynamic-fields/DynamicFieldRenderer.tsx

export function DynamicFieldRenderer({ fieldDef, meta }: {
  fieldDef: FieldDef
  meta: FieldMetadata<string>
}) {
  switch (fieldDef.dataType) {
    case 'TEXT':
    case 'EMAIL':
    case 'URL':
    case 'PHONE':
      return <InputField meta={meta} type={mapInputType(fieldDef.dataType)}
                         placeholder={fieldDef.uiConfig.placeholder} />
    case 'LONG_TEXT':
      return <TextareaField meta={meta} rows={fieldDef.uiConfig.rows ?? 3} />
    case 'NUMBER':
      return <InputField meta={meta} type="number"
                         min={fieldDef.config.min} max={fieldDef.config.max} />
    case 'BOOLEAN':
      return <CheckboxField meta={meta} />
    case 'DATE':
    case 'DATETIME':
      return <DatePickerField meta={meta} />
    case 'ENUM':
      return <SelectField meta={meta}
                          items={fieldDef.config.options}
                          placeholder={`Select ${fieldDef.label}`} />
    case 'MULTI_ENUM':
      return <CheckboxGroupField meta={meta} options={fieldDef.config.options} />
    case 'FILE':
    case 'IMAGE':
      return <FileInputField meta={meta}
                             accept={fieldDef.config.allowedTypes?.join(',')} />
    default:
      return <InputField meta={meta} type="text" />
  }
}
```

**Component mapping:**

| `dataType` | Component | Renders |
|------------|-----------|---------|
| `TEXT` | `<InputField type="text">` | Text input |
| `NUMBER` | `<InputField type="number">` | Number input |
| `BOOLEAN` | `<CheckboxField>` | Checkbox |
| `DATE` | `<DatePickerField>` | Calendar picker |
| `ENUM` | `<SelectField>` | Dropdown |
| `MULTI_ENUM` | `<CheckboxGroupField>` | Checkbox group |
| `LONG_TEXT` | `<TextareaField>` | Textarea |
| `FILE` | `<FileInputField>` | File upload |
| `EMAIL` | `<InputField type="email">` | Email input |

### 4.6 Query Layer for Custom Fields

```typescript
// app/utils/custom-query.server.ts

export async function filterWithCustomFields({
  request, where, customFieldDefs,
}: {
  request: Request
  where: Prisma.ParticipantWhereInput
  customFieldDefs: FieldDef[]
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
    }
  }

  if (customFilters.length === 0) {
    return prisma.participant.findMany({ where })
  }

  // Combine Prisma where with raw JSONB conditions
  const customWhere = Prisma.sql`AND ${Prisma.join(customFilters, ' AND ')}`
  // Build hybrid query using prisma.$queryRaw
}
```

### 4.7 Dynamic Index Management

When a field is marked `isSearchable`, auto-create expression indexes:

```typescript
export async function ensureCustomFieldIndex(field: FieldDef) {
  if (!field.isSearchable) return

  const indexName = `idx_participant_cf_${field.name}`
  const cast = getCastForType(field.dataType)

  await prisma.$executeRawUnsafe(`
    CREATE INDEX CONCURRENTLY IF NOT EXISTS "${indexName}"
    ON "Participant" ((("customData"->>'${field.name}')${cast}))
    WHERE "deletedAt" IS NULL
  `)
}
```

### 4.8 What Stays Fixed vs What Becomes Dynamic

| Fixed Prisma Columns | Dynamic JSONB + Metadata |
|-----------------------|--------------------------|
| `id`, `tenantId`, `eventId` | All domain-specific participant fields |
| `firstName`, `familyName`, `email` | Event metadata beyond name/dates/status |
| `gender`, `titleId`, `dateOfBirth` | Type-specific fields (weapon, press card, vehicle) |
| `participantTypeId`, `status`, `stepId` | Conditional fields (visa, car pass, sessions) |
| `registrationCode`, `organization`, `jobTitle` | Entirely new entity types (custom objects) |
| `createdAt`, `updatedAt`, `deletedAt` | Per-event form configurations |
| Workflow system (Step, Approval) | Layout/section groupings |
| RBAC (Role, Permission, UserEventAccess) | Validation rules beyond basic type checks |

### 4.9 Multi-Tenant Field Definitions in Practice

**Tenant A (Diplomatic Summit)** configures: passport fields, visa requirements, vehicle plates, closed session attendance, weapon permits for security, press cards for media.

**Tenant B (Tech Conference)** configures: t-shirt size, workshop selections, dietary requirements, GitHub username.

**Tenant C (Music Festival)** configures: wristband color, camping zone, emergency contact, medical conditions.

All three use the **same deployed application**. Each tenant only sees fields relevant to their events.

---

## 5. Visual Form Designer

### 5.1 Purpose

The visual form designer is a drag-and-drop admin interface where non-technical users design registration forms. It answers: "I've defined 15 custom fields for this event — now how should the form look?"

- **Field definitions** (Section 4) = "what data to collect" (the ingredients)
- **Form designer** (this section) = "how the form looks and flows" (the recipe)

Field definitions can be used **without** the form designer — fields render in a flat list sorted by `sortOrder`. The form designer is an upgrade that gives admins control over multi-page wizard layout, sections, conditional visibility, and column arrangement.

### 5.2 Three-Panel Interface

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
│  ─ Phone     │  │  │ Family Name│ Gender (*)  ││  │  Width: [half]│
│  ─ Date      │  │  └────────────┴─────────────┘│  │  Required: Y │
│  ─ Dropdown  │  │                                │  │  Placeholder:│
│  ─ Radio     │  │  ┌────────────────────────────┐│  │    _________ │
│  ─ Checkbox  │  │  │ Passport Number            ││  │  Validation: │
│  ─ Toggle    │  │  │ Passport Expiry            ││  │    Min: ___  │
│  ─ File      │  │  └────────────────────────────┘│  │    Max: ___  │
│  ─ Image     │  │                                │  │              │
│  ─ Heading   │  │  [+ Add Section]               │  │  Show if:    │
│  ─ Divider   │  │                                │  │  [field v]   │
│              │  │  Page 2: Travel Info  >         │  │  [equals v]  │
│              │  │                                │  │  [value  ___] │
│              │  └──────────────────────────────┘  │              │
│              │                                    │              │
│              │   [Editor]  [Split]  [Preview]     │              │
└──────────────┴──────────────────────────────────┴──────────────┘
```

**Left panel (Field Palette):** Draggable field types organized by category.

**Center panel (Design Canvas):** Form layout with pages, sections, and fields in a 12-column grid. Fields are draggable within and between sections.

**Right panel (Properties):** Edit selected field's label, width, validation, conditional visibility rules.

### 5.3 Form Layout Data Model

```prisma
model FormTemplate {
  id                String           @id @default(cuid())
  tenantId          String
  tenant            Tenant           @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId           String?
  event             Event?           @relation(fields: [eventId], references: [id])
  name              String
  description       String?
  version           Int              @default(1)
  definition        Json             // The full form layout JSON
  participantTypeId String?
  participantType   ParticipantType? @relation(fields: [participantTypeId], references: [id])
  isActive          Boolean          @default(true)
  publishedAt       DateTime?
  createdAt         DateTime         @default(now())
  updatedAt         DateTime         @updatedAt

  @@unique([tenantId, eventId, participantTypeId, name])
  @@index([tenantId, eventId])
}

model SectionTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  name        String
  definition  Json     // Section JSON with fields
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, name])
}
```

The `definition` JSON hierarchy:

```
FormDefinition
  ├── settings (displayMode, progressBar, submitButtonText)
  └── pages[]
       ├── title, description, order
       ├── visibleIf (conditional)
       └── sections[]
            ├── title, columns (1-4), collapsible, order
            ├── visibleIf (conditional)
            └── fields[]
                 ├── key (maps to customData key)
                 ├── type (text, select, date, file, etc.)
                 ├── label, placeholder, description
                 ├── layout: { colSpan, row, order }
                 ├── validation: { required, min, max, pattern }
                 ├── visibleIf (conditional)
                 └── properties (type-specific config)
```

### 5.4 Concrete Example: AU Summit Registration

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
          "columns": 3,
          "order": 1,
          "fields": [
            {
              "id": "f1", "key": "titleId", "type": "select",
              "label": "Title",
              "layout": { "colSpan": 3, "order": 1 },
              "validation": { "required": true },
              "properties": { "optionsSource": "titles" }
            },
            {
              "id": "f2", "key": "firstName", "type": "text",
              "label": "First Name",
              "layout": { "colSpan": 4, "order": 2 },
              "validation": { "required": true, "minLength": 2 }
            },
            {
              "id": "f3", "key": "familyName", "type": "text",
              "label": "Family Name",
              "layout": { "colSpan": 5, "order": 3 },
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
              "id": "f6", "key": "passport_number", "type": "text",
              "label": "Passport Number",
              "layout": { "colSpan": 6, "order": 1 },
              "validation": { "required": true, "pattern": "^[A-Z0-9]{5,15}$" }
            },
            {
              "id": "f7", "key": "passport_expiry", "type": "date",
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
          "title": "Visa & Flight",
          "columns": 2,
          "order": 1,
          "fields": [
            {
              "id": "f8", "key": "needs_visa", "type": "switch",
              "label": "Do you need visa assistance?",
              "layout": { "colSpan": 6, "order": 1 }
            },
            {
              "id": "f9", "key": "flight_number", "type": "text",
              "label": "Flight Number",
              "layout": { "colSpan": 6, "order": 2 },
              "visibleIf": {
                "type": "simple",
                "field": "needs_visa",
                "operator": "eq",
                "value": true
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
        "type": "simple",
        "field": "participantType",
        "operator": "in",
        "value": ["Armed Security", "Special Armed Security"]
      },
      "sections": [
        {
          "id": "sec_weapon",
          "title": "Weapon Registration",
          "columns": 2,
          "order": 1,
          "fields": [
            {
              "id": "f11", "key": "weapon_type", "type": "select",
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
              "id": "f12", "key": "weapon_serial", "type": "text",
              "label": "Weapon Serial Number",
              "layout": { "colSpan": 6, "order": 2 },
              "validation": { "required": true, "maxLength": 20 }
            },
            {
              "id": "f13", "key": "weapon_permit", "type": "file",
              "label": "Weapon Permit",
              "layout": { "colSpan": 12, "order": 3 },
              "validation": { "required": true },
              "properties": { "accept": ".pdf,.jpg,.jpeg,.png", "maxFileSize": 5242880 }
            }
          ]
        }
      ]
    }
  ]
}
```

### 5.5 12-Column Grid System

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
│  Title   │  First Name  │  Family Name                 │
└──────────┴──────────────┴──────────────────────────────┘
```

Admin controls width via Properties panel:

```
Width:  [Quarter 1/4]  [Third 1/3]  [Half 1/2]  [Full --]
```

### 5.6 Conditional Visibility

Rules can be applied at the **page**, **section**, or **field** level:

**Simple condition:**
```json
{ "type": "simple", "field": "needs_visa", "operator": "eq", "value": true }
```

**Compound condition:**
```json
{
  "type": "compound",
  "operator": "or",
  "conditions": [
    { "type": "simple", "field": "participantType", "operator": "eq", "value": "Armed Security" },
    { "type": "simple", "field": "participantType", "operator": "eq", "value": "Special Armed Security" }
  ]
}
```

**Operators:** `eq`, `neq`, `empty`, `notEmpty`, `gt`, `lt`, `gte`, `lte`, `contains`, `in`, `notIn`

**Evaluation engine:**

```typescript
function evaluateCondition(condition, formData) {
  if (!condition) return true

  if (condition.type === 'simple') {
    const value = formData[condition.field]
    switch (condition.operator) {
      case 'eq':       return value === condition.value
      case 'neq':      return value !== condition.value
      case 'empty':    return !value
      case 'notEmpty': return !!value
      case 'gt':       return Number(value) > Number(condition.value)
      case 'contains': return String(value).includes(condition.value)
      case 'in':       return condition.value.includes(value)
    }
  }

  if (condition.type === 'compound') {
    const results = condition.conditions.map(c => evaluateCondition(c, formData))
    return condition.operator === 'and'
      ? results.every(Boolean)
      : results.some(Boolean)
  }
}
```

### 5.7 Section Management

Sections are titled cards containing fields in a grid layout.

**Adding:** [+ Add Section] dialog with title, description, column count (1-4), collapsible toggle.

**Reordering:** Drag sections via handle using `@dnd-kit` SortableContext at section level.

**Nesting:** Nested SortableContexts — sections reorder among themselves, fields reorder within sections or drag between sections.

```tsx
<SortableContext items={sectionIds} strategy={verticalListSortingStrategy}>
  {page.sections.map(section => (
    <SortableSection key={section.id} section={section}>
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

**Section Templates:** Save common groupings (Personal Info, Passport & Identity, Travel & Logistics) as reusable templates. When adding a section, choose "From Template" to start from a saved layout.

### 5.8 Page Management (Wizard Steps)

Each page becomes one step in the registration wizard. Tab bar at the top of the canvas shows all pages.

**Page-level visibility** enables participant-type-specific pages:

- Minister sees: Personal Info → Organization → Travel → Documents (4 pages)
- Armed Security sees: Personal Info → Organization → Travel → **Security Details** → Documents (5 pages)
- Press sees: Personal Info → Organization → Travel → **Press Credentials** → Documents (5 pages)

All from the **same form template**, with the wizard automatically adjusting.

### 5.9 View Modes

**Editor Mode:** Full design interface with drag handles, grid lines, property panel.

**Split Mode:** Side-by-side editor and live preview.

**Preview Mode:** Full-width preview showing exactly what the participant sees. Uses the **same renderer component** as the actual registration form — WYSIWYG guaranteed.

### 5.10 Technology Choices

| Concern | Choice | Rationale |
|---------|--------|-----------|
| **Drag-and-drop** | `@dnd-kit` | Accessible, supports sortable lists + nested droppable containers |
| **Form rendering** | Existing Conform + Radix UI | Reuses InputField, SelectField, CheckboxField, DatePickerField |
| **Validation** | Dynamic Zod (Section 4.4) | Schema built at runtime from field definitions |
| **Layout** | Tailwind `grid-cols-12` + `col-span-*` | Maps directly to `colSpan` in JSON |
| **State** | `useState` + `useCallback` | Same pattern as existing badge designer |

### 5.11 File Structure

```
app/components/form-designer/
  form-designer.tsx            # Three-panel layout + view mode toggle
  field-palette.tsx            # Left: draggable field types by category
  design-canvas.tsx            # Center: DndContext with pages/sections/fields
  section-drop-zone.tsx        # Droppable section with sortable fields
  sortable-field.tsx           # Individual field card on canvas
  field-properties-panel.tsx   # Right: tabs (General | Validation | Visibility)
  condition-builder.tsx        # Visibility rule editor
  form-renderer.tsx            # Live preview + actual registration form
  field-renderer.tsx           # Renders one field → existing Conform component
  types.ts                     # TypeScript interfaces
  index.ts                     # Barrel export

app/utils/
  form-schema-builder.server.ts   # Build Zod from FormDefinition JSON
  condition-evaluator.ts          # Evaluate visibleIf/requiredIf
  form-definition.server.ts       # CRUD for FormTemplate records
```

---

## 6. Workflow Engine

### 6.1 Core Execution

The workflow engine implements a **linked-list state machine** with conditional routing:

```
Step A (APPROVE) → nextStepId → Step B (APPROVE) → nextStepId → Step C (PRINT) → ...
                ↓ REJECT
        Step with isRejectionTarget: true
                ↓ BYPASS
        Step with isBypassTarget: true
```

**`processParticipant(participantId, userId, action, remarks)`** is the core function:

1. Look up participant's current step
2. Execute action (APPROVE, REJECT, BYPASS, PRINT, COLLECT, NOTIFY, ARCHIVE)
3. Evaluate conditional routing rules if any
4. Update participant's status and stepId
5. Create Approval audit record
6. Trigger side effects (email, notification, webhook)

### 6.2 Workflow Versioning

When a participant enters a workflow, a snapshot of the workflow is captured:

```typescript
async function enterWorkflow(participantId: string, workflowId: string) {
  const workflow = await prisma.workflow.findUnique({
    where: { id: workflowId },
    include: { steps: true },
  })

  // Get or create version snapshot
  const latestVersion = await prisma.workflowVersion.findFirst({
    where: { workflowId },
    orderBy: { version: 'desc' },
  })

  let version = latestVersion
  if (!version || hasWorkflowChanged(workflow, version.snapshot)) {
    version = await prisma.workflowVersion.create({
      data: {
        workflowId,
        version: (latestVersion?.version ?? 0) + 1,
        snapshot: serializeWorkflow(workflow),
      },
    })
  }

  await prisma.participant.update({
    where: { id: participantId },
    data: { workflowVersionId: version.id },
  })
}
```

In-flight participants complete under their entry version. Editing a live workflow doesn't affect participants already in the pipeline.

### 6.3 Conditional Routing

Steps can define conditions for dynamic routing based on participant attributes:

```json
// Step.conditions JSON
[
  {
    "field": "participantType.name",
    "operator": "eq",
    "value": "VIP",
    "nextStepId": "step_vip_fast_track"
  },
  {
    "field": "customData.needs_visa",
    "operator": "eq",
    "value": true,
    "nextStepId": "step_visa_review"
  }
]
```

If no condition matches, the default `nextStepId` is used.

### 6.4 SLA Enforcement

Background job checks for overdue steps and triggers configurable actions:

```typescript
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
```

Actions on SLA breach: email alert, auto-escalate to supervisor, auto-approve, create notification.

### 6.5 Step Assignment & Reassignment

```typescript
// Assign a participant to a specific user within the step's role
async function assignParticipant(participantId, stepId, assignedTo, assignedBy) {
  await prisma.stepAssignment.create({
    data: { participantId, stepId, assignedTo, assignedBy },
  })
  // Notify assigned user
  await createNotification(assignedTo, 'ASSIGNMENT', `New assignment: ${participantId}`)
}
```

### 6.6 Auto-Action Rules

Steps can define rules for automatic execution:

```json
// Step.autoAction JSON
{
  "rule": "autoApprove",
  "conditions": [
    { "field": "organization", "operator": "in", "value": ["AU Commission", "UN Secretariat"] }
  ],
  "delay": 0
}
```

### 6.7 Batch Operations

First-class batch approve/reject/bypass:

```typescript
async function batchProcessParticipants(
  participantIds: string[],
  userId: string,
  action: Action,
  remarks: string
) {
  const results = await Promise.allSettled(
    participantIds.map(id => processParticipant(id, userId, action, remarks))
  )
  // Single audit entry for batch + individual approval records
  await createAuditLog({
    action: 'BATCH_' + action,
    metadata: {
      count: participantIds.length,
      succeeded: results.filter(r => r.status === 'fulfilled').length,
      failed: results.filter(r => r.status === 'rejected').length,
    },
  })
}
```

### 6.8 Visual Workflow Builder

Uses `@xyflow/react` (React Flow) with `dagre` auto-layout:

- Drag steps from palette onto canvas
- Connect steps to define flow
- Configure step properties (action, role, SLA, conditions)
- Positions saved as `positionX`/`positionY`
- Templates reusable across events

---

## 7. Security Architecture

### 7.1 Authentication

| Mechanism | Implementation |
|-----------|---------------|
| **Session-based auth** | Cookie sessions with configurable expiration |
| **Password storage** | bcrypt with configurable salt rounds |
| **Progressive lockout** | Configurable thresholds, auto-unlock after cooldown |
| **2FA** | TOTP-based, optional per user |
| **Session fingerprinting** | Browser metadata binding (User-Agent, sec-ch-ua) |
| **Session regeneration** | New session ID after 2FA verification and privilege escalation |

### 7.2 Authorization

```
Platform Admin (GLOBAL scope) → all tenants
Tenant Admin (TENANT scope) → own tenant's data
Event Roles (EVENT scope) → per-event via UserEventAccess
  ├── validator → review/approve at assigned steps
  ├── printer → print queue
  ├── dispatcher → badge collection
  ├── focal → delegation management
  └── reviewer → read-only oversight
```

### 7.3 Request Security

| Layer | Mechanism |
|-------|-----------|
| **CSP** | Nonce-based Content Security Policy (no `unsafe-inline`) |
| **HSTS** | Strict-Transport-Security with includeSubDomains |
| **Rate Limiting** | 3-tier: 100/min general, 50/min mutations, 10/min auth endpoints |
| **Rate Limiting (Auth)** | Separate limits for all authenticated routes |
| **CSRF** | Cookie-based tokens via react-router-utils |
| **Bot Protection** | Honeypot fields on forms |
| **Request Validation** | Reject missing User-Agent/Accept headers |
| **File Scanning** | ClamAV or Azure Defender for document uploads |
| **Input Sanitization** | xss + dompurify for user-generated content |

### 7.4 Data Protection

| Concern | Approach |
|---------|----------|
| **Secrets management** | Environment variables via `.env` (excluded from VCS), `.env.example` with placeholders |
| **Backup encryption** | AES-256 for SQL dump files before Azure upload |
| **Admin impersonation** | Short-lived JWT (60s) bound to requesting IP |
| **Audit trail** | Every state change logged with user, timestamp, IP, user agent, metadata |
| **Tenant isolation** | `tenantId` FK on every data record, composite unique constraints |

---

## 8. Infrastructure & DevOps

### 8.1 Containerization

```dockerfile
# Multi-stage Docker build
FROM node:20-alpine AS base

FROM base AS deps
WORKDIR /app
COPY package*.json ./
RUN npm ci --omit=dev

FROM base AS build
WORKDIR /app
COPY package*.json ./
RUN npm ci
COPY . .
RUN npm run build

FROM base AS production
WORKDIR /app
COPY --from=deps /app/node_modules ./node_modules
COPY --from=build /app/build ./build
COPY --from=build /app/server.js ./
COPY --from=build /app/package.json ./
EXPOSE 8080
CMD ["node", "server.js"]
```

```yaml
# docker-compose.yml
services:
  app:
    build: .
    ports: ["8080:8080"]
    depends_on: [db, storage]
    env_file: .env
  db:
    image: postgres:16
    volumes: [pgdata:/var/lib/postgresql/data]
    environment:
      POSTGRES_DB: accreditation
      POSTGRES_USER: postgres
      POSTGRES_PASSWORD: postgres
  storage:
    image: mcr.microsoft.com/azure-storage/azurite
    ports: ["10000:10000"]
```

### 8.2 CI/CD Pipeline

```yaml
# GitHub Actions
on: [push, pull_request]
jobs:
  quality:
    steps:
      - typecheck (tsc --noEmit)
      - lint (eslint with cache)
      - format check (prettier --check)

  test:
    steps:
      - unit tests (Vitest)
      - integration tests (Vitest + test database)
      - e2e tests (Playwright)

  build:
    steps:
      - docker build
      - image scanning (Trivy)

  deploy-staging:
    if: github.ref == 'refs/heads/develop'
    steps:
      - deploy to staging

  deploy-production:
    if: github.ref == 'refs/heads/main'
    needs: [quality, test, build]
    steps:
      - manual approval gate
      - deploy to production
```

### 8.3 Testing Strategy

```
Priority 1 - Unit Tests (Vitest)
├── Workflow engine (processParticipant with all action types)
├── Dynamic schema builder (buildCustomDataSchema)
├── Condition evaluator (evaluateCondition)
├── Authentication functions (login, lockout)
├── Permission checking (requireUserWithPermission)
├── Quota calculation logic
└── Form schema builder (FormDefinition → Zod)

Priority 2 - Integration Tests (Vitest + test DB)
├── Route loaders and actions
├── Database operations (Prisma with test database)
├── Custom field CRUD + JSONB queries
├── Email sending (MSW mocks)
└── File upload/download (Azure mock)

Priority 3 - E2E Tests (Playwright)
├── Login → approval workflow → badge print → collection
├── Event creation → workflow setup → participant registration
├── Form designer → save → render → submit
├── Admin operations (user management, settings)
└── Role-based access verification
```

### 8.4 Observability

| Tool | Purpose |
|------|---------|
| **Sentry** | Error tracking and performance monitoring |
| **Pino** | Structured JSON logging (replace console.log/Morgan) |
| **Azure Application Insights** | APM, request tracing, dependency tracking |
| **Health Check** | `/up` endpoint for load balancer probes |

### 8.5 Pre-Commit Hooks

```json
// Husky + lint-staged
{
  "*.{ts,tsx}": ["eslint --fix", "prettier --write"],
  "*.prisma": ["prisma format"]
}
```

---

## 9. API Layer

### 9.1 REST API

RESTful API for external integrations, authenticated via API key:

```
GET    /api/v1/events                              List events
GET    /api/v1/events/:eventId                     Get event
GET    /api/v1/events/:eventId/participants         List participants
GET    /api/v1/events/:eventId/participants/:id     Get participant
POST   /api/v1/events/:eventId/participants/:id/approve  Approve
POST   /api/v1/events/:eventId/participants/:id/reject   Reject
GET    /api/v1/events/:eventId/stats               Event statistics

POST   /api/v1/webhooks                            Subscribe to events
DELETE /api/v1/webhooks/:id                         Unsubscribe
```

### 9.2 Authentication

```
X-API-Key: <tenant-scoped API key>
```

API keys are tenant-scoped and have configurable permissions. Separate rate limiting tier for API consumers.

### 9.3 Response Format

```json
{
  "data": [...],
  "pagination": {
    "page": 1,
    "pageSize": 20,
    "total": 150,
    "totalPages": 8
  }
}
```

### 9.4 Webhook Events

```
participant.registered
participant.approved
participant.rejected
participant.printed
participant.collected
workflow.step.completed
workflow.sla.breached
```

---

## 10. Real-Time System

### 10.1 Server-Sent Events (SSE)

Live queue updates for validators, printers, and dispatchers:

```typescript
// app/routes/validator+/requests+/stream.tsx
export async function loader({ request }: LoaderFunctionArgs) {
  const user = await requireUserWithRoles(request, ['validator', 'reviewer'])
  const accessibleStepIds = await getUserAccessibleStepIds(user.id)

  return eventStream(request.signal, (send) => {
    const interval = setInterval(async () => {
      const counts = await getQueueCounts(accessibleStepIds)
      send({ event: 'queue-update', data: JSON.stringify(counts) })
    }, 5000)
    return () => clearInterval(interval)
  })
}
```

### 10.2 Optimistic Locking

Prevent concurrent actions on the same participant:

```typescript
// Check version before processing
const participant = await prisma.participant.findUnique({ where: { id } })
if (participant.updatedAt.getTime() !== expectedVersion) {
  throw new ConflictError('Participant was modified by another user')
}
```

Display "Being reviewed by [User]" indicators in validator queue.

### 10.3 In-App Notifications

```typescript
// On workflow action, create notifications
await prisma.notification.create({
  data: {
    tenantId,
    userId: participant.userId,
    type: 'APPROVAL',
    title: 'Registration Approved',
    body: `Your registration for ${event.name} has been approved.`,
    metadata: { participantId, eventId },
  },
})
```

Notification bell with unread count, real-time push via SSE.

---

## 11. UI/UX Design

### 11.1 Mobile-First Operations

**Progressive Web App (PWA)** with responsive views for:

- **Validator:** Card-based review queue, swipe to approve/reject
- **Printer:** Print queue with batch selection
- **Dispatcher:** QR scanner for badge collection
- **Focal Point:** Delegation overview with quota usage

Service Worker for offline badge collection and printing.

### 11.2 Keyboard Shortcuts

Power user shortcuts for high-volume validator workflows:

| Shortcut | Action |
|----------|--------|
| `A` | Approve selected participant |
| `R` | Reject (opens remarks dialog) |
| `B` | Bypass |
| `N` | Next participant |
| `P` | Previous participant |
| `/` | Focus search |
| `?` | Show shortcut help |

### 11.3 Global Search

Cross-event participant search bar in the header:

- Search by name, registration code, passport number, organization
- Results grouped by event
- Quick actions from search results (view, navigate to step)
- Custom field search for fields marked `isSearchable`

### 11.4 Loading States

Skeleton screens for data-heavy pages. StatusButton with loading/success/error states for form submissions.

### 11.5 Internationalization

```
// react-i18next with 4 languages for AU context
public/locales/
  en/common.json
  fr/common.json
  ar/common.json
  pt/common.json
```

Internationalize: UI labels, email templates, badge text, error messages, workflow step names, report labels.

### 11.6 Saved Views

Airtable-style saved views for different roles:

```prisma
model SavedView {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String?
  name        String
  type        ViewType @default(TABLE)
  targetModel String
  config      Json
  isDefault   Boolean  @default(false)
  isPublic    Boolean  @default(false)
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

- **Validators:** Table view filtered to their step with relevant fields
- **Printers:** Kanban board grouped by print status
- **Admins:** Comprehensive table with all custom fields
- **Focal Points:** Calendar view of delegation arrival dates

---

## 12. Feature Specifications

### 12.1 Check-In & Access Control

Every accreditation system ultimately converges on a single moment: a participant stands at a gate, presents a badge, and the system must decide — in under a second — whether to grant or deny entry. This decision depends on the participant's approval status, access level, the meeting's access restrictions, and real-time capacity. A robust check-in and access control system is the operational backbone that turns accreditation data into physical security enforcement.

#### 12.1.1 Data Model

```prisma
enum ScanType {
  ENTRY
  EXIT
}

enum ScanResult {
  ALLOWED
  DENIED_QUOTA
  DENIED_ACCESS_LEVEL
  DENIED_INVALID_BADGE
  DENIED_REVOKED
  DENIED_CAPACITY_FULL
  DENIED_BLACKLISTED
  MANUAL_OVERRIDE
}

model Checkpoint {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  name        String   // "Main Gate A", "Plenary Hall Entrance", "VIP Lounge"
  location    String?  // Floor/building reference
  zoneId      String?  // Links to EventZone if multi-zone
  type        String   // GATE, DOOR, SCANNER_STATION
  direction   String   // ENTRY_ONLY, EXIT_ONLY, BIDIRECTIONAL
  isActive    Boolean  @default(true)
  capacity    Int?     // Max throughput per hour (for load balancing)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  accessLogs  AccessLog[]

  @@unique([tenantId, eventId, name])
  @@index([eventId, isActive])
}

model AccessLog {
  id              String     @id @default(cuid())
  checkpointId    String
  checkpoint      Checkpoint @relation(fields: [checkpointId], references: [id], onDelete: Cascade)
  participantId   String?    // null if badge scan failed to resolve
  meetingId       String?    // If scanning for a specific meeting/session
  scanType        ScanType
  scanResult      ScanResult
  qrPayload       String     // Raw QR data scanned
  scannedBy       String     // userId of security staff
  deviceId        String?    // Scanner device identifier
  overrideReason  String?    // If MANUAL_OVERRIDE, reason recorded
  scannedAt       DateTime   @default(now())

  @@index([checkpointId, scannedAt])
  @@index([participantId, scannedAt])
  @@index([meetingId, scannedAt])
  @@index([scanResult, scannedAt])
}

model VenueOccupancy {
  id          String   @id @default(cuid())
  eventId     String
  meetingId   String?  // null = overall venue
  zoneId      String?
  currentCount Int     @default(0)
  maxCapacity  Int
  lastUpdated  DateTime @default(now())

  @@unique([eventId, meetingId, zoneId])
}
```

#### 12.1.2 QR Badge Scanning Flow

```
Security staff opens scanner app on tablet/phone
  → Camera activates, points at participant's badge QR code
  → QR decoded → encrypted payload extracted
  → Payload decrypted: { participantId, eventId, accessLevel, registrationCode }
  → System lookup:
      1. Participant exists? → No → DENIED_INVALID_BADGE
      2. Participant status = APPROVED and badge printed? → No → DENIED_REVOKED
      3. Blacklist check → Match → DENIED_BLACKLISTED
      4. Meeting access level check:
         - Meeting requires CLOSED, participant has OPEN → DENIED_ACCESS_LEVEL
         - Meeting requires CLOSED, participant has CLOSED → ✓ PASS
      5. Capacity check:
         - VenueOccupancy.currentCount >= maxCapacity → DENIED_CAPACITY_FULL
         - Under capacity → ✓ PASS
      6. All checks pass → ALLOWED
         - Increment VenueOccupancy.currentCount
         - Create AccessLog record
         - Display green checkmark with participant name + photo
  → Total time: < 500ms
```

#### 12.1.3 Scanner Interface

```
┌─────────────────────────────────────────────────────────┐
│  ◉ Scanner Active          Checkpoint: Main Gate A      │
│  ────────────────────────────────────────────────────── │
│                                                         │
│              ┌─────────────────────┐                    │
│              │                     │                    │
│              │    📷 Camera Feed   │                    │
│              │                     │                    │
│              │   [ QR viewfinder ] │                    │
│              │                     │                    │
│              └─────────────────────┘                    │
│                                                         │
│  Last scan:                                             │
│  ┌─────────────────────────────────────────────────┐   │
│  │  ✅ ALLOWED                                      │   │
│  │  ┌──────┐                                        │   │
│  │  │ Photo│  H.E. John Doe                        │   │
│  │  │      │  Republic of Kenya | Minister          │   │
│  │  └──────┘  Access: CLOSED  |  Badge: REG-0042   │   │
│  │            Scanned at 09:15:32                    │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Today: 342 entries | 28 exits | 314 inside            │
│                                                         │
│  [Manual Entry]  [Override]  [Report Incident]         │
└─────────────────────────────────────────────────────────┘
```

When a scan is **denied**, the screen flashes red with the denial reason in large text. The security staff can tap **[Override]** to manually allow entry, which requires typing a reason (stored in `overrideReason`).

#### 12.1.4 Real-Time Occupancy Dashboard

```
┌─────────────────────────────────────────────────────────────┐
│  Venue Occupancy — Live                    Auto-refresh: 5s │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Overall Venue        ████████████░░░░  1,247 / 2,000 (62%) │
│                                                              │
│  Plenary Hall         ████████████████  598 / 600   (99%) ⚠ │
│  Conference Room A    ████████░░░░░░░░  89 / 150    (59%)   │
│  Conference Room B    ████████████░░░░  112 / 150   (75%)   │
│  Press Center         ████░░░░░░░░░░░░  32 / 100    (32%)   │
│  VIP Lounge           ██████░░░░░░░░░░  24 / 50     (48%)   │
│  Exhibition Hall      ██████████░░░░░░  392 / 600   (65%)   │
│                                                              │
│  ⚠ Plenary Hall at 99% — consider redirecting overflow      │
│                                                              │
│  Gate Throughput (last hour):                                │
│  Main Gate A:  142 entries/hr  ▓▓▓▓▓▓▓▓▓▓                   │
│  Main Gate B:  98 entries/hr   ▓▓▓▓▓▓▓                       │
│  VIP Gate:     23 entries/hr   ▓▓                             │
│  Service Gate: 15 entries/hr   ▓                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

Capacity thresholds trigger automatic alerts:
- **75%**: Yellow indicator — staff notified
- **90%**: Orange indicator — consider stopping new entries
- **100%**: Red indicator — gate scanners auto-deny with `DENIED_CAPACITY_FULL`

#### 12.1.5 Offline Scanner Capability

Network connectivity at large venues can be unreliable. The scanner app caches:
- Full participant lookup table (id, name, photo thumbnail, access level, status) — synced every 5 minutes
- Blacklist entries
- Meeting access requirements

When offline, scans are validated locally and logged to device storage. When connectivity resumes, logs are batch-uploaded and occupancy counts are reconciled.

#### 12.1.6 Integration Points

| System | Integration |
|--------|------------|
| Badge Printing | QR payload is generated during badge print; same payload used for scanning |
| Participant Status | Only APPROVED participants with printed badges pass validation |
| Meeting Model | Meeting access level compared against participant access level |
| Blacklist | Real-time screening on every scan |
| Incident Management | "Report Incident" button on scanner creates Incident record |
| Command Center | Occupancy data and gate throughput stream via SSE |
| Catering | Access logs used to estimate meal counts at serving points |
| Personal Agenda | Check-in data marks PersonalAgenda attendance as ATTENDED |

---

### 12.2 Delegation Management Portal

In diplomatic events, participants don't register themselves individually. A **focal point** — typically an embassy official or organizational coordinator — manages the entire delegation. They need a dedicated portal to view quotas, register participants within their allocation, upload documents, and track progress. Without this, focal points must email the accreditation office for every action, creating an unscalable bottleneck.

#### 12.2.1 Data Model

```prisma
model Delegation {
  id              String   @id @default(cuid())
  tenantId        String
  eventId         String
  name            String   // "Republic of Kenya", "African Development Bank"
  code            String   // "KEN", "AFDB"
  headOfDelegation String? // participantId of the leader
  focalPointId    String   // userId of the focal point
  secondaryFocalId String? // backup focal point
  status          String   // ACTIVE, SUSPENDED, COMPLETED
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  quotaAllocations DelegationQuota[]

  @@unique([tenantId, eventId, code])
  @@index([focalPointId])
}

model DelegationQuota {
  id                String   @id @default(cuid())
  delegationId      String
  delegation        Delegation @relation(fields: [delegationId], references: [id], onDelete: Cascade)
  participantTypeId String
  allocatedQuota    Int
  usedQuota         Int      @default(0)
  pendingQuota      Int      @default(0) // Submitted but not yet approved
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@unique([delegationId, participantTypeId])
}

model QuotaChangeRequest {
  id              String   @id @default(cuid())
  delegationId    String
  participantTypeId String
  currentQuota    Int
  requestedQuota  Int
  reason          String
  status          String   // PENDING, APPROVED, DENIED
  requestedBy     String   // userId
  reviewedBy      String?
  reviewedAt      DateTime?
  reviewNotes     String?
  createdAt       DateTime @default(now())

  @@index([delegationId, status])
}

model ParticipantReplacement {
  id                  String   @id @default(cuid())
  delegationId        String
  originalParticipantId String
  replacementParticipantId String?
  reason              String
  status              String   // PENDING, APPROVED, DENIED, COMPLETED
  requestedBy         String
  approvedBy          String?
  createdAt           DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@index([delegationId, status])
}
```

#### 12.2.2 Delegation Portal Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  🏛 Republic of Kenya — Delegation Portal                   │
│  38th AU Summit  |  Focal Point: Jane Wanjiku               │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Quota Overview                                              │
│  ┌─────────────────────┬───────┬──────┬─────────┬─────────┐ │
│  │ Participant Type     │ Quota │ Used │ Pending │ Remain  │ │
│  ├─────────────────────┼───────┼──────┼─────────┼─────────┤ │
│  │ Head of State        │   1   │  1   │    0    │   0     │ │
│  │ Minister             │   5   │  3   │    1    │   1     │ │
│  │ Delegate             │  15   │  12  │    2    │   1     │ │
│  │ Support Staff        │  10   │   6  │    0    │   4     │ │
│  │ Security             │   8   │   8  │    0    │   0  ⚠  │ │
│  └─────────────────────┴───────┴──────┴─────────┴─────────┘ │
│                                                              │
│  [+ Register Participant]  [Request Quota Increase]          │
│                                                              │
│  Participants (22 of 39 quota)                  [Filter ▾]  │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ ✅ H.E. William Ruto    │ Head of State │ Approved   │   │
│  │ ✅ Amb. Raychelle Omamo │ Minister      │ Approved   │   │
│  │ ⏳ Dr. Monica Juma      │ Minister      │ In Review  │   │
│  │ 📎 John Kamau           │ Delegate      │ Missing: passport │
│  │ ⏳ Mary Njeri           │ Delegate      │ Pending    │   │
│  │ ...                                                  │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Quick Actions:                                              │
│  [Upload Documents]  [Replace Participant]  [Export List]    │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 12.2.3 Registration Within Quota Flow

```
Focal point clicks [+ Register Participant]
  → System checks: DelegationQuota.usedQuota + pendingQuota < allocatedQuota?
    → No → "Quota full for this participant type. Request increase or choose another type."
    → Yes → Registration form opens (dynamic form from FormTemplate)
  → Focal point fills in participant details, uploads documents
  → Submit → Participant record created with delegation link
  → DelegationQuota.pendingQuota incremented
  → Participant enters workflow (Step 1)
  → When participant reaches APPROVED status → pendingQuota decremented, usedQuota incremented
  → When participant is REJECTED → pendingQuota decremented
```

#### 12.2.4 Participant Replacement Flow

```
Focal point selects approved participant → [Replace]
  → Reason required: "Participant unable to travel", "Changed delegation composition"
  → Creates ParticipantReplacement (status: PENDING)
  → Admin reviews replacement request
  → If APPROVED:
    → Original participant status set to REPLACED (withdrawn from workflow)
    → Focal point receives notification to register replacement
    → Replacement registration opens with pre-filled delegation info
    → Replacement enters workflow from Step 1
    → DelegationQuota counts remain unchanged (swap, not addition)
  → If DENIED:
    → Focal point notified with reason
```

#### 12.2.5 Integration Points

| System | Integration |
|--------|------------|
| Invitation System | DelegationQuota derived from InvitationConstraint records |
| Workflow Engine | Registered participants enter event workflow automatically |
| Communication Hub | Focal points receive status update emails for their delegation |
| Waitlist | When quota is full, option to join waitlist instead of hard rejection |
| Analytics | Delegation completion rates feed into registration velocity dashboard |
| Accommodation | Focal point can view/manage room assignments for their delegation |
| Transport | Focal point provides arrival/departure data for delegation members |

---

### 12.3 Advanced Analytics Dashboard

Event operations generate enormous volumes of data — registrations, approvals, scan logs, incidents, communications — but without a unified analytics layer, decision-makers operate on gut feeling. The analytics dashboard transforms raw operational data into real-time intelligence, enabling proactive decisions: redirect staff to overloaded gates, nudge slow validators, identify no-show patterns, and generate post-event reports that justify budgets.

#### 12.3.1 Data Model

```prisma
model AnalyticsSnapshot {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  snapshotType String  // HOURLY, DAILY, WEEKLY, ON_DEMAND
  metrics     Json     // { registrationCount, approvalRate, avgApprovalTime, ... }
  generatedAt DateTime @default(now())
  generatedBy String?  // userId if ON_DEMAND, null if automated

  @@index([eventId, snapshotType, generatedAt])
}

model MetricAlert {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  metricName  String   // "approval_sla_breach", "capacity_threshold", "registration_velocity_drop"
  threshold   Float    // Trigger value
  comparator  String   // GT, LT, GTE, LTE, EQ
  isActive    Boolean  @default(true)
  channels    String[] // ["EMAIL", "SSE", "SMS"]
  recipients  String[] // userIds
  cooldownMin Int      @default(30) // Don't re-alert within cooldown
  lastFiredAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([eventId, isActive])
}

model SavedReport {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  name        String
  description String?
  filters     Json     // { dateRange, participantTypes, countries, ... }
  columns     String[] // Selected data columns
  chartType   String?  // BAR, LINE, PIE, TABLE, FUNNEL
  schedule    String?  // Cron expression for automated generation
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([eventId, createdBy])
}
```

#### 12.3.2 Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Analytics Dashboard — 38th AU Summit         [Live ●] [Export] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Key Metrics (updated every 30s via SSE)                         │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │   1,847  │ │   1,203  │ │    89%   │ │   4.2h   │           │
│  │Registered│ │ Approved │ │Approval %│ │ Avg Time │           │
│  │  +23/hr  │ │  +15/hr  │ │  ▲ 2%   │ │  ▼ 0.3h │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                  │
│  Registration Funnel                  SLA Compliance Heatmap     │
│  ┌──────────────────────┐           ┌───────────────────────┐   │
│  │ ████████████████ 1847│ Submitted │      Mon Tue Wed Thu  │   │
│  │ ██████████████   1580│ Docs OK   │ Val1  🟢  🟢  🟡  🟢 │   │
│  │ ████████████     1203│ Approved  │ Val2  🟢  🟡  🔴  🟡 │   │
│  │ ██████████        987│ Printed   │ Val3  🟢  🟢  🟢  🟢 │   │
│  │ ████████          812│ Collected │ Val4  🟡  🔴  🔴  🟡 │   │
│  └──────────────────────┘           └───────────────────────┘   │
│                                                                  │
│  Registration by Country (top 10)     Validator Workload         │
│  ┌──────────────────────┐           ┌───────────────────────┐   │
│  │ Nigeria    ▓▓▓▓▓ 124 │           │ Val1 ████████░░ 45    │   │
│  │ Ethiopia   ▓▓▓▓  98  │           │ Val2 ██████████ 67 ⚠  │   │
│  │ Kenya      ▓▓▓▓  95  │           │ Val3 ████░░░░░░ 23    │   │
│  │ S.Africa   ▓▓▓   87  │           │ Val4 ██████░░░░ 38    │   │
│  │ Egypt      ▓▓▓   82  │           │ Imbalance detected    │   │
│  │ ...                  │           └───────────────────────┘   │
│  └──────────────────────┘                                       │
│                                                                  │
│  Alerts (3 active)                                               │
│  🔴 Validator 2 SLA breach: 12 requests pending > 24 hours      │
│  🟡 Plenary Hall at 92% capacity                                │
│  🟡 Registration velocity dropped 40% vs. yesterday             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.3.3 Real-Time Data Pipeline

Each dashboard widget subscribes to a specific SSE channel:

```
Widget: "Key Metrics"     → SSE channel: /events/:eventId/metrics/summary
Widget: "Funnel"          → SSE channel: /events/:eventId/metrics/funnel
Widget: "Occupancy"       → SSE channel: /events/:eventId/metrics/occupancy
Widget: "Alerts"          → SSE channel: /events/:eventId/alerts

Server-side:
  → Every action (registration, approval, scan, incident) triggers a metric update
  → Metric aggregator computes running totals in VenueOccupancy / AnalyticsSnapshot
  → SSE broadcaster pushes delta updates to subscribed clients
  → Clients patch local state (no full refresh, only incremental updates)
```

#### 12.3.4 PDF Snapshot Generation

```
Admin clicks [Export] → Choose: "Daily Briefing" or "Full Report"
  → System reads current AnalyticsSnapshot for selected period
  → Renders dashboard charts as static SVG images
  → Assembles PDF layout: cover page + key metrics + charts + data tables
  → Generates PDF using @react-pdf/renderer (same engine as badge/certificate generation)
  → Returns download link
  → Optionally: schedule daily briefing PDF to be emailed at 07:00 every morning
```

#### 12.3.5 Integration Points

| System | Data Source |
|--------|-----------|
| Registration | Registration counts, velocity, status distribution |
| Workflow Engine | Approval times, SLA compliance, bottleneck identification |
| Check-In / Access Control | Venue occupancy, gate throughput, scan results |
| Incident Management | Active incident count, resolution times, severity distribution |
| Communication Hub | Message delivery rates, bounce rates |
| Catering | Meal redemption rates |
| Transport | Vehicle utilization, on-time pickup rates |
| Accommodation | Room occupancy, no-show rates |

---

### 12.4 Communication Hub

Events require constant communication: confirmation emails after registration, status update notifications, document request reminders, emergency broadcasts, and VIP-specific announcements. Scattering these across ad-hoc email sends creates inconsistency in tone, missed recipients, and no delivery tracking. A centralized communication hub provides templated messaging, audience filtering, scheduled sends, delivery tracking, and an emergency broadcast capability that reaches everyone in seconds.

#### 12.4.1 Data Model

```prisma
enum MessageChannel {
  EMAIL
  SMS
  PUSH
  IN_APP
}

enum MessageStatus {
  QUEUED
  SENDING
  SENT
  DELIVERED
  BOUNCED
  FAILED
}

enum BroadcastStatus {
  DRAFT
  SCHEDULED
  SENDING
  SENT
  CANCELLED
}

model MessageTemplate {
  id          String   @id @default(cuid())
  tenantId    String
  name        String   // "Registration Confirmation", "Document Reminder"
  subject     String   // Email subject with {{variables}}
  body        String   // Rich text body with {{participant.name}}, {{event.name}}, etc.
  channel     MessageChannel
  isSystem    Boolean  @default(false) // System-triggered vs. manually sent
  variables   String[] // List of available template variables
  createdBy   String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, name])
}

model BroadcastMessage {
  id          String          @id @default(cuid())
  tenantId    String
  eventId     String
  templateId  String?
  subject     String
  body        String
  channel     MessageChannel
  status      BroadcastStatus
  filters     Json            // { participantTypes: [...], countries: [...], statuses: [...], accessLevels: [...] }
  recipientCount Int          @default(0)
  sentCount   Int             @default(0)
  failedCount Int             @default(0)
  scheduledAt DateTime?
  sentAt      DateTime?
  createdBy   String
  createdAt   DateTime        @default(now())
  updatedAt   DateTime        @updatedAt

  deliveries  MessageDelivery[]

  @@index([eventId, status])
  @@index([eventId, createdAt])
}

model MessageDelivery {
  id            String        @id @default(cuid())
  broadcastId   String?
  broadcast     BroadcastMessage? @relation(fields: [broadcastId], references: [id], onDelete: SetNull)
  participantId String
  channel       MessageChannel
  recipient     String        // Email address or phone number
  status        MessageStatus
  externalId    String?       // Azure Communication Services message ID
  sentAt        DateTime?
  deliveredAt   DateTime?
  bouncedAt     DateTime?
  errorMessage  String?
  createdAt     DateTime      @default(now())

  @@index([broadcastId, status])
  @@index([participantId, createdAt])
}
```

#### 12.4.2 Broadcast Flow

```
Admin opens Communication Hub → [New Broadcast]
  → Step 1: Audience
    - Filter by: participant type, country, registration status, access level
    - Preview: "This message will reach 342 participants"
    - Review sample of 5 recipients for sanity check

  → Step 2: Compose
    - Choose existing template or write custom
    - Rich text editor with variable insertion: {{participant.name}}, {{event.name}}, {{registration.code}}
    - Preview rendered message for a sample participant

  → Step 3: Schedule
    - Send now, or schedule for specific date/time
    - For SMS: check timezone of recipients

  → Step 4: Confirm
    - Summary: channel, recipient count, content preview
    - [Send Now] or [Schedule]

  → Execution:
    - BroadcastMessage created (status: SENDING)
    - Worker picks up broadcast
    - For each matching participant: create MessageDelivery (status: QUEUED)
    - Batch send via Azure Communication Services (100 per batch)
    - Update delivery status as callbacks arrive
    - SSE streams progress to admin: "Sent 142/342... 285/342... Complete"
```

#### 12.4.3 Emergency Broadcast

```
Admin clicks [Emergency Broadcast] on any page (persistent button in header)
  → Confirmation: "This will send an immediate message to ALL participants. Continue?"
  → Short message field (160 char for SMS compatibility)
  → Select channels: [✓ Email] [✓ SMS] [✓ Push]
  → [SEND EMERGENCY BROADCAST]
  → Bypasses scheduling, sends to ALL active participants immediately
  → Logged with special flag for audit trail
  → Command Center receives alert: "Emergency broadcast sent by Admin X"
```

#### 12.4.4 Template Builder Wireframe

```
┌─────────────────────────────────────────────────────────────┐
│  Message Template Editor                     [Save] [Test]  │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  Name: [Document Reminder                    ]              │
│  Channel: (●) Email  ( ) SMS  ( ) Push                      │
│  Subject: [Missing documents for {{event.name}}   ]         │
│                                                              │
│  ┌──────────────────────────────────────────────────────┐   │
│  │ B I U  [Link] [Image]   Variables ▾                  │   │
│  ├──────────────────────────────────────────────────────┤   │
│  │                                                      │   │
│  │ Dear {{participant.title}} {{participant.name}},      │   │
│  │                                                      │   │
│  │ Your registration for {{event.name}} is missing      │   │
│  │ the following documents:                             │   │
│  │                                                      │   │
│  │ {{missing.documents.list}}                           │   │
│  │                                                      │   │
│  │ Please upload them before {{deadline.date}} to       │   │
│  │ avoid delays in your accreditation process.          │   │
│  │                                                      │   │
│  │ Upload here: {{upload.link}}                         │   │
│  │                                                      │   │
│  └──────────────────────────────────────────────────────┘   │
│                                                              │
│  Available Variables:                                        │
│  participant.name, participant.title, participant.email,     │
│  event.name, event.date, registration.code,                  │
│  missing.documents.list, upload.link, deadline.date          │
│                                                              │
│  [Send Test to: admin@example.com]                           │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 12.4.5 Integration Points

| System | Integration |
|--------|------------|
| Workflow Engine | Auto-send notifications on step transitions (NOTIFY action) |
| Registration | Confirmation email on successful registration |
| Document Expiry | Automated reminders for missing/expiring documents |
| Waitlist | Position change and promotion notifications |
| Delegation Portal | Status updates sent to focal points |
| Transport | Pickup confirmation with driver details |
| Incident Management | Emergency broadcast channel |
| Azure Communication Services | Email/SMS delivery backend |

---

### 12.5 Kiosk Mode

On event day, hundreds of participants arrive at the registration desk to collect badges, check their status, or get directions. Long queues at manned counters frustrate VIPs and overwhelm staff. Self-service kiosks — large touch screens placed in the lobby — let participants look up their own status, join the badge collection queue, and collect their badge independently after identity verification. This reduces queue times from 15+ minutes to under 2 minutes.

#### 12.5.1 Data Model

```prisma
enum QueueStatus {
  WAITING
  CALLED
  SERVING
  COMPLETED
  NO_SHOW
  CANCELLED
}

model KioskDevice {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  name        String   // "Kiosk 1 - Main Lobby"
  location    String
  isOnline    Boolean  @default(true)
  lastHeartbeat DateTime @default(now())
  language    String   @default("en")
  mode        String   // SELF_SERVICE, QUEUE_DISPLAY, INFO_ONLY
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, eventId, name])
}

model QueueTicket {
  id            String      @id @default(cuid())
  tenantId      String
  eventId       String
  participantId String
  ticketNumber  String      // "A-042" (prefix by participant type)
  counterNumber Int?        // Assigned counter when called
  status        QueueStatus
  priority      Int         @default(0) // Higher = served first (VIPs)
  estimatedWait Int?        // Minutes
  joinedAt      DateTime    @default(now())
  calledAt      DateTime?
  servedAt      DateTime?
  completedAt   DateTime?

  @@unique([tenantId, eventId, ticketNumber])
  @@index([eventId, status, priority])
  @@index([participantId])
}
```

#### 12.5.2 Kiosk Interface Wireframe

Touch-optimized with large buttons, high contrast, and multilingual support:

```
┌─────────────────────────────────────────────────────────────┐
│                                                              │
│              38th African Union Summit                       │
│              Accreditation Self-Service                      │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │                      │  │                      │        │
│  │    🔍 LOOK UP        │  │    📱 SCAN BADGE     │        │
│  │    MY STATUS         │  │    QR CODE           │        │
│  │                      │  │                      │        │
│  └──────────────────────┘  └──────────────────────┘        │
│                                                              │
│  ┌──────────────────────┐  ┌──────────────────────┐        │
│  │                      │  │                      │        │
│  │    🎫 JOIN BADGE     │  │    ℹ️ EVENT           │        │
│  │    COLLECTION QUEUE  │  │    INFORMATION       │        │
│  │                      │  │                      │        │
│  └──────────────────────┘  └──────────────────────┘        │
│                                                              │
│  Language: [EN] [FR] [AR] [PT]                              │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 12.5.3 Self-Service Badge Collection Flow

```
Participant taps [Join Badge Collection Queue]
  → Lookup screen: enter registration code or scan passport barcode
  → System finds participant record
  → Verify identity:
    - Display participant photo on screen
    - Staff visually confirms face matches
    - OR: participant enters last 4 digits of passport number
  → Check badge status:
    - Not printed yet → "Your badge is being prepared. Estimated wait: 15 minutes."
    - Printed and ready → "Your badge is ready for collection!"
  → Generate QueueTicket:
    - VIP/Head of State → priority: 10 (served first)
    - Minister → priority: 5
    - Others → priority: 0 (FIFO)
    - Ticket number displayed on screen: "Your number: A-042"
    - Estimated wait calculated: (tickets ahead / avg service time)
  → Participant takes printed ticket slip (kiosk has thermal printer)
  → When counter becomes available:
    - QueueTicket.status → CALLED
    - Announcement display shows: "A-042 → Counter 3"
    - Staff at counter sees participant details, hands over badge
    - QueueTicket.status → COMPLETED
```

#### 12.5.4 Queue Display Board

A separate kiosk in QUEUE_DISPLAY mode shows the current queue status on a large screen:

```
┌─────────────────────────────────────────────────────────────┐
│  Badge Collection Queue                    Current Wait: 8m │
├─────────────────────────────────────────────────────────────┤
│                                                              │
│  NOW SERVING:                                                │
│  ┌────────────┐ ┌────────────┐ ┌────────────┐              │
│  │ Counter 1  │ │ Counter 2  │ │ Counter 3  │              │
│  │   A-038    │ │   A-039    │ │   V-007    │              │
│  └────────────┘ └────────────┘ └────────────┘              │
│                                                              │
│  NEXT UP:                                                    │
│  A-040  →  A-041  →  A-042  →  A-043  →  A-044            │
│                                                              │
│  Waiting: 23  |  Served today: 487  |  Avg service: 3.2m   │
│                                                              │
└─────────────────────────────────────────────────────────────┘
```

#### 12.5.5 Kiosk Health Monitoring

```
Admin Dashboard → Kiosk Management:
  - List all kiosk devices with online/offline status
  - Last heartbeat timestamp (kiosks ping every 60 seconds)
  - If heartbeat missed for 3+ minutes → alert
  - Remote restart capability
  - Usage statistics: lookups/hour, queue joins/hour per kiosk
  - Language preference distribution (helps plan multilingual staff allocation)
```

#### 12.5.6 Integration Points

| System | Integration |
|--------|------------|
| Participant Status | Lookup shows current workflow step and status |
| Badge Printing | Queue ticket generated only if badge is printed and ready |
| Check-In / Access | Badge collection logged as first "check-in" event |
| Analytics | Queue wait times and throughput feed into operational dashboard |
| Communication Hub | SMS notification when ticket is called (optional) |
| Command Center | Queue lengths stream via SSE for operational awareness |

---

### 12.6 Bulk Operations Center

When an event has 2,000+ participants, individual actions become infeasible. An admin cannot approve 500 support staff one by one, import 800 invitations from a spreadsheet manually, or change the status of 200 rejected participants back to pending. The Bulk Operations Center provides a centralized interface for large-scale data operations with validation, preview, progress tracking, and — critically — undo capability.

#### 12.6.1 Data Model

```prisma
enum BulkOperationType {
  IMPORT_PARTICIPANTS
  IMPORT_INVITATIONS
  EXPORT_PARTICIPANTS
  EXPORT_APPROVALS
  STATUS_CHANGE
  BULK_APPROVE
  BULK_REJECT
  BULK_BYPASS
  FIELD_UPDATE
  DELETE
}

enum BulkOperationStatus {
  VALIDATING
  PREVIEW
  CONFIRMED
  PROCESSING
  COMPLETED
  FAILED
  ROLLED_BACK
}

model BulkOperation {
  id              String              @id @default(cuid())
  tenantId        String
  eventId         String
  type            BulkOperationType
  status          BulkOperationStatus
  description     String              // "Import 847 delegates from AU_delegates.csv"
  filters         Json?               // For status change: { participantTypes, countries, statuses }
  totalItems      Int                 @default(0)
  processedItems  Int                 @default(0)
  successCount    Int                 @default(0)
  failureCount    Int                 @default(0)
  inputFileUrl    String?             // For imports: uploaded CSV location
  outputFileUrl   String?             // For exports: download link
  snapshotData    Json?               // Pre-operation state for undo
  undoDeadline    DateTime?           // Undo available until this time
  errorLog        Json?               // Array of { row, field, error }
  startedAt       DateTime?
  completedAt     DateTime?
  rolledBackAt    DateTime?
  createdBy       String
  createdAt       DateTime            @default(now())
  updatedAt       DateTime            @updatedAt

  items           BulkOperationItem[]

  @@index([eventId, status])
  @@index([eventId, type, createdAt])
}

model BulkOperationItem {
  id            String        @id @default(cuid())
  operationId   String
  operation     BulkOperation @relation(fields: [operationId], references: [id], onDelete: Cascade)
  participantId String?
  rowNumber     Int?          // For CSV imports
  status        String        // PENDING, SUCCESS, FAILED, SKIPPED, ROLLED_BACK
  inputData     Json?         // Raw data for this item
  previousState Json?         // State before operation (for undo)
  errorMessage  String?
  processedAt   DateTime?

  @@index([operationId, status])
}
```

#### 12.6.2 CSV Import Flow

```
Admin opens Bulk Operations → [Import Participants]
  → Step 1: Upload
    - Drag & drop CSV file (max 10MB, UTF-8)
    - System detects delimiter (comma, semicolon, tab)
    - Column mapping screen: map CSV columns to participant fields
      CSV Column          →  System Field
      "Full Name"         →  participant.name
      "Email"             →  participant.email
      "Passport No."      →  participant.passportNumber
      "Country"           →  participant.country
      "Type"              →  participant.participantType
      (unmapped columns stored in customData)

  → Step 2: Validation
    - BulkOperation created (status: VALIDATING)
    - For each row:
      - Required fields present?
      - Email format valid?
      - Country exists in system?
      - Participant type valid for event?
      - Duplicate check against existing participants (passport, email)
    - Results: "847 valid rows, 12 warnings, 3 errors"
    - Errors shown with row number and field: "Row 42: Invalid email format"
    - BulkOperation.status → PREVIEW

  → Step 3: Preview
    - Show first 20 rows as they would be imported
    - Summary: "847 new participants, 0 duplicates, 3 skipped (errors)"
    - [Confirm Import] or [Cancel]

  → Step 4: Execution
    - BulkOperation.status → PROCESSING
    - Worker processes rows in batches of 50
    - Each participant created → enters workflow Step 1
    - Progress streamed via SSE: "Processing... 247/847 (29%)"
    - BulkOperation.status → COMPLETED
    - Undo available for 24 hours (undoDeadline set)

  → Undo (within 24 hours):
    - Admin clicks [Undo Operation]
    - System reads snapshotData → deletes all created participants
    - BulkOperation.status → ROLLED_BACK
```

#### 12.6.3 Bulk Status Change Flow

```
Admin opens Bulk Operations → [Status Change]
  → Filter participants:
    - Participant type: [Support Staff]
    - Current status: [Pending at Step 2]
    - Country: [All]
  → Preview: "234 participants match these filters"
  → Action: [Approve All] / [Reject All] / [Move to Step X]
  → Confirmation: "This will approve 234 Support Staff currently at Step 2. Continue?"
  → Execute:
    - Snapshot current state of all 234 participants
    - Process in batches: move each through workflow
    - Create Approval records for audit trail
    - Progress: "Approved 89/234..."
    - Complete: "234 participants approved. Undo available for 24 hours."
```

#### 12.6.4 Operations History Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Bulk Operations History                        [New Operation] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────┬─────────────────────────┬────────┬───────┬────────┐ │
│  │ Status │ Description             │ Items  │ By    │ Date   │ │
│  ├────────┼─────────────────────────┼────────┼───────┼────────┤ │
│  │ ✅ Done│ Import 847 delegates    │ 847/847│ Admin │ Feb 3  │ │
│  │        │ from AU_delegates.csv   │        │       │ [Undo] │ │
│  │ ✅ Done│ Approve 234 Support     │ 234/234│ Admin │ Feb 3  │ │
│  │        │ Staff at Step 2         │        │       │ [Undo] │ │
│  │ ⚠ Fail│ Import media_list.csv   │  3/120 │ Admin │ Feb 2  │ │
│  │        │ 117 validation errors   │        │       │ [View] │ │
│  │ ↩ Undo│ Import observers.csv    │ 56/56  │ Admin │ Feb 1  │ │
│  │        │ Rolled back Feb 2       │        │       │        │ │
│  │ 📥 Exp│ Export all participants  │ 1,847  │ Admin │ Feb 1  │ │
│  │        │ to participants.xlsx    │        │       │ [DL]   │ │
│  └────────┴─────────────────────────┴────────┴───────┴────────┘ │
│                                                                  │
│  Page 1 of 3                              [← Previous] [Next →] │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.6.5 Integration Points

| System | Integration |
|--------|------------|
| Workflow Engine | Imported participants auto-enter workflow; bulk approvals create Approval records |
| Delegation Portal | Bulk import can specify delegation codes; quota counts updated |
| Duplicate Detection | Every import row checked against duplicate detection engine |
| Analytics | Operation completion rates and import volumes feed into dashboard |
| Communication Hub | Bulk operations can trigger batch notifications |
| Audit Trail | All bulk operations logged with full undo snapshots |

---

### 12.7 Template Marketplace

Organizations managing events build reusable assets: badge templates, workflow configurations, registration forms, seating layouts, and certificate designs. Currently, each tenant starts from scratch. A template marketplace enables tenants to publish their best templates for others to discover, preview, and install. This accelerates event setup, promotes best practices, and builds a community of shared knowledge — particularly valuable for recurring events like AU summits where different host countries can learn from previous editions.

#### 12.7.1 Data Model

```prisma
enum TemplateCategory {
  BADGE
  WORKFLOW
  FORM
  REPORT
  CERTIFICATE
  SEATING_LAYOUT
}

enum PublishStatus {
  DRAFT
  IN_REVIEW
  PUBLISHED
  DEPRECATED
}

model MarketplaceTemplate {
  id            String           @id @default(cuid())
  category      TemplateCategory
  name          String
  description   String
  longDescription String?       // Rich text with screenshots, use cases
  authorTenantId String
  authorName    String
  status        PublishStatus
  previewImageUrl String?
  templateData  Json             // The actual template payload (badge JSON, workflow steps, form definition)
  tags          String[]         // ["diplomatic", "conference", "AU-style", "A4", "multilingual"]
  usageCount    Int              @default(0)
  avgRating     Float            @default(0)
  ratingCount   Int              @default(0)
  publishedAt   DateTime?
  deprecatedAt  DateTime?
  createdAt     DateTime         @default(now())
  updatedAt     DateTime         @updatedAt

  versions      TemplateVersion[]
  reviews       TemplateReview[]

  @@index([category, status])
  @@index([status, avgRating])
  @@index([tags])
}

model TemplateVersion {
  id            String              @id @default(cuid())
  templateId    String
  template      MarketplaceTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  version       String              // "1.0", "1.1", "2.0"
  changelog     String?
  templateData  Json
  createdAt     DateTime            @default(now())

  @@unique([templateId, version])
}

model TemplateReview {
  id            String              @id @default(cuid())
  templateId    String
  template      MarketplaceTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  reviewerTenantId String
  rating        Int                 // 1-5
  comment       String?
  createdAt     DateTime            @default(now())

  @@unique([templateId, reviewerTenantId])
}

model TemplateInstallation {
  id            String   @id @default(cuid())
  templateId    String
  tenantId      String
  eventId       String?
  version       String
  installedBy   String
  installedAt   DateTime @default(now())

  @@index([tenantId])
  @@index([templateId])
}
```

#### 12.7.2 Template Publishing Flow

```
Tenant admin creates a badge/workflow/form template within their event
  → Template works well → Admin clicks [Publish to Marketplace]
  → Publishing wizard:
    1. Name and description (how this template should be used)
    2. Category auto-detected (BADGE, WORKFLOW, FORM)
    3. Tags: select from predefined + custom (e.g., "summit", "conference", "A4-badge")
    4. Preview image: auto-generated screenshot of badge/form, or upload custom
    5. Submit for review

  → MarketplaceTemplate created (status: IN_REVIEW)
  → Platform admin reviews:
    - Does the template contain inappropriate content?
    - Is it a duplicate of an existing template?
    - Does the description accurately describe it?
  → If approved: status → PUBLISHED, publishedAt set
  → If rejected: author notified with feedback

  → Version management:
    - Author updates template → publishes as new version (1.0 → 1.1)
    - Existing installations notified: "New version available"
    - Tenants can choose to update or stay on current version
```

#### 12.7.3 Template Discovery Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Template Marketplace                       [Publish Template]  │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Category: [All ▾]  Sort: [Most Popular ▾]  Search: [______]   │
│  Tags: [diplomatic] [summit] [x]  [conference]  [multilingual] │
│                                                                  │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │ ┌──────────┐ │ │ ┌──────────┐ │ │ ┌──────────┐ │            │
│  │ │  Preview │ │ │ │  Preview │ │ │ │  Preview │ │            │
│  │ │  Image   │ │ │ │  Image   │ │ │ │  Image   │ │            │
│  │ └──────────┘ │ │ └──────────┘ │ │ └──────────┘ │            │
│  │              │ │              │ │              │            │
│  │ AU Summit    │ │ 3-Step       │ │ Multilingual │            │
│  │ Badge v2.1   │ │ Approval     │ │ Registration │            │
│  │ BADGE        │ │ WORKFLOW     │ │ FORM         │            │
│  │ ★★★★★ (42)  │ │ ★★★★☆ (28)  │ │ ★★★★★ (15)  │            │
│  │ 156 installs │ │ 89 installs  │ │ 34 installs  │            │
│  │              │ │              │ │              │            │
│  │ [Preview]    │ │ [Preview]    │ │ [Preview]    │            │
│  │ [Install]    │ │ [Install]    │ │ [Install]    │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
│  Page 1 of 5                               [← Prev] [Next →]   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.7.4 Template Installation Flow

```
Tenant admin browses marketplace → clicks [Preview] on a badge template
  → Full-size preview renders the badge with sample data
  → [Install to Event] → Select target event
  → Conflict check:
    - If event already has a badge template: "Replace existing or install as additional?"
    - If template references participant types not in event: map or skip
  → Install:
    - Template data copied into tenant's event (new BadgeTemplate / WorkflowTemplate / FormTemplate)
    - TemplateInstallation record created
    - usageCount incremented on MarketplaceTemplate
  → Post-install: template is fully editable within tenant's event (fork, not live link)
```

#### 12.7.5 Integration Points

| System | Integration |
|--------|------------|
| Badge Designer | Badge templates exported/imported as marketplace templates |
| Workflow Engine | Workflow template data serialized with steps, actions, and conditions |
| Visual Form Designer | Form definitions (pages, sections, fields) packaged as templates |
| Certificate Designer | Certificate layouts shared as templates |
| Event Cloning | Clone operation can pull from marketplace instead of previous edition |
| Analytics | Installation counts, ratings, and trends visible to platform admin |

---

### 12.8 Accommodation Management

Multi-day diplomatic events require housing coordination for hundreds of delegates. Protocol dictates that heads of state receive presidential suites, ministers get executive rooms, and support staff share standard rooms. Hotels are block-booked months in advance, and room assignments must balance protocol rank, delegation preferences, and availability. Without a dedicated system, coordinators juggle spreadsheets across multiple hotels, losing track of no-shows, late arrivals, and room changes. Integrating accommodation into the accreditation platform connects housing to participant data — when a participant is approved, their room is auto-assigned; when they're rejected, the room is released.

#### 12.8.1 Data Model

```prisma
enum RoomAssignmentStatus {
  RESERVED
  CONFIRMED
  CHECKED_IN
  CHECKED_OUT
  CANCELLED
  NO_SHOW
}

model Hotel {
  id           String   @id @default(cuid())
  tenantId     String
  eventId      String
  name         String
  address      String
  starRating   Int?
  totalRooms   Int
  contactName  String?
  contactPhone String?
  distanceToVenue String?  // "2.5 km / 10 min drive"
  amenities    String[]   // ["WiFi", "Pool", "Restaurant", "Shuttle"]
  notes        String?
  createdAt    DateTime @default(now())
  updatedAt    DateTime @updatedAt

  roomBlocks   RoomBlock[]

  @@unique([tenantId, eventId, name])
}

model RoomBlock {
  id                String          @id @default(cuid())
  hotelId           String
  hotel             Hotel           @relation(fields: [hotelId], references: [id], onDelete: Cascade)
  participantTypeId String?         // Allocated for specific participant type
  roomType          String          // "Single", "Double", "Suite", "Presidential"
  quantity          Int
  pricePerNight     Float?
  checkInDate       DateTime
  checkOutDate      DateTime
  contactEmail      String?         // Hotel coordinator for this block
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  assignments       RoomAssignment[]

  @@index([hotelId])
}

model RoomAssignment {
  id            String               @id @default(cuid())
  roomBlockId   String
  roomBlock     RoomBlock            @relation(fields: [roomBlockId], references: [id], onDelete: Cascade)
  participantId String
  roomNumber    String?
  checkInDate   DateTime
  checkOutDate  DateTime
  status        RoomAssignmentStatus
  specialRequests String?            // "Connecting room with delegation", "Ground floor"
  notes         String?
  assignedBy    String?              // userId or "SYSTEM" for auto-assignment
  createdAt     DateTime             @default(now())
  updatedAt     DateTime             @updatedAt

  @@unique([roomBlockId, participantId])
  @@index([participantId])
  @@index([status])
}
```

#### 12.8.2 Auto-Assignment Algorithm

```
When participant status reaches APPROVED:
  → System reads participant's type and protocol rank
  → Protocol rank mapping:
      Head of State     → Presidential Suite
      Minister          → Suite
      Ambassador        → Executive Room
      Delegate          → Double Room
      Support Staff     → Single Room (may share)
      Security          → Single Room

  → Find matching RoomBlock:
    1. Filter by participantTypeId matching participant's type
    2. Filter by date range overlapping participant's travel dates
    3. Sort by hotel preference (delegation's preferred hotel, if specified)
    4. Check availability: block.quantity > assigned count
    5. If match found → create RoomAssignment (status: RESERVED)
    6. If no match → flag for manual assignment, notify admin

  → Delegation grouping preference:
    - Try to assign same delegation to same hotel
    - Head of delegation in same hotel as their delegation
    - If hotel is full, overflow to nearest alternative
```

#### 12.8.3 Accommodation Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Accommodation Dashboard                 [Add Hotel] [Export]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Hotel Summary                                                   │
│  ┌─────────────────────┬──────┬──────┬───────┬────────┬───────┐ │
│  │ Hotel               │Rooms │Assign│ Check │No-Show │Avail  │ │
│  ├─────────────────────┼──────┼──────┼───────┼────────┼───────┤ │
│  │ Sheraton Addis ★★★★★│  120 │  98  │  72   │   3    │  22   │ │
│  │ Hilton Addis   ★★★★★│   80 │  74  │  65   │   1    │   6   │ │
│  │ Hyatt Regency  ★★★★ │  150 │ 112  │  89   │   5    │  38   │ │
│  │ Capital Hotel  ★★★  │  200 │ 145  │  98   │   8    │  55   │ │
│  └─────────────────────┴──────┴──────┴───────┴────────┴───────┘ │
│                                                                  │
│  Room Type Distribution          Assignment Alerts               │
│  Presidential ██░░  4/5          ⚠ 23 approved participants     │
│  Suite        ████░ 18/22          unassigned                    │
│  Executive    ██████ 67/80       ⚠ 8 no-shows — rooms held     │
│  Double       ████████ 198/250   ⚠ Sheraton at 82% capacity    │
│  Single       ████████░ 142/193                                  │
│                                                                  │
│  [Auto-Assign Unassigned]  [Generate Rooming Lists]             │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.8.4 Rooming List Export

```
Admin clicks [Generate Rooming Lists]
  → Select hotel (or all hotels)
  → System generates PDF/Excel per hotel:
    ┌─────────────────────────────────────────────────────────┐
    │ ROOMING LIST — Sheraton Addis Ababa                     │
    │ 38th AU Summit  |  Feb 10-17, 2026                     │
    ├────┬───────────────┬──────────┬────────┬──────┬────────┤
    │Room│ Guest         │ Country  │ Type   │ In   │ Out    │
    ├────┼───────────────┼──────────┼────────┼──────┼────────┤
    │1201│ H.E. W. Ruto  │ Kenya    │ Pres.  │Feb 10│ Feb 16 │
    │1202│ Security      │ Kenya    │ Single │Feb 10│ Feb 16 │
    │ 802│ Min. Omamo    │ Kenya    │ Suite  │Feb 11│ Feb 15 │
    │ ...│               │          │        │      │        │
    └────┴───────────────┴──────────┴────────┴──────┴────────┘
  → Emailed to hotel contact or downloaded
```

#### 12.8.5 Integration Points

| System | Integration |
|--------|------------|
| Participant Approval | Auto-assign room when participant reaches APPROVED status |
| Delegation Portal | Focal points view room assignments for their delegation |
| Transport | Hotel address used as pickup/dropoff location for airport transfers |
| Protocol | Protocol rank determines room type assignment |
| Budget | Room costs aggregated per delegation for billing |
| Waitlist | When participant is rejected/cancelled, room released for waitlisted participant |
| Personal Agenda | Room details shown on participant's agenda |
| Command Center | Hotel occupancy feeds into operational dashboard |

---

### 12.9 Transportation & Logistics

Coordinating airport pickups, inter-venue shuttles, and VIP motorcades for hundreds of delegates is one of the most operationally complex aspects of large events. A minister's flight lands at 14:30, their bilateral meeting starts at 16:00, and the hotel is 30 minutes from the venue. The system must auto-schedule a pickup, assign a vehicle, notify the driver, track the trip, and alert operations if the delegate hasn't been picked up by 15:00. Without integration, logistics coordinators work from printouts of flight data, manually calling drivers.

#### 12.9.1 Data Model

```prisma
enum TransportType {
  AIRPORT_PICKUP
  AIRPORT_DROPOFF
  HOTEL_TO_VENUE
  VENUE_TO_HOTEL
  INTER_VENUE
  MOTORCADE
  AD_HOC
}

enum TransportStatus {
  PENDING
  CONFIRMED
  DRIVER_ASSIGNED
  EN_ROUTE_PICKUP
  PASSENGER_COLLECTED
  EN_ROUTE_DESTINATION
  COMPLETED
  CANCELLED
  NO_SHOW
}

enum VehicleType {
  SEDAN
  SUV
  VAN
  MINIBUS
  BUS
  MOTORCYCLE_ESCORT
}

enum VehicleStatus {
  AVAILABLE
  ASSIGNED
  IN_USE
  MAINTENANCE
  OFF_DUTY
}

model TransportRequest {
  id              String          @id @default(cuid())
  tenantId        String
  eventId         String
  participantId   String
  type            TransportType
  status          TransportStatus

  pickupLocation  String
  dropoffLocation String
  scheduledTime   DateTime
  flightNumber    String?
  flightArrivalTime DateTime?
  terminalGate    String?
  vehicleId       String?
  vehicle         Vehicle?        @relation(fields: [vehicleId], references: [id])
  driverId        String?
  passengerCount  Int             @default(1)

  actualPickupTime  DateTime?
  actualDropoffTime DateTime?
  notes             String?
  createdAt         DateTime      @default(now())
  updatedAt         DateTime      @updatedAt

  @@index([eventId, scheduledTime])
  @@index([eventId, status])
  @@index([driverId, scheduledTime])
  @@index([vehicleId, scheduledTime])
}

model Vehicle {
  id            String        @id @default(cuid())
  tenantId      String
  eventId       String
  plateNumber   String
  type          VehicleType
  capacity      Int
  assignedTo    String?       // Delegation or participant type
  status        VehicleStatus
  driverName    String?
  driverPhone   String?
  gpsTrackingId String?

  requests      TransportRequest[]

  createdAt     DateTime      @default(now())
  updatedAt     DateTime      @updatedAt

  @@unique([tenantId, eventId, plateNumber])
  @@index([eventId, status])
}

model ShuttleRoute {
  id            String   @id @default(cuid())
  tenantId      String
  eventId       String
  name          String   // "Hotel Zone → Venue", "Airport Express"
  stops         Json     // [{ name, location, arrivalOffset }]
  vehicleIds    String[] // Assigned vehicles
  frequency     Int      // Minutes between departures
  startTime     String   // "06:00"
  endTime       String   // "22:00"
  isActive      Boolean  @default(true)
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([tenantId, eventId, name])
}
```

#### 12.9.2 Airport Pickup Scheduling Flow

```
Participant registers with flight data (flightNumber, arrivalTime, terminal)
  → When participant reaches APPROVED status:
    → System auto-creates TransportRequest:
        type: AIRPORT_PICKUP
        scheduledTime: flightArrivalTime + 45 min (baggage + customs buffer)
        pickupLocation: "Bole International Airport, Terminal 2"
        dropoffLocation: participant's assigned hotel (from Accommodation)
    → Vehicle assignment algorithm:
        1. Check participant protocol level:
           Head of State → dedicated SUV + motorcycle escort → MOTORCADE
           Minister → dedicated sedan
           Delegate → shared van (group by arrival window ± 30 min)
        2. Find available vehicle of matching type for that time slot
        3. Assign vehicle and driver
        4. TransportRequest.status → DRIVER_ASSIGNED
    → Driver receives notification (SMS + app push):
        "Pickup: H.E. John Doe, Flight ET502, Terminal 2, 14:30"
    → Participant receives confirmation email:
        "Your driver will meet you at Terminal 2 arrivals. Vehicle: Toyota Land Cruiser, Plate: AA-1234"

  On event day:
    → Driver marks EN_ROUTE_PICKUP when departing for airport
    → Driver marks PASSENGER_COLLECTED when participant is in vehicle
    → Driver marks COMPLETED at dropoff
    → If no pickup 60 min after scheduled time → alert to operations
```

#### 12.9.3 Fleet Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Transportation Dashboard — Live               [Add Vehicle]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Fleet Status                    Today's Schedule                │
│  Available:  12 ████████████     ┌──────────────────────────┐   │
│  In Use:      8 ████████         │ 14:00  ET502 pickup ●    │   │
│  Assigned:    5 █████            │ 14:15  Shuttle Run 12    │   │
│  Maintenance: 2 ██               │ 14:30  ET714 pickup ●    │   │
│                                  │ 14:30  Bilateral transfer│   │
│  Upcoming Pickups (next 2 hrs)   │ 15:00  Shuttle Run 13    │   │
│  ┌────────┬──────────┬────────┐  │ 15:15  Motorcade prep ★  │   │
│  │ Time   │ Flight   │ Status │  │ 15:30  ET819 pickup ●    │   │
│  │ 14:00  │ ET502    │ 🟢 Asn│  │ ...                      │   │
│  │ 14:30  │ ET714    │ 🟡 Pnd│  └──────────────────────────┘   │
│  │ 15:30  │ ET819    │ 🟢 Asn│                                  │
│  │ 16:00  │ KQ402    │ 🔴 No │  Shuttle Routes                  │
│  │        │          │ Driver │  Hotel Zone → Venue: every 15m  │
│  └────────┴──────────┴────────┘  Airport Express: every 30m     │
│                                  VIP Shuttle: on demand          │
│  ⚠ KQ402 (16:00) has no vehicle — 3 passengers arriving        │
│  [Auto-Assign]                                                   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.9.4 Transport Manifest

```
Admin clicks [Generate Manifest] → Select date
  → System produces PDF grouped by time slot:

  ┌──────────────────────────────────────────────────────────────┐
  │ TRANSPORT MANIFEST — February 10, 2026                       │
  ├──────┬────────┬───────────────────┬──────────┬──────────────┤
  │ Time │ Type   │ Passengers        │ Vehicle  │ Driver       │
  ├──────┼────────┼───────────────────┼──────────┼──────────────┤
  │14:00 │Pickup  │ H.E. W. Ruto (KEN)│ LC-001   │ Tadesse B.  │
  │      │ET502   │ + 2 security      │ + escort │              │
  │14:30 │Pickup  │ Min. Omamo (KEN)  │ SD-005   │ Hailu M.    │
  │      │ET714   │ Dr. Juma (KEN)    │          │              │
  │15:00 │Shuttle │ 18 delegates      │ BUS-002  │ Kebede A.   │
  │      │Run 13  │ Hotel Zone→Venue  │          │              │
  │ ...  │        │                   │          │              │
  └──────┴────────┴───────────────────┴──────────┴──────────────┘
```

#### 12.9.5 Integration Points

| System | Integration |
|--------|------------|
| Participant Registration | Flight data captured during registration creates transport requests |
| Accommodation | Hotel address used as default pickup/dropoff for hotel transfers |
| Bilateral Meetings | Inter-venue bilateral meetings trigger transport requests |
| Personal Agenda | Transport details shown on participant's mobile agenda |
| Command Center | Vehicle locations and status stream via SSE |
| Budget | Vehicle hire and fuel costs tracked per delegation |
| Incident Management | Vehicle breakdown creates incident |
| Check-In | Arrival scan at venue confirms transport completion |

---

### 12.10 Protocol & Seating Management

Diplomatic events follow strict protocol: heads of state are seated by seniority of service (longest-serving president first), countries follow alphabetical or rotational order (which shifts each summit), and bilateral meeting partners must not be adjacent to adversarial nations. Seating mistakes at the opening ceremony of an AU Summit could cause a diplomatic incident. The protocol module provides a rank-aware seating engine, a visual chart editor, and integration with nameplate/flag printing.

#### 12.10.1 Data Model

The existing SeatingArrangement and SeatAssignment models are retained, with the addition of a protocol ranking system:

```prisma
model ProtocolRank {
  id              String   @id @default(cuid())
  tenantId        String
  eventId         String
  countryCode     String   // "KEN", "ETH", "NGA"
  countryName     String
  rank            Int      // 1 = highest precedence
  rankingSystem   String   // "SENIORITY", "ALPHABETICAL", "ROTATIONAL", "CUSTOM"
  headOfStateTitle String? // "President", "Prime Minister", "King"
  headOfStateName String?
  inOfficeSince   DateTime? // For seniority-based ranking
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@unique([tenantId, eventId, countryCode])
  @@index([eventId, rank])
}

model SeatingConflictRule {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  countryA    String   // Country code
  countryB    String   // Country code
  ruleType    String   // "NO_ADJACENT", "MINIMUM_DISTANCE", "SAME_TABLE_OK"
  distance    Int?     // Minimum seats apart (for MINIMUM_DISTANCE)
  reason      String?
  createdBy   String
  createdAt   DateTime @default(now())

  @@unique([tenantId, eventId, countryA, countryB])
}

model SeatingArrangement {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  meetingId   String
  name        String
  layoutType  String   // THEATER, BOARDROOM, BANQUET, U_SHAPE, CLASSROOM, HOLLOW_SQUARE
  layout      Json     // Visual layout data (table positions, shapes, dimensions)
  totalSeats  Int
  assignedSeats Int    @default(0)
  isFinalized Boolean  @default(false)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  seats       SeatAssignment[]

  @@unique([tenantId, eventId, meetingId, name])
}

model SeatAssignment {
  id            String   @id @default(cuid())
  arrangementId String
  arrangement   SeatingArrangement @relation(fields: [arrangementId], references: [id], onDelete: Cascade)
  participantId String?
  seatLabel     String
  tableNumber   Int?
  seatNumber    Int?
  positionX     Float?
  positionY     Float?
  isReserved    Boolean  @default(false)
  reservedFor   String?
  protocolRank  Int?
  nameplatePrinted Boolean @default(false)

  @@unique([arrangementId, seatLabel])
  @@index([arrangementId, protocolRank])
}
```

#### 12.10.2 Auto-Seating Algorithm

```
Admin selects arrangement → clicks [Auto-Assign by Protocol]
  → Choose ranking system:
    (●) Seniority (longest-serving head of state first)
    ( ) Alphabetical (by country name in event language)
    ( ) Rotational (shift starting position from previous edition)
    ( ) Custom (manual rank numbers)

  → Algorithm (for BOARDROOM / U_SHAPE / HOLLOW_SQUARE layouts):
    1. Load all confirmed participants for this meeting
    2. Sort by ProtocolRank.rank (ascending = highest precedence first)
    3. Seat placement:
       - Position 1 (center, facing entrance): Host head of state
       - Position 2 (right of host): Rank 1 country head of state
       - Position 3 (left of host): Rank 2 country head of state
       - Alternating right-left for remaining positions
    4. Apply conflict rules:
       - For each SeatingConflictRule, check if countryA and countryB
         are within the specified distance
       - If violated: swap offending seat with nearest non-conflicting seat
    5. Behind-the-chair seating:
       - Each head of state has 1-2 advisors seated directly behind them
       - Auto-assign delegates from same country to behind-chair positions
    6. Preview result for admin review before finalizing

  → For BANQUET layouts:
    - Assign tables by country grouping
    - Head table: host + guest of honor + top-ranked leaders
    - Remaining tables: balanced by region + protocol rank
    - Conflict rules enforced at table level (adversaries not at same table)
```

#### 12.10.3 Visual Seating Chart Editor

```
┌─────────────────────────────────────────────────────────────────┐
│  Seating: Opening Ceremony          [Auto-Assign] [Print All]  │
├──────────────────────────────────────────────────┬──────────────┤
│                                                  │ Unassigned:  │
│          HOLLOW SQUARE LAYOUT                    │              │
│                                                  │ ☐ Min. Juma  │
│    ┌─────┬─────┬─────┬─────┬─────┐              │   Kenya      │
│    │NGA  │ETH  │HOST │KEN  │ZAF  │              │ ☐ Amb. Diallo│
│    │Rank3│Rank2│  ★  │Rank1│Rank4│  ← Head side │   Senegal    │
│    └─────┴─────┴─────┴─────┴─────┘              │ ☐ Del. Asante│
│    ┌─────┐                   ┌─────┐            │   Ghana      │
│    │MOZ  │                   │TZA  │            │              │
│    │Rank9│    (open center)  │Rank6│ ← Sides    │ Drag to seat │
│    ├─────┤                   ├─────┤            │              │
│    │AGO  │                   │UGA  │            │──────────────│
│    │Rk11 │                   │Rank8│            │ Conflict:    │
│    └─────┘                   └─────┘            │ 🔴 ERI-ETH  │
│    ┌─────┬─────┬─────┬─────┬─────┐             │    no adjacent│
│    │RWA  │SEN  │DRC  │GHA  │CMR  │             │ 🟡 MAR-DZA  │
│    │Rk13 │Rk12 │Rk10 │Rank7│Rank5│ ← Far side │    min 3 seats│
│    └─────┴─────┴─────┴─────┴─────┘             │              │
│                                                  │              │
│  ✅ No conflict violations detected              │              │
│                                                  │              │
└──────────────────────────────────────────────────┴──────────────┘
```

Drag-and-drop: an admin can drag an unassigned participant from the sidebar to any seat, or drag a seated participant to a different seat (swap). Conflict violations are highlighted in real-time.

#### 12.10.4 Nameplate & Flag Generation

```
Admin clicks [Print All] → generates print queue:
  → For each assigned seat:
    - Nameplate card (A5 landscape):
      Front: Country flag + Head of State title + Name
      Back: Country name in 3 event languages (EN, FR, AR)
    - Country flag placard (A4 standing)
    - Table number tent card (for banquet layouts)
  → Sent to badge printer queue (same Print station infrastructure)
  → Printer staff print, fold, and place at seats
  → SeatAssignment.nameplatePrinted → true
```

#### 12.10.5 Integration Points

| System | Integration |
|--------|------------|
| Participant Data | Participant country and type determine protocol rank |
| Meeting Model | Each meeting can have its own seating arrangement |
| Badge Printer | Nameplate and flag printing uses same print infrastructure |
| Catering | Table assignments determine meal service routing for banquet |
| Personal Agenda | Participant sees "Table 12, Seat 3" on their agenda |
| Event Cloning | Protocol rankings and conflict rules carry forward to next edition |
| Bilateral Scheduler | Conflict rules inform bilateral meeting scheduling |

---

### 12.11 Incident & Safety Management

Events with thousands of attendees generate incidents: a delegate faints from heat exhaustion, a gate scanner malfunctions, a power outage hits a conference room, or a security perimeter is breached. Without a structured incident management system, these situations are handled through phone calls and walkie-talkies with no record, no escalation automation, and no post-event analysis. A dedicated incident system captures, routes, escalates, and resolves incidents with full audit trails and integration with the command center for real-time situational awareness.

#### 12.11.1 Data Model

```prisma
enum IncidentType {
  MEDICAL
  SECURITY
  TECHNICAL
  CROWD_CONTROL
  WEATHER
  FIRE
  POWER
  COMMUNICATIONS
  PROTOCOL
  OTHER
}

enum IncidentSeverity {
  LOW        // Minor issue, no immediate impact
  MEDIUM     // Moderate impact, requires attention
  HIGH       // Significant impact, urgent response needed
  CRITICAL   // Life-threatening or event-stopping
}

enum IncidentStatus {
  REPORTED
  TRIAGED
  ASSIGNED
  IN_PROGRESS
  ESCALATED
  RESOLVED
  CLOSED
}

model Incident {
  id            String           @id @default(cuid())
  tenantId      String
  eventId       String
  type          IncidentType
  severity      IncidentSeverity
  status        IncidentStatus
  title         String
  description   String
  location      String?          // "Plenary Hall, Row 12" or "Gate B"
  zoneId        String?          // EventZone reference
  floorPlanX    Float?           // Position on venue floor plan
  floorPlanY    Float?
  reportedBy    String           // userId
  assignedTeam  String?          // "Medical", "Security", "IT", "Facilities"
  assignedTo    String?          // specific userId
  resolvedBy    String?
  resolutionNotes String?

  participantId String?
  meetingId     String?

  reportedAt    DateTime         @default(now())
  triagedAt     DateTime?
  assignedAt    DateTime?
  resolvedAt    DateTime?
  closedAt      DateTime?

  updates       IncidentUpdate[]
  escalations   IncidentEscalation[]

  @@index([eventId, status])
  @@index([eventId, severity])
  @@index([eventId, type])
  @@index([assignedTo, status])
}

model IncidentUpdate {
  id         String   @id @default(cuid())
  incidentId String
  incident   Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  userId     String
  message    String
  attachmentUrl String? // Photo of situation
  createdAt  DateTime @default(now())
}

model IncidentEscalation {
  id          String   @id @default(cuid())
  incidentId  String
  incident    Incident @relation(fields: [incidentId], references: [id], onDelete: Cascade)
  fromLevel   Int      // 1 = team lead, 2 = operations manager, 3 = event director
  toLevel     Int
  reason      String   // "Unresolved after 15 minutes", "Severity upgraded"
  escalatedBy String   // "SYSTEM" for auto-escalation, userId for manual
  notifiedUsers String[] // userIds who were notified
  escalatedAt DateTime @default(now())
}

model EscalationPolicy {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  incidentType IncidentType?  // null = applies to all types
  severity    IncidentSeverity
  level1Team  String[]  // userIds — first responders
  level2Team  String[]  // operations managers
  level3Team  String[]  // event directors
  escalateAfterMin Int  // Auto-escalate if unresolved after X minutes
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([tenantId, eventId, incidentType, severity])
}
```

#### 12.11.2 Incident Lifecycle Flow

```
Reporter (any staff member) taps [Report Incident] on scanner/app
  → Quick-report form:
    - Type: [MEDICAL ▾]
    - Severity: [HIGH ▾]
    - Location: [Plenary Hall ▾] or tap on floor plan
    - Description: "Delegate collapsed, appears unconscious"
    - Photo: [📷 Capture]
  → Incident created (status: REPORTED)
  → Command Center receives SSE alert immediately

  → Auto-triage (status: TRIAGED):
    - System looks up EscalationPolicy for type=MEDICAL, severity=HIGH
    - Assigns to level1Team (Medical team on-site)
    - Sends SMS + push to all team members: "MEDICAL HIGH: Plenary Hall — Delegate collapsed"
    - Status → ASSIGNED, timer starts

  → Response:
    - Medical team member opens incident, status → IN_PROGRESS
    - Adds updates: "On scene, administering first aid"
    - Adds update: "Patient stable, ambulance called"
    - If resolved: status → RESOLVED, resolutionNotes filled

  → Auto-escalation:
    - If status still ASSIGNED after EscalationPolicy.escalateAfterMin minutes:
      - Create IncidentEscalation (fromLevel: 1, toLevel: 2)
      - Notify level2Team: "ESCALATED: Medical incident in Plenary Hall unresolved after 15 min"
      - Status → ESCALATED
    - If still unresolved after another interval → escalate to level 3

  → Closure:
    - Operations manager reviews resolved incident
    - Adds final notes, confirms resolution
    - Status → CLOSED
```

#### 12.11.3 Incident Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Incident Management — Live                [Report Incident]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Active Incidents (7)          │  Floor Plan View                │
│  ┌────────────────────────────┐│  ┌────────────────────────┐    │
│  │🔴 CRITICAL #42            ││  │                        │    │
│  │  Security breach Gate C   ││  │    🔴         🟡       │    │
│  │  Escalated to Level 3     ││  │        Plenary         │    │
│  │  Assigned: Security Dir.  ││  │              🟡        │    │
│  │  23 min ago               ││  │                        │    │
│  ├────────────────────────────┤│  │  🟠                    │    │
│  │🟠 HIGH #45               ││  │      Conf Room B       │    │
│  │  Medical - delegate faint ││  │                        │    │
│  │  In Progress: Medical Team││  │           🟢           │    │
│  │  8 min ago                ││  │     VIP Lounge         │    │
│  ├────────────────────────────┤│  └────────────────────────┘    │
│  │🟡 MEDIUM #47             ││                                  │
│  │  Technical - projector off││  Today's Stats                   │
│  │  Assigned: IT Support     ││  Reported:  12                   │
│  │  3 min ago                ││  Resolved:   5                   │
│  ├────────────────────────────┤│  Avg Resolution: 18 min         │
│  │🟢 LOW #44                ││  Escalated:  2                   │
│  │  Signage needs correction ││                                  │
│  │  Assigned: Facilities     ││  By Type:                        │
│  │  45 min ago               ││  Medical ▓▓▓ 3                   │
│  └────────────────────────────┘│  Security ▓▓ 2                   │
│                                │  Technical ▓▓▓▓ 4               │
│                                │  Other ▓▓▓ 3                    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.11.4 Post-Event Incident Report

```
After event closes → Admin generates Incident Report:
  → System compiles all incidents with full timelines
  → Report sections:
    1. Executive Summary: total incidents, resolution rate, avg response time
    2. Critical Incidents: detailed timeline for each CRITICAL/HIGH incident
    3. Incident Distribution: by type, severity, location, time of day
    4. Escalation Analysis: how many escalated, at which level resolved
    5. Recommendations: auto-generated from patterns
       e.g., "5 medical incidents occurred at Gate A during afternoon heat.
             Recommendation: Add shade structures and water stations."
  → PDF export for stakeholders and safety compliance
```

#### 12.11.5 Integration Points

| System | Integration |
|--------|------------|
| Communication Hub | Emergency broadcast triggered from CRITICAL incidents |
| Command Center | Active incidents stream via SSE to operations dashboard |
| Check-In / Access | Scanner operators can report incidents directly from scanner UI |
| Venue Floor Plan | Incidents plotted on floor plan with severity-colored markers |
| Participant Data | If incident involves a participant, link for context |
| Transport | Vehicle breakdown creates an incident |
| Medical | Medical incidents can trigger ambulance dispatch |
| Post-Event Report | Incident data feeds into post-event analysis and lessons learned |

---

### 12.12 Duplicate Detection & Blacklist

In large diplomatic events, duplicate registrations are common: a participant is registered by their embassy focal point, then also registers themselves; a person uses a slightly different name spelling across two events; or a known security risk attempts registration under an alias. Without systematic detection, duplicates waste quota, create confusion at badge collection (two badges for one person), and potentially breach security. The duplicate detection engine uses multi-field scoring to identify candidates, while the blacklist system screens every registration against security watchlists.

#### 12.12.1 Data Model

```prisma
enum DuplicateStatus {
  PENDING_REVIEW
  CONFIRMED_DUPLICATE
  NOT_DUPLICATE
  MERGED
}

model DuplicateCandidate {
  id              String          @id @default(cuid())
  tenantId        String
  eventId         String?         // null for cross-event duplicates
  participantAId  String
  participantBId  String
  confidenceScore Float           // 0.0 - 1.0
  matchFields     Json            // { passport: 1.0, name: 0.85, email: 0.75 }
  status          DuplicateStatus
  reviewedBy      String?
  reviewedAt      DateTime?
  reviewNotes     String?
  createdAt       DateTime        @default(now())

  @@unique([participantAId, participantBId])
  @@index([eventId, status])
  @@index([confidenceScore])
}

model MergeHistory {
  id                String   @id @default(cuid())
  tenantId          String
  survivingId       String   // The participant record that remains
  mergedId          String   // The participant record that was absorbed
  fieldResolution   Json     // { name: "survivingId", email: "mergedId", ... } — which record's field won
  approvalsMigrated Int      // Count of approval records moved
  mergedBy          String
  mergedAt          DateTime @default(now())

  @@index([survivingId])
  @@index([mergedId])
}

model Blacklist {
  id             String    @id @default(cuid())
  tenantId       String?   // null = global blacklist
  type           String    // INDIVIDUAL, ORGANIZATION, COUNTRY
  name           String?
  nameVariations String[]  // ["Mohammed Ali", "Muhammad Ali", "Mohamed Ali"]
  passportNumber String?
  email          String?
  dateOfBirth    DateTime?
  nationality    String?
  organization   String?
  reason         String
  source         String?   // "UN Security Council", "Internal", "Government"
  addedBy        String
  expiresAt      DateTime?
  isActive       Boolean   @default(true)
  createdAt      DateTime  @default(now())
  updatedAt      DateTime  @updatedAt

  @@index([passportNumber])
  @@index([email])
  @@index([isActive])
  @@index([name])
}
```

#### 12.12.2 Duplicate Detection Algorithm

```
On participant registration submission:

  → Step 1: Exact match checks (confidence = 1.0)
    - Passport number exact match → 1.0
    - Email exact match → 0.95

  → Step 2: Fuzzy match checks
    - Name similarity (Levenshtein distance ≤ 2):
      "Mohammed Hassan" vs "Muhammad Hassan" → 0.85
      Transliteration handling: Arabic → Latin variations stored in lookup table
    - Name + Date of Birth match → 0.90
    - Name + Country match → 0.70
    - Phone number match (normalized, strip country code) → 0.80

  → Step 3: Cross-field scoring
    confidenceScore = max(individual field scores)
    If multiple fields match: boost score by 0.05 per additional match
    Example: name (0.85) + country (0.70) → combined score: 0.90

  → Step 4: Threshold decision
    - Score ≥ 0.90 → Auto-flag: registration held, DuplicateCandidate created (PENDING_REVIEW)
    - Score 0.70 - 0.89 → Warning flag: registration proceeds but admin notified
    - Score < 0.70 → No action

  → Cross-event detection:
    - After within-event check, run same algorithm against participants
      from all concurrent events for the same tenant
    - "Same passport number registered for Summit AND Youth Forum"
```

#### 12.12.3 Duplicate Review Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Duplicate Review                            12 pending reviews │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Potential Duplicate (Confidence: 92%)                           │
│  ┌──────────────────────────┬──────────────────────────┐        │
│  │ PARTICIPANT A            │ PARTICIPANT B             │        │
│  ├──────────────────────────┼──────────────────────────┤        │
│  │ Name: Mohammed Hassan    │ Name: Muhammad Hassan  ≈  │        │
│  │ Passport: AB1234567    = │ Passport: AB1234567    =  │        │
│  │ Email: m.hassan@gov.eg   │ Email: mhassan@gmail.com  │        │
│  │ Country: Egypt         = │ Country: Egypt          = │        │
│  │ DOB: 1975-03-15       = │ DOB: 1975-03-15        = │        │
│  │ Type: Delegate           │ Type: Delegate            │        │
│  │ Status: Approved (Step4) │ Status: Pending (Step 1)  │        │
│  │ Registered by: Embassy   │ Registered by: Self       │        │
│  │ Photo: [thumbnail]       │ Photo: [thumbnail]        │        │
│  └──────────────────────────┴──────────────────────────┘        │
│                                                                  │
│  Match details: passport=100%, name=85%, DOB=100%, country=100% │
│                                                                  │
│  [Not Duplicate]  [Merge A ← B]  [Merge B ← A]  [Skip]        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.12.4 Merge Flow

```
Admin clicks [Merge A ← B] (A survives, B is absorbed):
  → Field resolution dialog:
    For each field where A and B differ:
      Name:  (●) Mohammed Hassan [A]  ( ) Muhammad Hassan [B]
      Email: ( ) m.hassan@gov.eg [A]  (●) mhassan@gmail.com [B]
      Photo: (●) [A's photo]          ( ) [B's photo]

  → Execute merge:
    1. Update surviving record (A) with resolved field values
    2. Move all Approval records from B → A
    3. Move all AccessLog records from B → A
    4. Move all document uploads from B → A
    5. Update DelegationQuota.usedQuota (decrement for B's delegation)
    6. Create MergeHistory record for audit trail
    7. Soft-delete participant B (retain for audit, exclude from queries)
    8. DuplicateCandidate.status → MERGED
```

#### 12.12.5 Blacklist Screening Flow

```
On every participant registration:
  → Extract: name, passport number, email, organization, nationality
  → Query Blacklist table:
    1. Exact passport number match
    2. Exact email match
    3. Fuzzy name match against name + nameVariations
    4. Organization match
  → If any match found:
    - Registration is NOT entered into workflow
    - Status set to FLAGGED
    - Admin receives alert: "Registration matches blacklist entry #42"
    - Admin reviews:
      [Confirm Block] → registration rejected, participant notified
      [Override — Allow] → registration enters workflow, override logged with reason
```

#### 12.12.6 Integration Points

| System | Integration |
|--------|------------|
| Registration | Every registration triggers duplicate + blacklist check before workflow entry |
| Workflow Engine | Flagged registrations held outside workflow until review |
| Bulk Operations | CSV imports run batch duplicate + blacklist screening |
| Communication Hub | Notifications sent to admin on flags |
| Delegation Portal | Duplicate within same delegation flagged to focal point |
| Audit Trail | All merge operations and blacklist overrides logged |
| Analytics | Duplicate rates and blacklist hit rates reported |

---

### 12.13 Document Expiry & Compliance

Accreditation relies on documents: passports, diplomatic notes, letters of invitation, visa copies, and official photographs. These documents have expiry dates (a passport expiring 2 months before the event won't get through immigration), mandatory requirements (no registration is complete without a passport photo), and legal retention limits (personal data must be purged after the event per data protection regulations). The compliance module ensures document validity, tracks missing documents, manages visa status, and enforces data retention policies — preventing both security gaps and legal liability.

#### 12.13.1 Data Model

```prisma
enum VisaStatus {
  NOT_NEEDED
  PENDING
  APPLIED
  ISSUED
  DENIED
  EXPIRED
}

enum ConsentType {
  DATA_PROCESSING
  PHOTO_USAGE
  COMMUNICATION
  BADGE_DISPLAY
}

enum RetentionAction {
  ANONYMIZE
  DELETE
  ARCHIVE
}

model VisaTracking {
  id              String     @id @default(cuid())
  participantId   String     @unique
  status          VisaStatus
  applicationDate DateTime?
  issueDate       DateTime?
  expiryDate      DateTime?
  visaNumber      String?
  embassy         String?
  supportLetterSent Boolean  @default(false)
  supportLetterDate DateTime?
  notes           String?
  createdAt       DateTime   @default(now())
  updatedAt       DateTime   @updatedAt
}

model ConsentRecord {
  id              String      @id @default(cuid())
  participantId   String
  consentType     ConsentType
  granted         Boolean
  grantedAt       DateTime    @default(now())
  revokedAt       DateTime?
  ipAddress       String?
  version         String      // Version of privacy policy accepted

  @@unique([participantId, consentType])
  @@index([participantId])
}

model ComplianceAlert {
  id              String   @id @default(cuid())
  tenantId        String
  eventId         String
  participantId   String
  alertType       String   // PASSPORT_EXPIRING, DOCUMENT_MISSING, VISA_DEADLINE, DATA_RETENTION_DUE
  details         String   // "Passport expires Feb 5, 2026 — 5 days before event start"
  severity        String   // WARNING, CRITICAL
  isResolved      Boolean  @default(false)
  resolvedAt      DateTime?
  resolvedBy      String?
  createdAt       DateTime @default(now())

  @@index([eventId, alertType, isResolved])
  @@index([participantId])
}

model DataRetentionPolicy {
  id            String          @id @default(cuid())
  tenantId      String
  entityType    String          // "Participant", "Approval", "Document", "AccessLog"
  retentionDays Int
  action        RetentionAction
  isActive      Boolean         @default(true)
  createdAt     DateTime        @default(now())
  updatedAt     DateTime        @updatedAt

  @@unique([tenantId, entityType])
}

model DataRetentionExecution {
  id            String   @id @default(cuid())
  tenantId      String
  eventId       String
  policyId      String
  entityType    String
  recordsProcessed Int
  action        RetentionAction
  executedAt    DateTime @default(now())
  executedBy    String   // "SYSTEM" for automated, userId for manual

  @@index([tenantId, eventId])
}
```

#### 12.13.2 Pre-Event Compliance Batch Check

```
Admin opens Compliance Dashboard → [Run Compliance Check]
  → System scans ALL approved participants:

    Check 1: Passport Expiry
      - participantPassportExpiry < event.startDate + 6 months
      - If true → ComplianceAlert (PASSPORT_EXPIRING, CRITICAL)
      - "Passport expires Feb 5, 2026 — event starts Feb 10, 2026"

    Check 2: Missing Required Documents
      - For each required document field in FormTemplate:
        - If participant has not uploaded file → ComplianceAlert (DOCUMENT_MISSING)
      - "Missing: Official photograph, Letter of nomination"

    Check 3: Visa Status
      - Participants from countries requiring visa:
        - If VisaTracking.status != ISSUED and event < 30 days away → WARNING
        - If VisaTracking.status = DENIED → CRITICAL
      - Auto-send support letter if supportLetterSent = false

    Check 4: Photo Quality
      - Photos below minimum resolution (400x500 px) → WARNING
      - Photos with face detection confidence < 80% → WARNING

  → Results dashboard: "1,203 participants checked. 42 alerts generated."
  → [Send Reminders] → batch email to all participants with outstanding alerts
```

#### 12.13.3 Missing Document Dashboard Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Document Compliance Dashboard            [Run Check] [Remind] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Compliance Overview                                             │
│  ┌──────────────┐ ┌──────────────┐ ┌──────────────┐            │
│  │     96%      │ │      42      │ │      8       │            │
│  │  Compliant   │ │ Open Alerts  │ │ Visa Denied  │            │
│  └──────────────┘ └──────────────┘ └──────────────┘            │
│                                                                  │
│  Document Completion by Type                                     │
│  Passport Copy     ████████████████░ 1,185/1,203  (98.5%)      │
│  Official Photo    ██████████████░░░ 1,142/1,203  (94.9%)      │
│  Nomination Letter ████████████░░░░░ 1,089/1,203  (90.5%)      │
│  Diplomatic Note   ████████░░░░░░░░░   487/612    (79.6%) ⚠    │
│                                                                  │
│  Passport Expiry Alerts                                          │
│  🔴 12 participants — passport expires BEFORE event             │
│  🟡 23 participants — passport expires within 6 months of event │
│                                                                  │
│  Visa Tracking                                                   │
│  Not Needed: 789  |  Issued: 312  |  Pending: 87  |  Denied: 8 │
│  ⚠ 87 visa applications still pending — event in 12 days       │
│                                                                  │
│  [Export Compliance Report]  [Send Bulk Reminders]              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.13.4 Data Retention Execution Flow

```
System cron job runs daily at 02:00:
  → For each active DataRetentionPolicy:
    → Find events where: event.endDate + policy.retentionDays < today
    → For each qualifying event:
      → If action = ANONYMIZE:
        - Replace personal fields with hashes: name → "ANON-a3f2", email → "ANON@redacted"
        - Keep statistical data (country, type, status) for analytics
        - Delete uploaded documents from blob storage
      → If action = DELETE:
        - Hard delete all records of entityType for this event
        - Delete associated blob storage files
      → If action = ARCHIVE:
        - Export to compressed archive in cold storage
        - Delete from primary database
      → Create DataRetentionExecution record
      → Notify tenant admin: "Data retention executed for Event X: 1,847 participant records anonymized"

  GDPR Right of Erasure (manual):
    → Participant requests data deletion → focal point submits request
    → System identifies all records for this participant across all events
    → Admin reviews and confirms
    → Hard delete: participant, approvals, documents, access logs, consent records
    → Confirmation email sent to participant
```

#### 12.13.5 Integration Points

| System | Integration |
|--------|------------|
| Registration | Consent records created during registration |
| Workflow Engine | Missing documents can block workflow progression |
| Communication Hub | Automated reminders for expiring documents and missing uploads |
| Delegation Portal | Focal point sees document compliance status for their delegation |
| Bulk Operations | Bulk compliance check runs across all participants |
| Analytics | Compliance rates tracked as key metric |
| Visa Tracking | Support letter generation integrated with document generation |
| Audit Trail | All retention executions and erasure requests logged |

---

### 12.14 Event Cloning & Recurring Events

Organizations that host the same event annually — the AU Summit, annual general assemblies, recurring conferences — invest weeks configuring workflows, designing badges, building registration forms, setting up invitation quotas, and defining access restrictions. Starting from scratch each year wastes effort and introduces inconsistencies. Event cloning creates a deep copy of an entire event configuration in one operation, while the event series concept links editions together for cross-year analytics and institutional memory.

#### 12.14.1 Data Model

```prisma
enum CloneStatus {
  PENDING
  IN_PROGRESS
  COMPLETED
  FAILED
  ROLLED_BACK
}

model EventSeries {
  id          String   @id @default(cuid())
  tenantId    String
  name        String   // "AU Summit", "Annual Conference"
  description String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  editions    EventEdition[]

  @@unique([tenantId, name])
}

model EventEdition {
  id          String      @id @default(cuid())
  seriesId    String
  series      EventSeries @relation(fields: [seriesId], references: [id], onDelete: Cascade)
  eventId     String      @unique // Links to the Event model
  editionNumber Int       // 34, 35, 36...
  year        Int
  hostCountry String?
  hostCity    String?
  notes       String?
  createdAt   DateTime    @default(now())

  @@unique([seriesId, editionNumber])
  @@index([seriesId, year])
}

model CloneOperation {
  id              String      @id @default(cuid())
  tenantId        String
  sourceEventId   String
  targetEventId   String?     // Created during clone
  status          CloneStatus
  options         Json        // { workflows: true, forms: true, badges: true, invitations: true, restrictions: true, protocolRanks: true }
  elementsCopied  Json?       // { workflows: 5, forms: 3, badges: 2, ... }
  errorLog        String?
  startedAt       DateTime    @default(now())
  completedAt     DateTime?
  createdBy       String

  @@index([tenantId, status])
}
```

#### 12.14.2 Deep Clone Flow

```
Admin opens Events → [Clone Event] on "37th AU Summit"
  → Clone Options Dialog:
    ┌────────────────────────────────────────────────────┐
    │ Clone Event: 37th AU Summit                        │
    ├────────────────────────────────────────────────────┤
    │                                                    │
    │ New Event Name: [38th AU Summit               ]   │
    │ Start Date:     [2026-02-10]                      │
    │ End Date:       [2026-02-17]                      │
    │                                                    │
    │ Elements to clone:                                 │
    │ [✓] Workflows (5 workflows, 23 steps)             │
    │ [✓] Registration Forms (3 form templates)         │
    │ [✓] Badge Templates (2 templates)                 │
    │ [✓] Invitation Structure (quotas, constraints)    │
    │ [ ] Invitation Recipients (carry forward contacts)│
    │ [✓] Access Restrictions                           │
    │ [✓] Protocol Rankings                             │
    │ [✓] Seating Conflict Rules                        │
    │ [ ] Hotels & Accommodation blocks                 │
    │ [ ] Shuttle Routes                                │
    │                                                    │
    │ Link to series: [AU Summit ▾]  Edition: [38]      │
    │                                                    │
    │ [Preview Changes]  [Clone Now]                    │
    └────────────────────────────────────────────────────┘

  → [Clone Now]:
    → CloneOperation created (status: IN_PROGRESS)
    → Clone algorithm:
      1. Create new Event record with new dates and name
      2. For each selected element:
         - Copy all records, generating new IDs (cuid())
         - Remap all foreign key references:
           Step.nextStepId → new step ID
           FormTemplate references → new form IDs
           Workflow → Event link updated to new event
         - Date fields: shift by date delta (new start - old start)
      3. Create EventEdition linking new event to series
      4. CloneOperation.status → COMPLETED
      5. Record elementsCopied for audit

  → Admin reviews cloned event:
    - All workflows present but no participants
    - Forms ready for customization
    - Badges ready for date/branding update
    - Invitation quotas set but no recipients assigned yet
```

#### 12.14.3 Year-over-Year Analytics

```
Admin opens Event Series → "AU Summit"
  → Comparison dashboard across editions:

  ┌─────────────────────────────────────────────────────────────┐
  │ AU Summit — Edition Comparison                              │
  ├─────────────────────────────────────────────────────────────┤
  │                                                              │
  │ Metric              │ 35th (2023) │ 36th (2024) │ 37th (2025)│
  │ ─────────────────── │ ─────────── │ ─────────── │ ──────────│
  │ Total Registrations │   1,542     │   1,687     │   1,847   │
  │ Approval Rate       │    87%      │    89%      │    91%    │
  │ Avg Approval Time   │   6.2 hrs   │   5.1 hrs   │   4.2 hrs │
  │ Badge Collection %  │    78%      │    82%      │    85%    │
  │ No-Show Rate        │    12%      │     9%      │     7%    │
  │ Incidents           │    18       │    14       │    11     │
  │ Countries           │    52       │    54       │    55     │
  │                                                              │
  │ Trend: Registration growing +8%/year, No-shows declining    │
  │                                                              │
  └─────────────────────────────────────────────────────────────┘
```

#### 12.14.4 Carry-Forward Participants

```
During clone, if [Carry Forward Recipients] is selected:
  → System extracts unique contacts from source event:
    - All approved participants (name, email, organization, country)
    - Grouped by delegation
  → Creates pre-populated invitation recipient list for new event
  → Focal points receive invitations referencing their previous participation
  → Pre-fill known data: participants who registered last year
    have their profile data pre-loaded (name, passport, org)
    — they only need to update changed fields
```

#### 12.14.5 Integration Points

| System | Integration |
|--------|------------|
| Workflow Engine | Workflow templates cloned with all steps and actions |
| Visual Form Designer | Form definitions cloned with all pages, sections, fields |
| Badge Designer | Badge templates cloned for date/branding updates |
| Invitation System | Quota structure cloned; optionally recipients carried forward |
| Protocol | Protocol rankings and conflict rules cloned for next edition |
| Analytics | Cross-edition analytics enabled by EventSeries linking |
| Template Marketplace | Clone can pull from marketplace instead of previous edition |
| Accommodation | Hotel blocks optionally cloned with updated dates |

---

### 12.15 Bilateral Meeting Scheduler

At diplomatic summits, delegation leaders request private meetings with other delegations. At the AU Summit, 55 member states may generate 200+ bilateral meeting requests in a 4-day window. The protocol office must match requests, check availability of both parties, assign rooms, avoid scheduling conflicts, and produce briefing documents — all while accommodating last-minute changes and VIP priority reshuffling. Without a system, this is managed on whiteboards and spreadsheets, leading to double-bookings and missed meetings.

#### 12.15.1 Data Model

```prisma
enum BilateralStatus {
  REQUESTED
  COUNTERPART_NOTIFIED
  BOTH_CONFIRMED
  SCHEDULED
  IN_PROGRESS
  COMPLETED
  DECLINED
  CANCELLED
}

enum BilateralPriority {
  CRITICAL  // Head of State level
  HIGH      // Minister level
  MEDIUM    // Ambassador level
  LOW       // Delegate level
}

model BilateralRequest {
  id              String            @id @default(cuid())
  tenantId        String
  eventId         String
  requestingParty String
  requestedParty  String
  requestedBy     String
  status          BilateralStatus
  priority        BilateralPriority
  duration        Int               // Minutes (default 30)
  topic           String?
  notes           String?
  interpreterNeeded Boolean         @default(false)
  languages       String[]          // Required interpretation languages

  slotId          String?
  slot            BilateralSlot?    @relation(fields: [slotId], references: [id])
  roomId          String?
  room            BilateralRoom?    @relation(fields: [roomId], references: [id])
  confirmedByRequester Boolean      @default(false)
  confirmedByRequested Boolean      @default(false)

  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  @@index([eventId, status])
  @@index([eventId, requestingParty])
  @@index([eventId, requestedParty])
  @@index([eventId, priority])
}

model BilateralSlot {
  id        String   @id @default(cuid())
  eventId   String
  date      DateTime @db.Date
  startTime String   // "09:00"
  endTime   String   // "09:30"
  createdAt DateTime @default(now())

  requests  BilateralRequest[]

  @@unique([eventId, date, startTime])
  @@index([eventId, date])
}

model BilateralRoom {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  name        String   // "Bilateral Room 1", "VIP Meeting Room"
  building    String?
  floor       String?
  capacity    Int
  amenities   String[] // ["Interpretation booth", "Video conferencing", "Refreshments"]
  isAvailable Boolean  @default(true)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  requests    BilateralRequest[]

  @@unique([tenantId, eventId, name])
}
```

#### 12.15.2 Request-to-Scheduling Flow

```
Focal point opens Delegation Portal → [Request Bilateral Meeting]
  → Select counterpart: [Republic of Ethiopia ▾]
  → Priority: auto-set by participant type (Head of State = CRITICAL)
  → Duration: [30 min ▾]
  → Topic: [Climate cooperation and Nile negotiations]
  → Interpreter needed: [✓] Languages: [Amharic, English]
  → Preferred times: [Feb 11 morning ▾] [Feb 12 any ▾]
  → Submit → BilateralRequest created (status: REQUESTED)

  Protocol office workflow:
  → Request appears in bilateral dashboard
  → System notifies Ethiopia's focal point: "Kenya requests bilateral meeting"
  → Ethiopia's focal point: [Accept] / [Decline] / [Suggest Alternative]
  → If both parties confirm: status → BOTH_CONFIRMED

  → Auto-scheduling algorithm:
    1. Gather all BOTH_CONFIRMED requests
    2. For each request:
       a. Find available BilateralSlots where NEITHER party has another meeting
       b. Filter by party's preferred time windows
       c. Find available BilateralRoom of sufficient capacity
       d. If interpreter needed: check interpreter availability (§12.23)
    3. Assign slot + room → status → SCHEDULED
    4. Notify both parties: "Bilateral confirmed: Feb 11, 10:00, Room 7"

  → Conflict resolution:
    - If time conflict: prioritize by BilateralPriority
    - CRITICAL meetings scheduled first, displacing MEDIUM/LOW if needed
    - Displaced meetings re-scheduled to next available slot
    - Admin can manually override any assignment
```

#### 12.15.3 Bilateral Dashboard Wireframe (Protocol Office)

```
┌─────────────────────────────────────────────────────────────────┐
│  Bilateral Meeting Scheduler               [Auto-Schedule All] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Feb 11, 2026                                                    │
│  ┌───────┬──────────┬──────────┬──────────┬──────────┐          │
│  │ Time  │ Room 1   │ Room 2   │ Room 3   │ Room 4   │          │
│  ├───────┼──────────┼──────────┼──────────┼──────────┤          │
│  │ 09:00 │ KEN-ETH  │ NGA-ZAF  │ EGY-SDN  │ (free)   │          │
│  │       │ ★ Crit.  │ ★ Crit.  │ ● High   │          │          │
│  │ 09:30 │ KEN-ETH  │ NGA-GHA  │ (free)   │ TZA-UGA  │          │
│  │       │ (cont.)  │ ● High   │          │ ○ Med    │          │
│  │ 10:00 │ KEN-NGA  │ ETH-DJI  │ MOZ-ZAF  │ (free)   │          │
│  │       │ ● High   │ ○ Med    │ ○ Med    │          │          │
│  │ 10:30 │ (free)   │ (free)   │ (free)   │ (free)   │          │
│  │ 11:00 │ — Plenary Session (no bilaterals) —       │          │
│  └───────┴──────────┴──────────┴──────────┴──────────┘          │
│                                                                  │
│  Pending Requests (23)         Unscheduled (8)                   │
│  ┌─────────────────────┐     ┌─────────────────────┐           │
│  │ AGO ↔ MOZ  ● High  │     │ CMR ↔ TCD  ○ Med   │           │
│  │ Awaiting MOZ confirm│     │ No available slots   │           │
│  │ [Nudge]             │     │ [Force Schedule]     │           │
│  └─────────────────────┘     └─────────────────────┘           │
│                                                                  │
│  Stats: 42 scheduled | 23 pending | 8 unscheduled | 3 declined │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 12.15.4 Meeting Brief Generation

```
Admin clicks [Generate Briefs] → Select delegation
  → System produces PDF per delegation:

  ┌──────────────────────────────────────────────────────────────┐
  │ BILATERAL MEETING BRIEF — Republic of Kenya                  │
  │ 38th AU Summit, February 10-17, 2026                        │
  ├──────────────────────────────────────────────────────────────┤
  │                                                              │
  │ Meeting 1: Kenya ↔ Ethiopia                                  │
  │ Date: Feb 11 | Time: 09:00-09:30 | Room: Bilateral Room 1  │
  │ Topic: Climate cooperation and Nile negotiations             │
  │ Interpreter: Amharic-English (Interpreter: A. Tadesse)       │
  │ Counterpart: H.E. President [Name]                          │
  │ Transport: Pickup from Sheraton at 08:30                     │
  │                                                              │
  │ Meeting 2: Kenya ↔ Nigeria                                   │
  │ Date: Feb 11 | Time: 10:00-10:30 | Room: Bilateral Room 1  │
  │ Topic: Trade and security cooperation                       │
  │ Counterpart: H.E. President [Name]                          │
  │ Transport: Already at venue                                  │
  │                                                              │
  │ ... (5 total meetings)                                       │
  └──────────────────────────────────────────────────────────────┘
```

#### 12.15.5 Integration Points

| System | Integration |
|--------|------------|
| Delegation Portal | Focal points submit and track bilateral requests |
| Transport | Inter-venue meetings auto-create transport requests |
| Interpretation | Interpreter assignment based on language requirements |
| Personal Agenda | Scheduled bilaterals appear on both parties' agendas |
| Protocol | Priority determined by protocol rank of participants |
| Venue / Room Booking | Bilateral rooms drawn from venue room inventory |
| Communication Hub | Confirmation notifications sent to both parties |
| Command Center | Bilateral schedule visible in daily operations view |

---

### 12.16 Catering & Meal Management

Multi-day diplomatic events serve thousands of meals across breakfast, lunch, dinner, coffee breaks, and VIP receptions. Each meal must accommodate diverse dietary requirements driven by cultural, religious, and medical needs. Without a dedicated catering system, organizers rely on spreadsheet estimates and manual headcounts, leading to food waste on one end and shortages on the other. Integrating catering into the accreditation platform means dietary data flows directly from participant registration into kitchen production orders, and QR-based voucher scanning provides real-time consumption data that caterers can act on mid-service.

#### 12.16.1 Data Model

```prisma
enum MealType {
  BREAKFAST
  LUNCH
  DINNER
  COFFEE_BREAK
  RECEPTION
}

enum DietaryType {
  STANDARD
  VEGETARIAN
  VEGAN
  HALAL
  KOSHER
  GLUTEN_FREE
  DAIRY_FREE
  NUT_FREE
}

enum VoucherStatus {
  ISSUED
  COLLECTED
  EXPIRED
  CANCELLED
}

model MealPlan {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name        String   // "Day 1 Full Board", "Day 2 Lunch Only"
  date        DateTime @db.Date
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  services    MealService[]

  @@unique([eventId, date, name])
  @@index([eventId])
}

model MealService {
  id          String   @id @default(cuid())
  mealPlanId  String
  mealPlan    MealPlan @relation(fields: [mealPlanId], references: [id], onDelete: Cascade)
  mealType    MealType
  venue       String   // "Restaurant Level 2", "VIP Lounge", "Exhibition Hall"
  startTime   DateTime
  endTime     DateTime
  capacity    Int?     // Maximum covers for this service
  menuNotes   String?  // "3-course plated", "Buffet style"
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  vouchers    MealVoucher[]
  checkIns    MealCheckIn[]

  @@index([mealPlanId, mealType])
}

model MealVoucher {
  id              String        @id @default(cuid())
  mealServiceId   String
  mealService     MealService   @relation(fields: [mealServiceId], references: [id], onDelete: Cascade)
  participantId   String
  participant     Participant   @relation(fields: [participantId], references: [id], onDelete: Cascade)
  dietaryType     DietaryType   @default(STANDARD)
  qrCode          String        @unique // Encrypted: voucherId + participantId + mealServiceId
  status          VoucherStatus @default(ISSUED)
  issuedAt        DateTime      @default(now())
  collectedAt     DateTime?
  collectedBy     String?       // Staff member who scanned
  cancelledReason String?

  @@unique([mealServiceId, participantId])
  @@index([participantId, status])
  @@index([qrCode])
}

model MealCheckIn {
  id              String      @id @default(cuid())
  mealServiceId   String
  mealService     MealService @relation(fields: [mealServiceId], references: [id], onDelete: Cascade)
  participantId   String
  participant     Participant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  dietaryType     DietaryType
  scannedAt       DateTime    @default(now())
  scannedBy       String      // userId of the scanning staff
  stationId       String?     // Which scanning station/entrance

  @@unique([mealServiceId, participantId])
  @@index([mealServiceId, scannedAt])
}
```

#### 12.16.2 Dietary Aggregation Algorithm

Dietary requirements are captured during registration as a custom field on the participant form (e.g., `dietary_preference` with options matching the `DietaryType` enum). The aggregation pipeline runs on demand or on a schedule:

```
For each MealService in the event:
  1. Query all participants eligible for this meal
     (based on participantType, accreditation status = APPROVED, and event day)
  2. For each participant, read customData.dietary_preference
     -> If missing or unrecognized, default to STANDARD
  3. Group by DietaryType -> produce counts
  4. Apply buffer multiplier (configurable, default 1.10 for 10% overage)
  5. Store as cached aggregation for vendor portal display

Output example:
  Lunch - Day 2 (Feb 11) - Restaurant Level 2
  +----------------+-------+------------+
  | Dietary Type   | Count | With Buffer|
  +----------------+-------+------------+
  | STANDARD       |   340 |        374 |
  | VEGETARIAN     |    45 |         50 |
  | HALAL          |    22 |         25 |
  | VEGAN          |    18 |         20 |
  | KOSHER         |     8 |          9 |
  | GLUTEN_FREE    |    12 |         14 |
  | DAIRY_FREE     |     6 |          7 |
  | NUT_FREE       |     4 |          5 |
  +----------------+-------+------------+
  | TOTAL          |   455 |        504 |
  +----------------+-------+------------+
```

When a new participant is approved or an existing participant updates their dietary preference, the cached aggregation is invalidated and recalculated on next view.

#### 12.16.3 QR Voucher Scanning Flow

```
Staff opens Meal Check-In scanner (mobile or tablet)
  -> Selects current MealService from today's list (auto-detected by time)
  -> Camera activates

Participant presents badge QR or printed meal voucher
  -> Staff scans QR code
  -> System decodes -> looks up MealVoucher by qrCode
  -> Validates:
     - Voucher exists and belongs to this MealService
     - VoucherStatus = ISSUED (not already COLLECTED)
     - Current time is within MealService startTime/endTime window
  -> If valid:
     -> MealVoucher.status = COLLECTED, collectedAt = now()
     -> Create MealCheckIn record
     -> Display: PASS "John Doe - Halal meal" (green confirmation)
  -> If already collected:
     -> Display: FAIL "Already collected at 12:34" (red warning)
     -> No record created
  -> If wrong meal service:
     -> Display: FAIL "This voucher is for Dinner, not Lunch" (amber warning)
  -> If expired (outside service window):
     -> Display: FAIL "Service ended at 14:00" (amber warning)
```

#### 12.16.4 Meal Plan Builder

```
+--------------------------------------------------------------+
|  Meal Plan Builder - 38th AU Summit                          |
+--------------------------------------------------------------+
|                                                               |
|  Date: [Feb 10, 2026 v]      [+ Add Meal Service]           |
|                                                               |
|  +- BREAKFAST ------------------------------------------+    |
|  |  07:00 - 09:00  |  Restaurant Level 2  |  Cap: 500   |    |
|  |  Participant types: [All]               [Edit] [Del]  |    |
|  +------------------------------------------------------+    |
|                                                               |
|  +- COFFEE BREAK ---------------------------------------+    |
|  |  10:30 - 11:00  |  Exhibition Hall     |  Cap: 800   |    |
|  |  Participant types: [All]               [Edit] [Del]  |    |
|  +------------------------------------------------------+    |
|                                                               |
|  +- LUNCH ----------------------------------------------+    |
|  |  12:30 - 14:00  |  Restaurant Level 2  |  Cap: 500   |    |
|  |  Participant types: [Delegate, Observer, Staff]        |    |
|  |  Dietary breakdown: 340 std / 45 veg / 22 hal / ...   |    |
|  |                                         [Edit] [Del]  |    |
|  +------------------------------------------------------+    |
|                                                               |
|  +- LUNCH (VIP) ----------------------------------------+    |
|  |  12:30 - 14:00  |  VIP Dining Room     |  Cap: 60    |    |
|  |  Participant types: [Head of State, Minister]          |    |
|  |  Menu: 3-course plated service                        |    |
|  |                                         [Edit] [Del]  |    |
|  +------------------------------------------------------+    |
|                                                               |
|  +- RECEPTION ------------------------------------------+    |
|  |  19:00 - 22:00  |  Grand Ballroom      |  Cap: 400   |    |
|  |  Participant types: [Invited guests only]              |    |
|  |  Guest list: 312 / 400          [Manage Guest List]   |    |
|  |                                         [Edit] [Del]  |    |
|  +------------------------------------------------------+    |
|                                                               |
|  [Copy plan to another date]    [Generate all vouchers]      |
+--------------------------------------------------------------+
```

#### 12.16.5 VIP Dining & Guest List Management

Receptions and gala dinners use a curated guest list rather than participant-type rules. The guest list is managed separately: admin selects individual participants and assigns them table/seat numbers. The system generates personalized invitation vouchers with the table assignment printed on them.

VIP dining integrates with the Seating Management system (Section 12.15) for table layout and with the Communication Hub for sending formal dinner invitations.

#### 12.16.6 Catering Vendor Dashboard

A read-only portal accessible via a unique time-limited URL (no login required, link expires after event). Vendors see only what they need:

```
+--------------------------------------------------------------+
|  Catering Dashboard - Pinnacle Catering Co.                  |
|  38th AU Summit  |  Data refreshes every 5 minutes           |
+--------------------------------------------------------------+
|                                                               |
|  TODAY: Feb 10, 2026                                         |
|                                                               |
|  LUNCH (12:30 - 14:00) - Restaurant Level 2                 |
|  +------------------------------------------------------+    |
|  |  Total covers: 504 (with 10% buffer)                  |    |
|  |  Standard: 374 | Vegetarian: 50 | Halal: 25           |    |
|  |  Vegan: 20 | Kosher: 9 | GF: 14 | DF: 7 | NF: 5     |    |
|  +------------------------------------------------------+    |
|                                                               |
|  LIVE COLLECTION (updates in real-time):                     |
|  Collected: 287 / 455 expected  (63%)  =======---            |
|  Collection rate: ~12 per minute                              |
|  Estimated completion: 13:45                                  |
|                                                               |
|  UPCOMING:                                                    |
|  Coffee Break (15:30) - 800 covers                           |
|  Dinner Reception (19:00) - 312 covers                       |
|                                                               |
+--------------------------------------------------------------+
```

#### 12.16.7 Integration with Other Systems

| System | Integration |
|--------|------------|
| **Participant registration** | Dietary preference captured as custom field flows into voucher generation |
| **Badge QR** | Same QR code on badge can serve as meal voucher (no separate print needed) |
| **Check-In / Access Control** | Meal scanning stations use same scanner infrastructure |
| **Seating Management** | VIP dinner guest list references seat assignments |
| **Communication Hub** | Meal reminders, VIP dinner invitations, dietary confirmation requests |
| **Command Center** | Live collection rate widget, catering alert feed |
| **Staff Management** | Catering staff shifts aligned with meal service windows |

---

### 12.17 Live Event Command Center

During a multi-day diplomatic summit, dozens of systems generate data simultaneously: participants arriving at gates, incidents being reported, vehicles dispatching, rooms filling to capacity, VIPs requiring protocol coordination. Without a unified operational view, event managers toggle between tabs and radio channels, reacting to crises minutes too late. The command center consolidates every data stream into a single multi-panel display designed for a wall-mounted screen in the operations room, enabling real-time situational awareness and one-click emergency responses.

#### 12.17.1 Data Model

```prisma
enum WidgetType {
  REGISTRATION_PIPELINE
  INCIDENT_FEED
  VENUE_OCCUPANCY
  TRANSPORT_STATUS
  WEATHER_CLOCK
  UPCOMING_SESSIONS
  STAFF_AVAILABILITY
  CATERING_TRACKER
  GATE_THROUGHPUT
  VIP_ARRIVALS
  CUSTOM_METRIC
}

enum AlertPriority {
  CRITICAL    // Immediate action required (security breach, medical emergency)
  HIGH        // Urgent attention (VIP arrival, SLA breach, capacity exceeded)
  MEDIUM      // Notable event (incident reported, staff no-show)
  LOW         // Informational (session starting, milestone reached)
}

enum AlertStatus {
  ACTIVE
  ACKNOWLEDGED
  RESOLVED
  EXPIRED
}

enum QuickActionType {
  EMERGENCY_BROADCAST
  GATE_CLOSE_ALL
  GATE_OPEN_ALL
  EVENT_PAUSE
  EVENT_RESUME
  LOCKDOWN
  EVACUATION_ALERT
}

model CommandCenterLayout {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name        String   // "Main Ops Screen", "VIP Protocol View", "Transport Desk"
  isDefault   Boolean  @default(false)
  gridCols    Int      @default(12)
  gridRows    Int      @default(8)
  autoRotate  Boolean  @default(false)
  rotateInterval Int   @default(30) // seconds between view rotation
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  widgets     CommandCenterWidget[]

  @@index([eventId])
}

model CommandCenterWidget {
  id          String   @id @default(cuid())
  layoutId    String
  layout      CommandCenterLayout @relation(fields: [layoutId], references: [id], onDelete: Cascade)
  widgetType  WidgetType
  title       String
  config      Json     @default("{}") // Widget-specific: filters, thresholds, colors
  gridX       Int      // Column position (0-based)
  gridY       Int      // Row position (0-based)
  gridW       Int      // Width in grid units
  gridH       Int      // Height in grid units
  refreshRate Int      @default(5) // Seconds between data refresh (SSE reconnect)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([layoutId])
}

model AlertFeed {
  id          String        @id @default(cuid())
  tenantId    String
  eventId     String
  priority    AlertPriority
  status      AlertStatus   @default(ACTIVE)
  source      String        // "access_control", "incident", "workflow", "transport", "catering"
  title       String
  message     String
  metadata    Json?         // Source-specific data: {"gateId": "...", "participantId": "..."}
  acknowledgedBy String?    // userId who acknowledged
  acknowledgedAt DateTime?
  resolvedAt  DateTime?
  expiresAt   DateTime?     // Auto-expire low-priority alerts
  createdAt   DateTime      @default(now())

  @@index([eventId, priority, status])
  @@index([eventId, createdAt])
  @@index([source, status])
}

model QuickAction {
  id          String          @id @default(cuid())
  tenantId    String
  eventId     String
  actionType  QuickActionType
  executedBy  String          // userId
  confirmedBy String?         // Second user for dual-confirmation actions
  parameters  Json?           // {"message": "...", "gateIds": [...]}
  executedAt  DateTime        @default(now())
  reversedAt  DateTime?       // If action was reversed

  @@index([eventId, executedAt])
}

model EventStateChange {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  source      String   // System that produced the change
  entityType  String   // "participant", "incident", "vehicle", "gate", etc.
  entityId    String
  changeType  String   // "created", "updated", "deleted"
  beforeState Json?
  afterState  Json
  timestamp   DateTime @default(now())

  @@index([eventId, timestamp])
  @@index([eventId, entityType, timestamp])
}
```

#### 12.17.2 Command Center Layout

```
+--------------------------------------------------------------------------+
|  COMMAND CENTER - 38th AU Summit    Feb 10, 2026  11:42:15    29C        |
+---------------------------------+----------------------------------------+
|  REGISTRATION PIPELINE          |  VENUE OCCUPANCY                       |
|                                 |                                        |
|  Pending    ===------  142      |  Plenary Hall     ========--  82%      |
|  Approved   ========-  1,847    |  Conf Room A      ======----  58%      |
|  Printed    =======--  1,623    |  Conf Room B      =========- 91% [!]  |
|  Collected  ======---  1,341    |  Press Center     ===-------  32%      |
|                                 |  VIP Lounge       ======----  64%      |
|  Today: +87 collected           |  Exhibition Hall  =====-----  48%      |
|  Avg processing: 3.2 min       |                                        |
+---------------------------------+----------------------------------------+
|  ALERT FEED                     |  TRANSPORT                             |
|                                 |                                        |
|  [CRITICAL] 11:40               |  Vehicles active: 12 / 18             |
|    Medical incident - Hall B    |  En route pickups: 4                   |
|    [Acknowledge]                |  Completed today: 23                   |
|                                 |                                        |
|  [HIGH] 11:38                   |  Next VIP pickup: 12:00               |
|    VIP arrival: H.E. President  |    H.E. Minister of Foreign Affairs   |
|    Gate 1 - Protocol dispatched |    Sheraton -> AUCC  |  Car 7         |
|                                 |                                        |
|  [MEDIUM] 11:35                 |  Delayed: Car 3 (+12 min)             |
|    Conf Room B at 91% capacity  |                                        |
|                                 |                                        |
|  [LOW] 11:32                    +----------------------------------------+
|    Session starting: Committee  |  QUICK ACTIONS                         |
|    on Political Affairs         |                                        |
|                                 |  [Emergency Broadcast]  [Close Gates]  |
|  [View all 24 alerts]           |  [Pause Event]   [Evacuation Alert]   |
+---------------------------------+----------------------------------------+
|  UPCOMING: 12:00 Lunch (Restaurant L2, 455 expected) | 14:00 Plenary    |
+--------------------------------------------------------------------------+
```

#### 12.17.3 Widget Architecture

Each widget is an independent React component that subscribes to a Server-Sent Events (SSE) stream scoped to its data domain. The server maintains one SSE connection per client, multiplexing widget data into typed events:

```
Client connects: GET /api/events/:eventId/command-center/stream
  -> Server opens SSE connection
  -> For each widget in the client's layout:
     -> Subscribe to relevant data channel
     -> Push initial state snapshot

Data flow for VENUE_OCCUPANCY widget:
  AccessLog created (participant scans into room)
    -> Prisma middleware emits event to in-memory pub/sub
    -> SSE handler picks up event
    -> Recalculates room occupancy from AccessLog IN/OUT counts
    -> Pushes to client: { type: "venue_occupancy", data: { roomId, count, capacity, pct } }
    -> Widget re-renders with new bar chart

Data flow for ALERT_FEED widget:
  Any system creates an AlertFeed record (incident reported, SLA breached, capacity threshold)
    -> Prisma middleware emits "alert:created"
    -> SSE handler pushes: { type: "alert", data: { ...alert } }
    -> Widget prepends to alert list, plays audio chime for CRITICAL/HIGH
```

Widget refresh rates are configurable per widget. High-priority widgets (alerts, gate throughput) use 2-second intervals. Lower-priority widgets (weather, upcoming sessions) use 30-second intervals.

#### 12.17.4 Alert Priority System and Routing

Alerts are generated automatically by other subsystems and routed based on priority:

| Priority | Trigger Examples | Routing |
|----------|-----------------|---------|
| CRITICAL | Medical emergency, security breach, fire alarm | Audio alarm + screen flash + SMS to all coordinators |
| HIGH | VIP arrival, SLA breach (>30 min in queue), room over capacity | Audio chime + command center highlight + notify zone lead |
| MEDIUM | Incident reported, staff no-show, transport delay >10 min | Command center feed + notify relevant team |
| LOW | Session starting, registration milestone, weather update | Command center feed only, auto-expires after 30 min |

CRITICAL alerts require explicit acknowledgement before they leave the screen. Unacknowledged CRITICAL alerts escalate after 5 minutes: the system sends SMS to the event director.

#### 12.17.5 Quick Action Confirmation Flow

Emergency actions require a two-step confirmation to prevent accidental execution:

```
Operator clicks [Emergency Broadcast]
  -> Modal appears: "Send emergency broadcast to ALL participants?"
  -> Operator types broadcast message
  -> Operator clicks [Confirm - Send Now]
  -> For CRITICAL actions (LOCKDOWN, EVACUATION_ALERT):
     -> System requires a SECOND operator to confirm (dual authorization)
     -> Second operator enters their credentials and clicks [Authorize]
  -> QuickAction record created
  -> Action executes:
     EMERGENCY_BROADCAST -> Communication Hub sends push/SMS to all participants
     GATE_CLOSE_ALL -> All AccessPoint records set to status=LOCKED
     EVACUATION_ALERT -> Broadcast + close non-exit gates + activate exit signage
  -> All actions are reversible: [Reverse] button appears after execution
```

#### 12.17.6 Auto-Rotate Mode

When a single large screen serves the operations room, auto-rotate cycles through multiple layouts:

```
Layout rotation sequence (configurable):
  1. "Main Overview" (30 seconds) -> full dashboard as shown above
  2. "Transport Focus" (20 seconds) -> large transport map + vehicle list
  3. "VIP Protocol" (20 seconds) -> VIP arrival timeline + protocol assignments
  4. "Catering Status" (15 seconds) -> meal collection progress + dietary counts
  -> Loop back to 1

Manual override: any click pauses rotation for 5 minutes, then resumes.
Rotation pauses automatically on CRITICAL alerts until acknowledged.
```

#### 12.17.7 Historical Replay

After the event, the command center can replay operations for post-event review and training. This relies on the `EventStateChange` model which captures every state change using event sourcing:

```
Replay mode:
  Admin opens Command Center -> selects "Historical Replay"
  -> Chooses date range and playback speed (1x, 2x, 5x, 10x, 60x)
  -> System queries EventStateChange records ordered by timestamp
  -> Replays state changes into the widget data streams
  -> Dashboard animates through the event timeline
  -> Pause at any point to inspect state
  -> Useful for: incident post-mortems, training new ops staff, process improvement
```

#### 12.17.8 Integration with Other Systems

| System | Feed into Command Center |
|--------|------------------------|
| **Registration / Workflow** | Pipeline counts, SLA breach alerts, approval velocity |
| **Check-In / Access Control** | Gate throughput, venue occupancy, denied entry alerts |
| **Incident Management** | Active incidents by severity, resolution times |
| **Transport** | Vehicle positions, delay alerts, VIP pickup schedule |
| **Catering** | Meal collection progress, dietary shortage alerts |
| **Meeting / Room Booking** | Upcoming sessions, room capacity warnings |
| **Staff Management** | On-duty count by zone, no-show alerts, coverage gaps |
| **Communication Hub** | Broadcast status, delivery failures |
| **Badge Printing** | Print queue depth, printer status, collection rate |
| **Waitlist** | Promotion activity, demand-to-capacity alerts |

---

### 12.18 Post-Event Surveys & Feedback

Event improvement is impossible without structured feedback from the people who experienced it. Post-event surveys close the loop between what organizers planned and what participants actually experienced. By integrating surveys into the accreditation platform rather than using a third-party tool, the system can auto-target surveys to participants who actually attended (verified by access control data), correlate satisfaction scores with specific sessions they attended, and compare results across event editions within the same tenant.

#### 12.18.1 Data Model

```prisma
enum QuestionType {
  RATING           // 1-5 stars
  TEXT             // Free-text response
  MULTIPLE_CHOICE  // Select one from options
  MULTI_SELECT     // Select multiple from options
  SCALE            // Numeric scale (e.g., 1-10)
  NET_PROMOTER     // 0-10 NPS question
  YES_NO           // Boolean
}

enum SurveyStatus {
  DRAFT
  ACTIVE
  CLOSED
  ARCHIVED
}

model Survey {
  id              String       @id @default(cuid())
  tenantId        String
  tenant          Tenant       @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId         String
  event           Event        @relation(fields: [eventId], references: [id], onDelete: Cascade)
  title           String       // "38th AU Summit - Participant Feedback"
  description     String?
  status          SurveyStatus @default(DRAFT)
  sendAfterHours  Int          @default(24) // Hours after event ends to auto-send
  reminderDays    Int[]        @default([3, 7]) // Days after send to remind non-respondents
  closesAfterDays Int          @default(14) // Auto-close survey after this many days
  targetFilter    Json?        // {"participantTypes": [...], "minAttendance": 0.5}
  thankYouMessage String?      // Shown after submission
  createdAt       DateTime     @default(now())
  updatedAt       DateTime     @updatedAt

  questions       SurveyQuestion[]
  responses       SurveyResponse[]

  @@index([eventId, status])
}

model SurveyQuestion {
  id           String       @id @default(cuid())
  surveyId     String
  survey       Survey       @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  questionType QuestionType
  text         String       // "How would you rate the registration process?"
  description  String?      // Helper text shown below the question
  options      Json?        // For MULTIPLE_CHOICE/MULTI_SELECT: ["Excellent", "Good", "Fair", "Poor"]
  scaleMin     Int?         // For SCALE/NET_PROMOTER
  scaleMax     Int?
  scaleMinLabel String?     // "Not at all likely"
  scaleMaxLabel String?     // "Extremely likely"
  isRequired   Boolean      @default(false)
  sortOrder    Int
  section      String?      // Group questions: "Registration", "Sessions", "Logistics"
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  answers      SurveyAnswer[]

  @@index([surveyId, sortOrder])
}

model SurveyResponse {
  id              String      @id @default(cuid())
  surveyId        String
  survey          Survey      @relation(fields: [surveyId], references: [id], onDelete: Cascade)
  participantId   String?     // Null if anonymous
  participant     Participant? @relation(fields: [participantId], references: [id], onDelete: SetNull)
  accessToken     String      @unique // Unique token in survey URL for this recipient
  status          String      @default("PENDING") // PENDING, STARTED, COMPLETED
  startedAt       DateTime?
  completedAt     DateTime?
  remindersSent   Int         @default(0)
  lastReminderAt  DateTime?
  ipAddress       String?
  userAgent       String?
  createdAt       DateTime    @default(now())

  answers         SurveyAnswer[]

  @@unique([surveyId, participantId])
  @@index([surveyId, status])
  @@index([accessToken])
}

model SurveyAnswer {
  id           String         @id @default(cuid())
  responseId   String
  response     SurveyResponse @relation(fields: [responseId], references: [id], onDelete: Cascade)
  questionId   String
  question     SurveyQuestion @relation(fields: [questionId], references: [id], onDelete: Cascade)
  numericValue Int?           // For RATING, SCALE, NET_PROMOTER
  textValue    String?        // For TEXT, MULTIPLE_CHOICE (selected option text)
  arrayValue   Json?          // For MULTI_SELECT: ["Option A", "Option C"]
  createdAt    DateTime       @default(now())

  @@unique([responseId, questionId])
  @@index([questionId])
}
```

#### 12.18.2 Auto-Distribution Flow

```
Event ends (event.endDate passes)
  -> Scheduled job fires after Survey.sendAfterHours (default 24h)
  -> Query eligible participants:
     - Status = APPROVED and has at least one AccessLog (actually attended)
     - Apply targetFilter if set (e.g., only Delegates, or minAttendance >= 50%)
  -> For each eligible participant:
     -> Create SurveyResponse with unique accessToken
     -> Generate survey URL: /surveys/{surveyId}?token={accessToken}
     -> Queue email via Communication Hub:
       Subject: "Your feedback on the 38th AU Summit"
       Body: personalized with participant name, event name, survey link
  -> Track: totalSent count stored in survey metadata

Reminder cycle:
  -> At Survey.reminderDays[0] (day 3): query SurveyResponse where status != COMPLETED
     -> Send reminder email (different subject line: "We'd love your feedback")
     -> Increment remindersSent
  -> At Survey.reminderDays[1] (day 7): final reminder
     -> "Last chance: survey closes in 7 days"

Auto-close:
  -> At Survey.closesAfterDays (day 14): set Survey.status = CLOSED
  -> No more responses accepted
  -> Generate final results snapshot
```

#### 12.18.3 Survey Results Dashboard

```
+----------------------------------------------------------------------+
|  Survey Results - 38th AU Summit Participant Feedback                |
|  Status: CLOSED  |  Sent: 1,341  |  Completed: 847 (63.2%)         |
+----------------------------------------------------------------------+
|                                                                       |
|  NET PROMOTER SCORE                                                   |
|  +--------------------------------------------------+                |
|  |          Detractors    Passives    Promoters      |                |
|  |            12%          28%          60%           |                |
|  |  NPS: +48  ==================================     |                |
|  |            ===--------=========================   |                |
|  +--------------------------------------------------+                |
|                                                                       |
|  SATISFACTION BY CATEGORY              RESPONSE RATE BY TYPE          |
|  Registration process  [4.2/5]         Delegates      71%            |
|  Badge collection      [3.4/5]         Observers      58%            |
|  Session quality       [4.5/5]         Media          44%            |
|  Venue & facilities    [4.1/5]         Staff          82%            |
|  Catering              [3.6/5]                                        |
|  Transport             [3.9/5]         Avg completion: 8 min         |
|                                                                       |
|  FREE-TEXT THEMES (auto-extracted)                                    |
|  +--------------------------------------------------+                |
|  |    registration    long wait    excellent          |                |
|  |   badge    WiFi   helpful staff   parking          |                |
|  |  food quality   air conditioning   translation     |                |
|  |     signage   shuttle schedule   VIP lounge        |                |
|  +--------------------------------------------------+                |
|                                                                       |
|  RECURRING ISSUES (mentioned in >15% of responses)                   |
|  [!] "Long wait at badge collection" - 24% of responses             |
|  [!] "WiFi connectivity issues" - 19% of responses                  |
|  [!] "Shuttle schedule unclear" - 16% of responses                  |
|                                                                       |
|  [Export CSV]  [Export PDF Report]  [Compare with previous event]    |
+----------------------------------------------------------------------+
```

#### 12.18.4 Sentiment Analysis Pipeline

Free-text responses are processed through a lightweight analysis pipeline:

```
SurveyAnswer with textValue submitted
  -> Queue for batch processing (runs every 15 minutes or on-demand)
  -> For each text answer:
     1. Language detection (multi-lingual events: EN, FR, AR, PT)
     2. Keyword extraction -> normalized tags ("badge collection", "wifi", "food")
     3. Sentiment classification -> POSITIVE / NEUTRAL / NEGATIVE
     4. Store results in SurveyAnswer metadata: { sentiment, keywords, language }
  -> Aggregate across all responses:
     -> Word frequency map (for word cloud visualization)
     -> Sentiment distribution per question
     -> Recurring theme detection: keywords appearing in >15% of responses flagged as "issues"
```

The pipeline uses server-side keyword matching and rule-based sentiment for the initial release. A future enhancement could integrate an LLM API for deeper analysis, but the rule-based approach handles the 80% case for structured feedback.

#### 12.18.5 Year-over-Year Comparison

Since surveys live within the tenant, the system can compare results across events:

```
Comparison view: 37th AU Summit vs 38th AU Summit

Category               37th (2025)    38th (2026)    Change
Registration process      3.8            4.2          +0.4 (up)
Badge collection          2.9            3.4          +0.5 (up)
Session quality           4.3            4.5          +0.2 (up)
Catering                  3.8            3.6          -0.2 (down)
Transport                 3.2            3.9          +0.7 (up)

NPS                       +31            +48          +17  (up)
Response rate             54%            63%          +9%  (up)
```

This requires mapping questions across surveys. The system matches by question text similarity and section name, with manual override for renamed questions.

#### 12.18.6 Integration with Other Systems

| System | Integration |
|--------|------------|
| **Visual Form Designer** | Survey builder reuses the same drag-and-drop form designer (Section 5) with survey-specific question types |
| **Communication Hub** | Survey distribution, reminders, and thank-you messages sent via email/SMS |
| **Check-In / Access Control** | Attendance data used to filter survey recipients (only actual attendees) |
| **Participant data** | Response segmentation by participant type, country, delegation size |
| **Analytics / Reporting** | Survey results feed into the event analytics dashboard |
| **Command Center** | Live response rate widget during active survey period |

---

### 12.19 Certificate & Document Generation

Training events, workshops, and conferences routinely issue participation certificates to attendees. For high-profile summits, certificates of attendance serve as official records. The certificate system shares DNA with the badge designer -- same canvas rendering engine, same dynamic field insertion, same template-per-type logic -- but operates at document page sizes (A4, Letter) and adds a verification layer. Each certificate carries a unique code and QR that anyone can use to confirm its authenticity, preventing forgery of participation credentials.

#### 12.19.1 Data Model

```prisma
enum CertificateStatus {
  PENDING       // Eligible but not yet generated
  GENERATED     // PDF created, ready for distribution
  SENT          // Email sent to participant
  DOWNLOADED    // Participant has downloaded at least once
  REVOKED       // Manually revoked (e.g., participant later disqualified)
}

enum IssuanceRule {
  ALL_APPROVED           // Anyone with APPROVED status
  ATTENDANCE_THRESHOLD   // Must meet minimum attendance percentage
  COMPLETED_SESSIONS     // Must attend specific required sessions
  MANUAL                 // Admin manually triggers generation
}

model CertificateTemplate {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId         String
  event           Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name            String   // "Speaker Certificate", "Participation Certificate"
  participantType String?  // Scope to specific type, null = all types
  pageSize        String   @default("A4") // A4, LETTER, A4_LANDSCAPE, LETTER_LANDSCAPE
  canvasData      Json     // Same structure as badge designer canvas (elements, positions, styles)
  issuanceRule    IssuanceRule @default(ALL_APPROVED)
  attendanceThreshold Float? // 0.0-1.0, used when rule = ATTENDANCE_THRESHOLD
  requiredMeetings Json?   // Array of meetingIds, used when rule = COMPLETED_SESSIONS
  signatoryName   String?  // "Dr. Moussa Faki Mahamat"
  signatoryTitle  String?  // "Chairperson, African Union Commission"
  signatureImage  String?  // Azure Blob URL for signature graphic
  isActive        Boolean  @default(true)
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  certificates    Certificate[]

  @@index([eventId, participantType])
}

model Certificate {
  id              String            @id @default(cuid())
  templateId      String
  template        CertificateTemplate @relation(fields: [templateId], references: [id], onDelete: Cascade)
  participantId   String
  participant     Participant       @relation(fields: [participantId], references: [id], onDelete: Cascade)
  certificateNumber String          @unique // "CERT-2026-AU38-00142"
  verificationCode  String          @unique // Short code: "V3X9-K2M7-P8R1"
  verificationUrl   String          // "https://platform.example.com/verify/V3X9-K2M7-P8R1"
  qrPayload       String            // Encoded verification URL
  pdfUrl          String?           // Azure Blob URL for generated PDF
  status          CertificateStatus @default(PENDING)
  attendanceRate  Float?            // Calculated at generation time
  generatedAt     DateTime?
  sentAt          DateTime?
  firstDownloadAt DateTime?
  downloadCount   Int               @default(0)
  revokedAt       DateTime?
  revokedReason   String?
  createdAt       DateTime          @default(now())
  updatedAt       DateTime          @updatedAt

  verifications   CertificateVerification[]

  @@unique([templateId, participantId])
  @@index([participantId])
  @@index([verificationCode])
  @@index([status])
}

model CertificateVerification {
  id              String      @id @default(cuid())
  certificateId   String
  certificate     Certificate @relation(fields: [certificateId], references: [id], onDelete: Cascade)
  verifiedAt      DateTime    @default(now())
  verifierIp      String?
  verifierAgent   String?     // User-agent string
  verifierNote    String?     // Optional: who verified and why

  @@index([certificateId, verifiedAt])
}
```

#### 12.19.2 Certificate Designer

The certificate designer reuses the badge designer canvas (Section 12.2) with modifications for document-scale output:

- **Page sizes**: A4 (210x297mm), Letter (8.5x11in), and landscape variants
- **Resolution**: 300 DPI for print quality (badge designer uses 150 DPI)
- **Additional elements**: signature block, certificate number field, verification QR, decorative borders
- **Dynamic fields**: same merge-field syntax as badges -- `{{participant.name}}`, `{{event.name}}`, `{{certificate.number}}`, `{{certificate.verificationCode}}`, `{{participant.attendanceRate}}`

The rendering engine produces PDF output using the same server-side canvas renderer, scaled to document dimensions. Templates include a preview mode that renders with sample data.

#### 12.19.3 Conditional Issuance Flow

```
Event ends (or admin triggers "Generate Certificates")
  -> For each active CertificateTemplate:
     -> Query eligible participants based on issuanceRule:

        ALL_APPROVED:
          SELECT participants WHERE status = 'APPROVED' AND eventId = :eventId
          AND participantType matches template (if scoped)

        ATTENDANCE_THRESHOLD:
          For each participant:
            totalSessions = COUNT(meetings for this event that participant was eligible for)
            attendedSessions = COUNT(DISTINCT meetingId FROM AccessLog
                               WHERE participantId = :id AND direction = 'IN')
            attendanceRate = attendedSessions / totalSessions
            -> Include if attendanceRate >= template.attendanceThreshold

        COMPLETED_SESSIONS:
          For each participant:
            requiredIds = template.requiredMeetings
            attended = AccessLog WHERE participantId = :id AND meetingId IN requiredIds
            -> Include if all required meetings have at least one IN record

     -> For each eligible participant:
        -> Generate certificateNumber: "CERT-{year}-{eventCode}-{sequence}"
        -> Generate verificationCode: random alphanumeric, formatted as "XXXX-XXXX-XXXX"
        -> Create Certificate record (status: PENDING)

  -> Bulk generation pipeline begins (next section)
```

#### 12.19.4 Bulk Generation Pipeline

Certificate generation for thousands of participants runs as a background job with progress tracking:

```
Admin clicks [Generate All Pending Certificates]
  -> Background job starts
  -> Query all Certificate records WHERE status = PENDING AND templateId = :id
  -> Total: 847 certificates to generate

  -> For each certificate (parallelized, 10 concurrent):
     1. Load CertificateTemplate.canvasData
     2. Resolve dynamic fields from Participant record
     3. Render PDF using server-side canvas (same engine as badge printer)
     4. Upload PDF to Azure Blob Storage
     5. Generate QR code encoding verificationUrl
     6. Update Certificate: status = GENERATED, pdfUrl = blobUrl, generatedAt = now()

  -> Progress broadcast via SSE:
     { type: "cert_generation", completed: 423, total: 847, errors: 2 }

  -> On completion:
     -> Summary: 845 generated, 2 failed (missing participant photo)
     -> Failed certificates listed for admin review
     -> [Send All] button enabled to email certificates to participants
```

#### 12.19.5 Digital Verification Flow

Each certificate carries a unique verification code and QR. When a recipient shares their certificate (PDF or printed copy), any third party can verify its authenticity:

```
Verifier receives certificate (PDF, printed, or screenshot)
  -> Scans QR code or visits verification URL:
     https://platform.example.com/verify/V3X9-K2M7-P8R1

  -> Public verification page (no login required):
     +----------------------------------------------+
     |  [VERIFIED] Certificate Verified              |
     |                                               |
     |  Certificate: CERT-2026-AU38-00142            |
     |  Issued to: John Doe                          |
     |  Event: 38th Ordinary Session of the Assembly |
     |  Date: February 10-11, 2026                   |
     |  Participant type: Delegate                   |
     |  Attendance rate: 87%                          |
     |  Issued on: February 12, 2026                 |
     |                                               |
     |  This certificate was issued by the African   |
     |  Union Commission accreditation system.        |
     |                                               |
     |  Verified at: Feb 15, 2026 09:42 UTC          |
     +----------------------------------------------+

  -> CertificateVerification record created (audit trail)
  -> If certificate was REVOKED:
     -> Page shows: [REVOKED] "This certificate has been revoked"
     -> Revocation reason displayed
```

#### 12.19.6 Integration with Other Systems

| System | Integration |
|--------|------------|
| **Badge Designer** | Shares the same canvas rendering engine, element library, and dynamic field system |
| **Check-In / Access Control** | AccessLog data used to calculate attendance rates for conditional issuance |
| **Communication Hub** | Certificate delivery emails, download link notifications |
| **Meeting / Room Booking** | Meeting list used for COMPLETED_SESSIONS issuance rule |
| **Participant data** | All dynamic fields resolve from participant record |
| **Analytics** | Certificate download rates, verification activity metrics |
| **Post-Event Surveys** | Certificate email can include survey link |

---

### 12.20 Waitlist Management

When registration quotas fill up -- a common scenario for high-demand events like AU summits where delegation sizes are capped -- the system should not simply reject latecomers. A waitlist captures overflow demand, maintains fair ordering, and automatically promotes candidates when slots open up through cancellations or rejections. This turns a dead-end into a managed queue that keeps participants engaged and gives organizers real-time visibility into excess demand, which can inform decisions like increasing quotas or opening additional sessions.

#### 12.20.1 Data Model

```prisma
enum WaitlistStatus {
  ACTIVE      // In the queue, waiting for a slot
  PROMOTED    // Promoted to active registration, entered workflow
  EXPIRED     // Offer expired (participant didn't confirm in time)
  WITHDRAWN   // Participant voluntarily left the waitlist
  CANCELLED   // Admin cancelled the entry
}

enum WaitlistPriority {
  STANDARD
  HIGH        // Priority delegation, returning participant
  VIP         // Head of State, Minister-level
}

model WaitlistEntry {
  id                String          @id @default(cuid())
  tenantId          String
  tenant            Tenant          @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId           String
  event             Event           @relation(fields: [eventId], references: [id], onDelete: Cascade)
  participantId     String
  participant       Participant     @relation(fields: [participantId], references: [id], onDelete: Cascade)
  participantType   String          // Waitlist is per participant type
  invitationId      String?         // The invitation this registration was under
  priority          WaitlistPriority @default(STANDARD)
  position          Int             // Queue position within priority tier
  status            WaitlistStatus  @default(ACTIVE)
  registrationData  Json            // Snapshot of the registration form data at time of waitlisting
  promotedAt        DateTime?
  promotionDeadline DateTime?       // Must confirm by this time or slot goes to next person
  expiredAt         DateTime?
  withdrawnAt       DateTime?
  notificationsSent Int             @default(0)
  lastNotifiedAt    DateTime?
  createdAt         DateTime        @default(now())
  updatedAt         DateTime        @updatedAt

  promotions        WaitlistPromotion[]

  @@unique([eventId, participantId])
  @@index([eventId, participantType, priority, position])
  @@index([eventId, status])
  @@index([status, promotionDeadline])
}

model WaitlistPromotion {
  id              String        @id @default(cuid())
  waitlistEntryId String
  waitlistEntry   WaitlistEntry @relation(fields: [waitlistEntryId], references: [id], onDelete: Cascade)
  triggeredBy     String        // "cancellation", "rejection", "quota_increase", "manual"
  triggerEntityId String?       // participantId of the person who cancelled/was rejected
  promotedBy      String?       // userId if manual promotion
  slotAvailableAt DateTime      // When the slot opened
  promotedAt      DateTime      @default(now())
  confirmedAt     DateTime?     // When participant confirmed acceptance
  declinedAt      DateTime?     // If participant declined or deadline passed

  @@index([waitlistEntryId])
}
```

#### 12.20.2 Auto-Waitlist Trigger Flow

```
Participant submits registration form
  -> System checks InvitationConstraint for this participantType + eventId:
     currentCount = COUNT(Participant WHERE eventId AND participantType AND status != REJECTED)
     quota = InvitationConstraint.maxParticipants

  -> If currentCount < quota:
     -> Normal flow: create Participant, enter workflow at step 1
     -> No waitlist involved

  -> If currentCount >= quota:
     -> Create Participant record with status = WAITLISTED
     -> Determine priority:
        - Check participantType against priority mapping (configured per event)
        - VIP types (Head of State, Minister) -> WaitlistPriority.VIP
        - Returning delegations -> WaitlistPriority.HIGH
        - All others -> WaitlistPriority.STANDARD
     -> Calculate position:
        - Within the same priority tier, position = MAX(position) + 1
        - VIP position 1 is ahead of HIGH position 1, which is ahead of STANDARD position 1
     -> Create WaitlistEntry with registrationData snapshot
     -> Send notification via Communication Hub:
        "Your registration for [event] has been waitlisted.
         Your position: #3 (VIP priority)
         We will notify you immediately if a slot becomes available."
     -> Display confirmation page with queue position
```

#### 12.20.3 Auto-Promotion Flow

```
Slot becomes available (one of):
  a) Registered participant cancels their registration
  b) Participant is rejected by a validator
  c) Admin manually increases quota for this participantType
  d) Admin manually promotes a specific waitlist entry

  -> System identifies the trigger:
     For (a) or (b): the departing participant's type determines which waitlist to check
     For (c): recheck all ACTIVE entries for this type
     For (d): skip queue logic, promote specified entry

  -> Query next eligible entry:
     SELECT * FROM WaitlistEntry
     WHERE eventId = :eventId
       AND participantType = :type
       AND status = 'ACTIVE'
     ORDER BY
       CASE priority
         WHEN 'VIP' THEN 0
         WHEN 'HIGH' THEN 1
         WHEN 'STANDARD' THEN 2
       END,
       position ASC
     LIMIT 1

  -> If entry found:
     -> Create WaitlistPromotion record
     -> Set WaitlistEntry.status = PROMOTED, promotedAt = now()
     -> Set promotionDeadline = now() + 48 hours (configurable)
     -> Restore Participant from registrationData snapshot:
        - Update Participant.status from WAITLISTED to first workflow step
        - Enter the event workflow pipeline
     -> Send urgent notification:
        "A slot has opened for [event]! You have been promoted from the waitlist.
         Please confirm your registration by [deadline].
         [Confirm Registration] [Withdraw]"

  -> Deadline monitoring (background job, runs every 15 minutes):
     -> Query WaitlistEntry WHERE status = PROMOTED
       AND promotionDeadline < now() AND confirmedAt IS NULL
     -> For each expired promotion:
        -> Set WaitlistEntry.status = EXPIRED
        -> Remove participant from workflow
        -> Trigger auto-promotion for the next person in queue
        -> Notify expired participant: "Your waitlist offer has expired"

  -> Recalculate positions after any change:
     -> All remaining ACTIVE entries in the affected priority tier
       get their position recalculated to close gaps
     -> Notify affected participants if their position changed significantly
```

#### 12.20.4 Participant-Facing Waitlist Status

```
+--------------------------------------------------------------+
|  Registration Status                      REG-2026-0089      |
+--------------------------------------------------------------+
|                                                               |
|  Status: WAITLISTED                                          |
|                                                               |
|  +------------------------------------------------------+    |
|  |                                                        |    |
|  |  Your position in queue:  #3                          |    |
|  |  Priority level: VIP                                   |    |
|  |                                                        |    |
|  |  Ahead of you:  2 people                              |    |
|  |  Behind you:   14 people                              |    |
|  |                                                        |    |
|  |  Quota: 50 / 50 (full)                                |    |
|  |  Waitlisted: Feb 5, 2026 at 10:23                    |    |
|  |                                                        |    |
|  |  o-----------*------------------------------ o        |    |
|  |  Submitted   Waitlisted                  Promoted      |    |
|  |                                                        |    |
|  |  You will be notified immediately by email            |    |
|  |  and SMS when a slot becomes available.               |    |
|  |                                                        |    |
|  |  [Withdraw from Waitlist]                             |    |
|  |                                                        |    |
|  +------------------------------------------------------+    |
|                                                               |
|  Position history:                                            |
|  Feb 5, 10:23 - Joined waitlist at position #7               |
|  Feb 6, 14:10 - Moved to position #5 (2 withdrawals)        |
|  Feb 7, 09:00 - Moved to position #3 (2 promotions)         |
|                                                               |
+--------------------------------------------------------------+
```

#### 12.20.5 Waitlist Analytics Dashboard

```
+----------------------------------------------------------------------+
|  Waitlist Analytics - 38th AU Summit                                 |
+----------------------------------------------------------------------+
|                                                                       |
|  DEMAND vs CAPACITY                      CONVERSION FUNNEL            |
|                                                                       |
|  Participant Type    Quota  Reg'd  Wait   Waitlisted:        47      |
|  -------------------------------------    Promoted:          12 (26%) |
|  Delegate              50    50     17    Confirmed:          9 (75%) |
|  Observer              30    30      8    Expired/Declined:   3 (25%) |
|  Media                 40    35      0    Still waiting:     35       |
|  Staff                100    87      0                                |
|  Interpreter           20    20     14    AVERAGE WAIT TIME           |
|  NGO                   25    25      8    VIP:    1.2 days            |
|                                           HIGH:   2.8 days            |
|  Total waitlisted: 47                     STANDARD: 4.5 days         |
|  Demand-to-capacity: 1.15x                                           |
|                                                                       |
|  WAITLIST ACTIVITY (last 7 days)                                     |
|  +--------------------------------------------------+                |
|  |  Joined  ====  ====  ==    =     ==   ===  ==    |                |
|  |  Left    --    -     ---   --    -    --   -     |                |
|  |         Feb 1  Feb 2  Feb 3 Feb 4 Feb 5 Feb 6 Feb 7             |
|  +--------------------------------------------------+                |
|                                                                       |
|  RECOMMENDATIONS                                                      |
|  [!] Interpreter quota has 70% excess demand -> Consider +10 slots   |
|  [!] Delegate waitlist has 3 VIP entries -> Review for manual promo  |
|                                                                       |
|  [Export Waitlist]  [Bulk Promote]  [Adjust Quotas]                  |
+----------------------------------------------------------------------+
```

#### 12.20.6 Integration with Other Systems

| System | Integration |
|--------|------------|
| **Invitation / Quotas** | InvitationConstraint.maxParticipants is the trigger threshold; quota changes trigger re-evaluation |
| **Workflow Engine** | Promoted participants enter the workflow at step 1, same as direct registrations |
| **Communication Hub** | Waitlist notifications (position updates, promotion offers, expiry warnings, confirmations) |
| **Participant Registration** | Registration form data snapshot stored in WaitlistEntry for restoration on promotion |
| **Command Center** | Waitlist demand-to-capacity widget, promotion activity alerts |
| **Analytics / Reporting** | Conversion rates, wait times, demand patterns feed into event planning reports |
| **Post-Event Surveys** | Promoted-from-waitlist participants tagged for experience comparison |

### 12.21 Participant Mobile App & Digital Experience

Everything designed so far is admin-facing. The **participant** — the person attending the event — currently only interacts with a registration form and then shows up in person. A participant-facing mobile experience changes the entire event dynamic.

#### 12.21.1 Data Model

```prisma
model PersonalAgenda {
  id            String   @id @default(cuid())
  participantId String
  participant   Participant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  meetingId     String
  meeting       Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  status        String   // INTERESTED, CONFIRMED, ATTENDED, CANCELLED
  reminder      Boolean  @default(true)
  reminderMinutes Int    @default(15)
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  @@unique([participantId, meetingId])
  @@index([participantId, status])
  @@index([meetingId])
}

model DigitalBadge {
  id              String   @id @default(cuid())
  participantId   String   @unique
  participant     Participant @relation(fields: [participantId], references: [id], onDelete: Cascade)
  walletPassUrl   String?  // Apple Wallet .pkpass or Google Wallet JWT URL
  walletPassType  String?  // APPLE, GOOGLE
  qrPayload       String   // Encrypted payload for QR scanning
  isActive        Boolean  @default(true)
  lastScannedAt   DateTime?
  generatedAt     DateTime @default(now())
  updatedAt       DateTime @updatedAt
}

model NetworkingRequest {
  id              String   @id @default(cuid())
  tenantId        String
  eventId         String
  fromParticipantId String
  fromParticipant Participant @relation("NetworkingFrom", fields: [fromParticipantId], references: [id], onDelete: Cascade)
  toParticipantId String
  toParticipant   Participant @relation("NetworkingTo", fields: [toParticipantId], references: [id], onDelete: Cascade)
  status          String   // PENDING, ACCEPTED, DECLINED, EXPIRED
  message         String?
  proposedTime    DateTime?
  proposedLocation String?
  respondedAt     DateTime?
  createdAt       DateTime @default(now())

  @@unique([fromParticipantId, toParticipantId, eventId])
  @@index([toParticipantId, status])
}

model ContactExchange {
  id              String   @id @default(cuid())
  participantId   String
  scannedParticipantId String
  scannedAt       DateTime @default(now())

  @@unique([participantId, scannedParticipantId])
  @@index([participantId])
}
```

#### 12.21.2 Digital Badge & Wallet Integration

When a participant's status reaches `APPROVED`, the system generates a digital badge:

```
Participant approved → Generate QR payload (encrypted: participantId + eventId + accessLevel)
                     → Generate Apple Wallet .pkpass file (using passkit-generator)
                     → Generate Google Wallet JWT (using Google Wallet API)
                     → Store URLs in DigitalBadge record
                     → Send email with "Add to Wallet" links
```

The QR payload is the same one printed on the physical badge. Access control scanners work identically for both physical and digital badges.

**Wallet pass contents:**
```json
{
  "eventName": "38th AU Summit",
  "participantName": "H.E. John Doe",
  "organization": "Republic of Kenya",
  "participantType": "Minister",
  "accessLevel": "CLOSED",
  "registrationCode": "REG-2026-0042",
  "barcode": { "format": "QR", "message": "<encrypted_payload>" },
  "relevantDate": "2026-02-10T08:00:00Z",
  "locations": [{ "latitude": 9.0192, "longitude": 38.7525 }]
}
```

The wallet pass auto-surfaces on the participant's lock screen when they're near the venue (location-triggered). If the participant's status changes (e.g., access level upgraded), the pass updates automatically via push notification to the wallet.

#### 12.21.3 Personal Agenda

```
┌─────────────────────────────────────────────────────────┐
│  My Agenda - Feb 10                    [Calendar] [List] │
├─────────────────────────────────────────────────────────┤
│                                                          │
│  08:00 ── Registration Opens                             │
│           African Union Conference Centre, Lobby          │
│                                                          │
│  09:00 ── Opening Ceremony                    [Confirmed]│
│     ★     Plenary Hall  |  600 attending                 │
│           Starts in 45 minutes                           │
│           → Walk 2 min from Registration                 │
│                                                          │
│  11:00 ── Coffee Break                                   │
│           Exhibition Hall                                │
│                                                          │
│  11:30 ── Committee on Political Affairs      [Confirmed]│
│     ★     Conference Room B  |  120 attending            │
│           → Walk 5 min from Plenary Hall                 │
│                                                          │
│  13:00 ── Lunch                                          │
│           Restaurant Level 2  |  Your meal: Halal        │
│                                                          │
│  14:30 ── Bilateral: Kenya - Ethiopia        [Confirmed] │
│     ★     Bilateral Room 7  |  Private                   │
│           Driver pickup at 14:15 from main entrance      │
│                                                          │
│  16:00 ── Press Conference: Climate Action   [Interested]│
│           Press Center  |  45 attending                   │
│                                                          │
│  19:00 ── Gala Dinner                        [Confirmed] │
│     ★     Grand Ballroom  |  Table 12, Seat 3           │
│           Dress code: Black tie                          │
│                                                          │
│  [Browse full schedule]                                  │
│                                                          │
└─────────────────────────────────────────────────────────┘
```

The agenda integrates data from multiple systems:

| Agenda item data | Source system |
|-----------------|--------------|
| Session/meeting schedule | Meeting model |
| Attendance confirmation | PersonalAgenda model |
| Walking directions | VenueFloorPlan zones |
| Meal type | Participant.customData dietary field |
| Bilateral meetings | BilateralRequest model |
| Transport pickups | TransportRequest model |
| Seating assignment | SeatAssignment model |
| Dress code | Meeting.customData |

**Demand aggregation for admins:** When participants mark sessions as "Interested" or "Confirmed," the admin analytics dashboard shows demand vs. capacity per session. If "Committee on Political Affairs" has 250 confirmed vs. 120 room capacity, the system alerts the admin to consider a room swap.

#### 12.21.4 Participant Self-Service Portal

Accessible via mobile browser (PWA) or dedicated route. No app store download required.

**Status tracker:**
```
Registration Status                    REG-2026-0042

  ✓ Submitted ──── ✓ Document Review ──── ● Approval ──── ○ Badge Print ──── ○ Ready

  Current step: Approval (Step 3 of 5)
  Assigned to: First Validator
  Submitted: Feb 1, 2026 at 14:32
  Last update: Feb 3, 2026 at 09:15

  ⚠ Missing document: Letter of Invitation
    [Upload now]  (camera icon for mobile capture)
```

**Self-service actions:**
- Upload missing documents (camera capture on mobile, file picker on desktop)
- View and download printed badge PDF
- View transport schedule with driver details
- View room assignment with hotel map
- View meal plan and confirm dietary requirements
- Contact delegation focal point (in-app message)
- Access emergency contacts and event hotline
- Export personal agenda to iCal

#### 12.21.5 Networking

```prisma
// Participant directory visibility is opt-in via customData field
// "networking_visible": true/false defined as a custom field on the registration form
```

**Contact exchange flow:**

```
Participant A opens "Scan Contact" → Camera activates
  → Scans Participant B's badge QR
  → System decodes QR → looks up Participant B
  → Shows B's public profile (name, org, title, country, photo)
  → [Save Contact] → Creates ContactExchange record
  → B receives notification: "John Doe saved your contact"
  → Both can later export their collected contacts as vCard (.vcf)
```

**Meeting request flow:**

```
Participant A → Browse directory → Find Participant B
  → [Request Meeting] → Write message, optionally suggest time/location
  → Creates NetworkingRequest (status: PENDING)
  → B receives notification → [Accept] / [Decline] / [Suggest different time]
  → If accepted: both see it on their personal agenda
  → If a bilateral room is needed: admin is notified, or auto-booked if rooms available
```

### 12.22 Staff & Volunteer Management

The event team — coordinators, ushers, interpreters, IT support, medical staff, drivers — needs its own management layer. These are not "participants" in the accreditation sense, but they are on-site, need badges, need schedules, and need to be tracked.

#### 12.22.1 Data Model

```prisma
model StaffMember {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  userId      String?  // Link to User if they have system access
  user        User?    @relation(fields: [userId], references: [id])
  name        String
  phone       String
  email       String?
  photo       String?  // Azure Blob URL
  role        StaffRole
  team        String?  // "Registration Team A", "VIP Protocol", "Transport"
  skills      Json     @default("[]") // ["French", "Arabic", "First Aid", "Sign Language"]
  status      StaffStatus @default(OFF_DUTY)
  badgeId     String?  // Linked to a badge for access control
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  shifts      StaffShift[]
  taskLogs    StaffTaskLog[]

  @@index([eventId, role])
  @@index([eventId, team])
  @@index([status])
}

enum StaffRole {
  COORDINATOR
  USHER
  INTERPRETER
  IT_SUPPORT
  MEDICAL
  DRIVER
  SECURITY_GUARD
  PROTOCOL_OFFICER
  REGISTRATION_CLERK
  CATERING
  AV_TECHNICIAN
  VOLUNTEER
}

enum StaffStatus {
  ACTIVE        // On duty, working
  ON_BREAK      // Logged break
  OFF_DUTY      // Not on shift
  ABSENT        // Expected but not checked in
  UNAVAILABLE   // Sick, personal leave
}

model StaffShift {
  id           String      @id @default(cuid())
  staffId      String
  staff        StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)
  date         DateTime    @db.Date
  startTime    DateTime
  endTime      DateTime
  zone         String?     // "Registration Zone", "VIP Area", "Gate 3"
  location     String?     // Specific room or post
  task         String?     // "Registration Desk A", "VIP Lounge Door", "Shuttle Bay"
  status       ShiftStatus @default(SCHEDULED)
  checkedInAt  DateTime?
  checkedOutAt DateTime?
  breakMinutes Int         @default(0) // Total break time taken
  notes        String?
  createdAt    DateTime    @default(now())
  updatedAt    DateTime    @updatedAt

  @@index([staffId, date])
  @@index([date, zone])
  @@index([status])
}

enum ShiftStatus {
  SCHEDULED
  CHECKED_IN
  CHECKED_OUT
  NO_SHOW
  CANCELLED
}

model StaffTaskLog {
  id          String      @id @default(cuid())
  staffId     String
  staff       StaffMember @relation(fields: [staffId], references: [id], onDelete: Cascade)
  action      String      // "processed_participant", "escorted_vip", "resolved_incident"
  metadata    Json?       // {"participantId": "...", "duration": 5}
  createdAt   DateTime    @default(now())

  @@index([staffId, createdAt])
}
```

#### 12.22.2 Shift Scheduling Interface

```
┌──────────────────────────────────────────────────────────────────┐
│  Staff Schedule - Feb 10, 2026              [Day] [Week] [List]  │
├──────────────────────────────────────────────────────────────────┤
│                                                                   │
│  Zone: Registration        Team: Registration Team A              │
│                                                                   │
│  06:00  07:00  08:00  09:00  10:00  11:00  12:00  13:00  14:00  │
│  ──────────────────────────────────────────────────────────────── │
│  Ahmed  ├────── Desk A ──────────┤ Break ├── Desk A ──┤          │
│  Sara   ├────── Desk B ──────────┤ Break ├── Desk B ──┤          │
│  Omar         ├────── Desk C ──────────┤ Break ├── Desk C ──┤   │
│  Fatima       ├────── Desk D ──────────┤ Break ├── Desk D ──┤   │
│                                                                   │
│  Zone: VIP Protocol        Team: Protocol                        │
│  ──────────────────────────────────────────────────────────────── │
│  David  ├────── VIP Lounge ──────────────────────────────────┤   │
│  Maria  ├────── Airport Arrivals ──────┤ VIP Lounge ────────┤   │
│                                                                   │
│  Coverage Gap Alert: Gate 3 has no usher from 12:00-13:00        │
│  [Assign staff]                                                   │
│                                                                   │
│  Unassigned: 3 volunteers available  [View & Assign]             │
└──────────────────────────────────────────────────────────────────┘
```

**Key scheduling features:**

- Drag-and-drop shift blocks on a timeline (same `@dnd-kit` used in form designer)
- **Coverage gap detection**: system highlights time/zone combinations with no assigned staff
- **Conflict detection**: warn if a staff member is double-booked
- **Skill filter**: when filling a gap at the Interpretation Booth, filter to staff with French language skill
- **Auto-schedule**: algorithm distributes shifts evenly across available staff, respecting maximum hours and required breaks
- **Shift swap**: staff can request to swap shifts with each other, pending manager approval

#### 12.22.3 Staff Check-In/Out Flow

```
Staff arrives at post → Scans own badge at zone terminal (or admin scans them in)
  → StaffShift.status = CHECKED_IN, checkedInAt = now()
  → Staff appears as "Active" on command center availability map
  → Late check-in alert if > 15 minutes past shift start

Staff takes break → Taps "Break" on their phone or zone terminal
  → StaffMember.status = ON_BREAK
  → Break timer starts (auto-return to ACTIVE after configured max break)

Staff ends shift → Scans badge out or admin checks them out
  → StaffShift.status = CHECKED_OUT, checkedOutAt = now()
  → If overtime (actual hours > scheduled hours), flag for review

No-show detection → Background job at shift start + 30 minutes
  → If StaffShift.status still SCHEDULED, set to NO_SHOW
  → Notify shift manager → suggest available replacement
```

#### 12.22.4 Performance Tracking

For staff in measurable roles (registration clerks, validators), auto-capture productivity metrics from existing system actions:

```
Registration Clerk Ahmed - Feb 10:
  Participants processed: 47
  Avg processing time: 4.2 minutes
  Shift hours: 8h (6:00 - 14:00)
  Break time: 45 minutes

Validator Sara - Feb 10:
  Approvals: 62
  Rejections: 8
  Avg review time: 2.1 minutes
  SLA compliance: 98%
```

Data sourced from `Approval` records (already created by workflow engine) joined with `StaffShift` timing.

#### 12.22.5 Integration with Other Systems

| System | Integration |
|--------|------------|
| **Badge system** | Staff get badges with "STAFF" type, specific zone access |
| **Access control** | Staff badge scans double as shift check-in/out |
| **Command center** | Real-time staff position and status overlay |
| **Incident management** | Assign incidents to on-duty staff in the relevant zone |
| **Transport** | Driver staff members linked to vehicle assignments |
| **Communication hub** | Team-level messaging channels |

### 12.23 Interpretation & Language Services

International events require simultaneous interpretation. A 5-day summit with 6 language pairs across 10 sessions per day means coordinating ~300 interpreter-session assignments, hundreds of headset receivers, and dozens of interpretation booths.

#### 12.23.1 Data Model

```prisma
model InterpretationService {
  id            String   @id @default(cuid())
  tenantId      String
  tenant        Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId       String
  event         Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  meetingId     String
  meeting       Meeting  @relation(fields: [meetingId], references: [id], onDelete: Cascade)
  fromLanguage  String   // ISO 639-1: "en", "fr", "ar"
  toLanguage    String
  channelNumber Int      // Audio channel participants tune to
  boothId       String?
  booth         InterpretationBooth? @relation(fields: [boothId], references: [id])
  status        String   // SCHEDULED, ACTIVE, COMPLETED, CANCELLED
  notes         String?
  createdAt     DateTime @default(now())
  updatedAt     DateTime @updatedAt

  assignments   InterpreterAssignment[]

  @@unique([meetingId, fromLanguage, toLanguage])
  @@index([eventId, meetingId])
}

model InterpreterAssignment {
  id          String   @id @default(cuid())
  serviceId   String
  service     InterpretationService @relation(fields: [serviceId], references: [id], onDelete: Cascade)
  staffId     String   // StaffMember of role INTERPRETER
  startTime   DateTime // Interpreters rotate mid-session
  endTime     DateTime
  isLead      Boolean  @default(false) // Lead interpreter manages the booth
  status      String   // SCHEDULED, ACTIVE, COMPLETED, ABSENT
  createdAt   DateTime @default(now())

  @@index([staffId, startTime])
  @@index([serviceId])
}

model InterpretationBooth {
  id          String   @id @default(cuid())
  tenantId    String
  venueId     String
  venue       Venue    @relation(fields: [venueId], references: [id], onDelete: Cascade)
  roomName    String   // Which room this booth serves
  boothNumber Int
  languages   Json     @default("[]") // ["en","fr","ar"] - languages this booth is wired for
  capacity    Int      @default(3) // How many interpreters fit
  equipment   Json     @default("[]") // ["console_bosch_integrus", "microphone_x2"]
  status      String   // OPERATIONAL, MAINTENANCE, OUT_OF_SERVICE
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  services    InterpretationService[]

  @@unique([venueId, roomName, boothNumber])
}

model ReceiverHandset {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  serialNumber String  @unique
  status      String   // AVAILABLE, CHECKED_OUT, LOST, DAMAGED, CHARGING
  currentHolder String? // participantId
  checkedOutAt DateTime?
  checkedInAt  DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([eventId, status])
}
```

#### 12.23.2 Interpreter Scheduling with Fatigue Rotation

Interpreters cannot work continuously for more than 30 minutes at peak concentration. The system enforces rotation:

```
Session: Opening Ceremony (09:00 - 12:00)
Language pair: English → French
Booth 1, Channel 2

  09:00 - 09:30  Interpreter A (lead) + Interpreter B (support)
  09:30 - 10:00  Interpreter B (lead) + Interpreter A (support)
  10:00 - 10:30  Interpreter A (lead) + Interpreter C (support) ← rotation
  10:30 - 11:00  Interpreter C (lead) + Interpreter A (support)
  11:00 - 11:30  Interpreter B (lead) + Interpreter C (support)
  11:30 - 12:00  Interpreter C (lead) + Interpreter B (support)
```

**Auto-scheduling algorithm:**

1. For each meeting, get required language pairs
2. For each language pair, find interpreters with matching skills from `StaffMember.skills`
3. Check interpreter availability (no overlapping `InterpreterAssignment`)
4. Assign in 30-minute rotating blocks, ensuring minimum 30-minute rest between consecutive active blocks
5. Flag unassignable gaps: "No Arabic→Portuguese interpreter available for Session X at 14:00"

#### 12.23.3 Receiver Handset Flow

```
Participant arrives at meeting → Approaches equipment desk
  → Staff scans participant badge → System shows preferred language (from registration)
  → Staff hands receiver, scans receiver barcode
  → ReceiverHandset.status = CHECKED_OUT, currentHolder = participantId
  → Participant shown on "Active Receivers" count

Meeting ends → Participant returns receiver
  → Staff scans receiver barcode → ReceiverHandset.status = AVAILABLE
  → If participant leaves without returning:
    → End-of-day report: "12 receivers not returned"
    → Notification sent to participant: "Please return your receiver to the equipment desk"
```

**Equipment dashboard:**
```
Receivers: 500 total | 342 checked out | 145 available | 8 charging | 5 lost

Lost receiver cost this event: $250 (5 × $50)
Top unreturned: Table showing participant names with overdue receivers
```

#### 12.23.4 Cost Tracking

```
Interpretation Cost Summary - 38th AU Summit:
┌──────────────────┬───────┬───────────┬──────────┬───────────┐
│ Language Pair     │ Hours │ Rate/Hour │ Sessions │ Total     │
├──────────────────┼───────┼───────────┼──────────┼───────────┤
│ EN → FR          │  120  │  $80      │  24      │  $9,600   │
│ FR → EN          │  120  │  $80      │  24      │  $9,600   │
│ EN → AR          │   80  │  $95      │  16      │  $7,600   │
│ AR → EN          │   80  │  $95      │  16      │  $7,600   │
│ EN → PT          │   40  │  $90      │   8      │  $3,600   │
│ PT → EN          │   40  │  $90      │   8      │  $3,600   │
├──────────────────┼───────┼───────────┼──────────┼───────────┤
│ TOTAL            │  480  │           │          │ $41,600   │
│ Equipment rental │       │           │          │  $8,500   │
│ GRAND TOTAL      │       │           │          │ $50,100   │
└──────────────────┴───────┴───────────┴──────────┴───────────┘
```

Auto-calculated from `InterpreterAssignment` durations × configurable rate per language pair. Feeds into the event budget (Section 12.30).

### 12.24 Inventory & Asset Management

Events involve hundreds of physical items: signage, IT equipment, furniture, print materials, promotional items. These need to be tracked from procurement through deployment to return.

#### 12.24.1 Data Model

```prisma
model InventoryItem {
  id          String        @id @default(cuid())
  tenantId    String
  tenant      Tenant        @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String?       // null = tenant-level reusable asset
  event       Event?        @relation(fields: [eventId], references: [id])
  category    InventoryCategory
  name        String
  sku         String?
  description String?
  quantity    Int
  availableQty Int          // quantity - checked out - deployed
  unitCost    Float?
  currency    String        @default("USD")
  location    String?       // Current storage or deployment location
  status      InventoryStatus @default(IN_STOCK)
  isReusable  Boolean       @default(false) // Carries over between events
  imageUrl    String?
  barcode     String?       @unique // For scanning
  notes       String?
  createdAt   DateTime      @default(now())
  updatedAt   DateTime      @updatedAt

  checkouts   AssetCheckout[]
  deployments AssetDeployment[]

  @@index([tenantId, eventId, category])
  @@index([status])
  @@index([barcode])
}

enum InventoryCategory {
  SIGNAGE          // Banners, directional signs, nameplates
  FURNITURE        // Tables, chairs, podiums, stages
  IT_EQUIPMENT     // Laptops, projectors, screens, routers
  AV_EQUIPMENT     // Microphones, speakers, cameras, mixers
  PRINT_MATERIAL   // Programs, agendas, notepads, badges
  PROMOTIONAL      // Gift bags, branded items, lanyards
  STATIONERY       // Pens, folders, clipboards
  COMMUNICATION    // Radios, walkie-talkies, earpieces
  MEDICAL          // First aid kits, AED, wheelchair
  SECURITY         // Barriers, scanners, metal detectors
  CATERING         // Serving equipment, plates, linens
  TRANSPORT        // Vehicle accessories, GPS units
  OTHER
}

enum InventoryStatus {
  IN_STOCK       // In warehouse/storage
  DEPLOYED       // At venue, in position
  IN_TRANSIT     // Being moved
  CHECKED_OUT    // With a staff member
  DAMAGED        // Needs repair
  LOST           // Missing
  RETIRED        // End of life
}

model AssetCheckout {
  id           String        @id @default(cuid())
  itemId       String
  item         InventoryItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  quantity     Int           @default(1) // Can check out multiples (e.g., 10 radios)
  checkedOutTo String        // staffId or userId
  checkedOutBy String        // userId who processed checkout
  purpose      String?       // "VIP escort duty", "Registration desk setup"
  checkedOutAt DateTime      @default(now())
  dueDate      DateTime?
  returnedAt   DateTime?
  returnedTo   String?       // userId who processed return
  condition    String?       // GOOD, DAMAGED, LOST (on return)
  notes        String?

  @@index([itemId, returnedAt])
  @@index([checkedOutTo, returnedAt])
}

model AssetDeployment {
  id          String        @id @default(cuid())
  itemId      String
  item        InventoryItem @relation(fields: [itemId], references: [id], onDelete: Cascade)
  quantity    Int           @default(1)
  venueId     String?
  zone        String?       // "Registration Area", "Plenary Hall", "Gate 3"
  location    String        // Specific placement: "Main entrance, left wall"
  deployedBy  String        // userId
  deployedAt  DateTime      @default(now())
  retrievedAt DateTime?
  status      String        // DEPLOYED, RETRIEVED, CONFIRMED_IN_PLACE
  notes       String?

  @@index([itemId, status])
  @@index([zone])
}
```

#### 12.24.2 Checkout/Return Flow

```
Staff needs a radio → Goes to equipment room
  → Ops clerk scans staff badge → Identifies staff member
  → Ops clerk scans radio barcode → InventoryItem found
  → System checks: is item available? (availableQty > 0)
  → [Confirm Checkout] → AssetCheckout created
  → InventoryItem.availableQty decremented
  → Receipt printed or sent via email

Staff returns radio → Ops clerk scans radio barcode
  → System shows who checked it out and when
  → Ops clerk inspects: [Good] [Damaged] [Lost]
  → [Confirm Return] → AssetCheckout.returnedAt = now()
  → InventoryItem.availableQty incremented
  → If damaged: auto-create maintenance task
```

#### 12.24.3 Packing Lists & Deployment

When setting up a venue, the admin generates packing lists:

```
Packing List: Conference Hall A Setup - Feb 9

┌───┬────────────────────────┬─────┬──────────┬─────────┐
│ # │ Item                   │ Qty │ Location │ Packed  │
├───┼────────────────────────┼─────┼──────────┼─────────┤
│ 1 │ Country nameplate      │  55 │ Tables   │ ☐       │
│ 2 │ Flag stand (small)     │  55 │ Tables   │ ☐       │
│ 3 │ Microphone (wireless)  │   4 │ Podium   │ ☐       │
│ 4 │ Projector              │   2 │ Stage    │ ☐       │
│ 5 │ Bottled water          │ 120 │ Tables   │ ☐       │
│ 6 │ Notepad + pen set      │  55 │ Tables   │ ☐       │
│ 7 │ Directional signage    │   3 │ Corridor │ ☐       │
│ 8 │ Registration banner    │   1 │ Entrance │ ☐       │
└───┴────────────────────────┴─────┴──────────┴─────────┘

Assigned to: Setup Team B
Due: Feb 9, 16:00
```

Staff check off items as packed and deployed. Admin sees deployment status across all venues.

#### 12.24.4 Alerts & Reports

- **Low stock alert**: "Only 15 lanyards remaining (threshold: 50)" → triggered when `availableQty` < configurable threshold
- **Overdue returns**: staff who haven't returned checked-out items past due date
- **Loss report**: total value of lost/damaged items per event
- **Reusable asset carry-over**: at event close, inventory marked `isReusable` auto-appears in next event's available stock

### 12.25 Parking & Zone Access Management

Large events have multiple controlled parking zones with different access levels — VIP lot, delegate parking, staff parking, media compound, service vehicles.

#### 12.25.1 Data Model

```prisma
model ParkingZone {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name        String   // "VIP Parking", "Delegate Lot B", "Media Compound"
  code        String   // Short code: "P1", "P2", "PVIP"
  capacity    Int
  occupancy   Int      @default(0) // Real-time count from gate scans
  latitude    Float?
  longitude   Float?
  color       String?  // Zone color for car pass and signage: "#FFD700" for VIP gold
  accessRules Json     @default("[]")
  // [{"participantTypes": ["Minister","Head of State"], "accessLevel": "CLOSED"}]
  // [{"staffRoles": ["DRIVER","SECURITY_GUARD"]}]
  operatingHours Json  @default("{}")
  // {"open": "06:00", "close": "22:00"}
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  permits     ParkingPermit[]
  gateLogs    ParkingGateLog[]

  @@unique([tenantId, eventId, code])
}

model ParkingPermit {
  id            String      @id @default(cuid())
  parkingZoneId String
  parkingZone   ParkingZone @relation(fields: [parkingZoneId], references: [id], onDelete: Cascade)
  participantId String?     // null for general-use permits
  vehiclePlate  String
  vehicleType   String?     // SEDAN, SUV, VAN, BUS, MOTORCYCLE
  vehicleColor  String?
  driverName    String?
  permitNumber  String      @unique
  qrPayload     String      // Encrypted payload for gate scanning
  validFrom     DateTime
  validTo       DateTime
  status        ParkingPermitStatus @default(ACTIVE)
  issuedAt      DateTime    @default(now())

  @@index([vehiclePlate])
  @@index([parkingZoneId, status])
  @@index([participantId])
}

enum ParkingPermitStatus {
  ACTIVE
  EXPIRED
  REVOKED
  SUSPENDED
}

model ParkingGateLog {
  id            String      @id @default(cuid())
  parkingZoneId String
  parkingZone   ParkingZone @relation(fields: [parkingZoneId], references: [id], onDelete: Cascade)
  permitId      String?
  vehiclePlate  String
  direction     String      // ENTRY, EXIT
  result        String      // ALLOWED, DENIED_FULL, DENIED_ACCESS, DENIED_EXPIRED, DENIED_INVALID
  scannedBy     String?     // userId or "AUTO" for automated gates
  scannedAt     DateTime    @default(now())

  @@index([parkingZoneId, scannedAt])
  @@index([vehiclePlate])
}
```

#### 12.25.2 Car Pass Design

Car passes are designed using the **badge designer** (same canvas, elements, dynamic text) with a different card size (A5 or custom). Dynamic fields include:

```json
{
  "elements": [
    { "type": "DYNAMIC_TEXT", "field": "parkingZone.name", "style": {"fontSize": 48, "fontWeight": "bold"} },
    { "type": "DYNAMIC_TEXT", "field": "permit.vehiclePlate", "style": {"fontSize": 36} },
    { "type": "SHAPE", "fill": "parkingZone.color", "width": "100%", "height": 20 },
    { "type": "QR_CODE", "field": "permit.qrPayload", "size": 80 },
    { "type": "DYNAMIC_TEXT", "field": "permit.validFrom → permit.validTo" },
    { "type": "TEXT", "content": "Display on dashboard at all times" }
  ]
}
```

#### 12.25.3 Gate Scanning Flow

```
Vehicle approaches gate → Gate guard scans car pass QR
  → System decodes QR → finds ParkingPermit
  → Checks:
    1. Permit status == ACTIVE? (not expired/revoked)
    2. Current time within validFrom-validTo?
    3. Current time within zone operatingHours?
    4. Zone occupancy < capacity?
  → All pass: ALLOWED
    → ParkingGateLog created (ENTRY)
    → ParkingZone.occupancy += 1
    → Gate opens (if automated)
  → Any fail: DENIED with reason
    → ParkingGateLog created (DENIED_FULL / DENIED_ACCESS / etc.)
    → Guard sees reason on screen, directs to alternative zone

Vehicle exits → Guard scans or auto-plate-reader detects
  → ParkingGateLog created (EXIT)
  → ParkingZone.occupancy -= 1
```

#### 12.25.4 Occupancy Dashboard

Displayed on the command center and at gate guard stations:

```
Parking Zones - Real-time Occupancy

  VIP (PVIP)     ████████████████░░░░  42/50  (84%)
  Delegate (P1)  ████████████░░░░░░░░  180/300 (60%)
  Delegate (P2)  ██████████████████░░  270/300 (90%) ⚠
  Staff (PS)     ████████░░░░░░░░░░░░  80/200  (40%)
  Media (PM)     ██████████████░░░░░░  35/50   (70%)

  Total vehicles on-site: 607 / 900

  ⚠ P2 at 90% - consider routing overflow to P1
```

Auto-generate permits from participant registration data: when a participant of type "Driver" is approved with a vehicle plate number in their `customData`, the system can auto-create a `ParkingPermit` for the appropriate zone.

### 12.26 Companion & Spouse Program

Diplomatic summits and major conferences include programs for accompanying persons. A Minister may bring a spouse, an assistant, and two children. They need accreditation, transport, and activities — but are not in the approval workflow.

#### 12.26.1 Data Model

```prisma
model CompanionRegistration {
  id                   String   @id @default(cuid())
  tenantId             String
  tenant               Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId              String
  event                Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  primaryParticipantId String
  primaryParticipant   Participant @relation(fields: [primaryParticipantId], references: [id], onDelete: Cascade)

  firstName         String
  familyName        String
  relationship      CompanionRelationship
  gender            String?
  dateOfBirth       DateTime?
  nationalityId     String?
  passportNumber    String?
  email             String?
  phone             String?
  customData        Json     @default("{}")
  photoUrl          String?

  // Badge & status
  registrationCode  String   @unique
  status            String   // REGISTERED, APPROVED, BADGE_PRINTED, COLLECTED, CANCELLED
  badgeTemplateId   String?  // Separate badge template for companions

  createdAt DateTime @default(now())
  updatedAt DateTime @updatedAt

  activitySignups CompanionActivitySignup[]

  @@index([eventId, primaryParticipantId])
  @@index([status])
}

enum CompanionRelationship {
  SPOUSE
  CHILD
  PARENT
  ASSISTANT
  AIDE_DE_CAMP
  OTHER
}

model CompanionActivity {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name        String   // "City Tour - Addis Ababa", "National Museum Visit"
  description String?
  date        DateTime @db.Date
  startTime   DateTime
  endTime     DateTime
  location    String
  meetingPoint String? // "Hotel lobby at 09:30"
  capacity    Int
  currentSignups Int   @default(0)
  transportIncluded Boolean @default(true)
  dressCode   String?
  cost        Float?   @default(0)
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  signups     CompanionActivitySignup[]

  @@unique([tenantId, eventId, name, date])
  @@index([eventId, date])
}

model CompanionActivitySignup {
  id            String   @id @default(cuid())
  activityId    String
  activity      CompanionActivity @relation(fields: [activityId], references: [id], onDelete: Cascade)
  companionId   String
  companion     CompanionRegistration @relation(fields: [companionId], references: [id], onDelete: Cascade)
  status        String   // SIGNED_UP, CONFIRMED, ATTENDED, CANCELLED, NO_SHOW
  notes         String?
  createdAt     DateTime @default(now())

  @@unique([activityId, companionId])
}
```

#### 12.26.2 Registration Flow

Companions are registered through the **delegation portal** by the focal point:

```
Focal point logs in → Views delegation → Clicks "Add Companion" on a delegate's row
  → Form: name, relationship, DOB, passport (if needed), photo
  → Companion registration created with status REGISTERED
  → Admin/validator reviews → status → APPROVED
  → Badge generated (separate template: different color, "COMPANION" label, limited zone access)
  → Companion appears on delegate's profile: "Traveling with: Jane Doe (Spouse)"
```

Companions share the delegate's:
- Hotel assignment (same room or adjacent room from the same room block)
- Airport transport (same vehicle, same pickup time)
- Welcome package (companion version — no official documents, but city guide + social program)

Companions have their own:
- Activity schedule (social/cultural program)
- Badge (limited access zones — no conference rooms, yes to social events and spouse program)
- Meal plan (tracked separately for catering counts)

#### 12.26.3 Activity Program Interface

```
Companion Program - Feb 10-14, 2026

Feb 10 (Mon)
  09:30 - 13:00   City Tour - Addis Ababa Highlights     [12/20 spots]  [Sign Up]
                   Meeting point: Hotel Lobby, 09:15
                   Transport: Included (minibus)

  15:00 - 17:00   Ethiopian Coffee Ceremony               [ 8/15 spots]  [Sign Up]
                   National Museum, Ground Floor

Feb 11 (Tue)
  10:00 - 16:00   Day Trip - Debre Libanos Monastery      [18/25 spots]  [Sign Up]
                   Full day with lunch. Dress code: modest
                   Transport: Included (bus)

Feb 12 (Wed)
  14:00 - 16:00   Traditional Craft Workshop              [ 5/12 spots]  [Sign Up]
                   AU Conference Centre, Room B12

Feb 13 (Thu)
  19:00 - 23:00   Gala Dinner (all companions invited)    [Confirmed]
                   Grand Ballroom | Dress code: Black tie
                   Seating: Table 12 (with delegation)
```

### 12.27 Gift Protocol & Welcome Packages

#### 12.27.1 Data Model

```prisma
model GiftItem {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name        String   // "Commemorative Medal", "AU Yearbook 2026", "Crystal Award"
  description String?
  category    String   // COMMEMORATIVE, BRANDED, BOOK, AWARD, SOUVENIR
  value       Float?   // Monetary value (for protocol compliance)
  currency    String   @default("USD")
  quantity    Int      // Total stock
  allocated   Int      @default(0)
  imageUrl    String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  allocations GiftAllocation[]

  @@index([eventId, category])
}

model GiftAllocation {
  id              String   @id @default(cuid())
  giftItemId      String
  giftItem        GiftItem @relation(fields: [giftItemId], references: [id], onDelete: Cascade)
  recipientType   String   // "DELEGATION", "INDIVIDUAL"
  recipientId     String?  // participantId or country name
  recipientName   String   // "Republic of Kenya", "H.E. John Doe"
  quantity        Int      @default(1)
  protocolLevel   String?  // "HEAD_OF_STATE", "MINISTER", "AMBASSADOR", "DELEGATE"
  status          String   // ALLOCATED, ASSEMBLED, DELIVERED, RETURNED
  deliveredAt     DateTime?
  deliveredBy     String?  // staffId
  deliveryMethod  String?  // "HOTEL_ROOM", "REGISTRATION_DESK", "GALA_DINNER"
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([giftItemId])
  @@index([recipientId])
  @@index([status])
}

model WelcomePackage {
  id              String   @id @default(cuid())
  tenantId        String
  tenant          Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId         String
  event           Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name            String   // "VIP Welcome Package", "Standard Delegate Package"
  forParticipantType String? // null = default
  contents        Json     // [{"item": "Event Program", "qty": 1}, {"item": "City Guide", "qty": 1}, ...]
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  assemblies      PackageAssembly[]

  @@unique([tenantId, eventId, name])
}

model PackageAssembly {
  id              String   @id @default(cuid())
  packageId       String
  package         WelcomePackage @relation(fields: [packageId], references: [id], onDelete: Cascade)
  participantId   String?
  delegationName  String?  // "Republic of Kenya" — one package per delegation or per individual
  status          String   // PENDING, ASSEMBLED, QA_CHECKED, DELIVERED
  assembledBy     String?
  assembledAt     DateTime?
  checkedBy       String?
  checkedAt       DateTime?
  deliveredAt     DateTime?
  deliveryMethod  String?  // HOTEL_ROOM, REGISTRATION_DESK, KIOSK
  notes           String?
  createdAt       DateTime @default(now())
  updatedAt       DateTime @updatedAt

  @@index([packageId, status])
  @@index([participantId])
}
```

#### 12.27.2 Gift Protocol Rules

```json
// Configurable per tenant/event via SystemSetting or event customData
{
  "giftValueThreshold": 250,
  "giftValueCurrency": "USD",
  "requireApprovalAboveThreshold": true,
  "giftsByProtocolLevel": {
    "HEAD_OF_STATE": ["Commemorative Medal", "AU Yearbook 2026", "Crystal Award"],
    "MINISTER": ["Commemorative Medal", "AU Yearbook 2026"],
    "AMBASSADOR": ["AU Yearbook 2026"],
    "DELEGATE": []
  }
}
```

When gifts are allocated, the system checks:
- Total gift value to recipient does not exceed threshold (or flags for approval if it does)
- Stock is available (`GiftItem.quantity - GiftItem.allocated > 0`)
- Protocol level matches the allocation rules

#### 12.27.3 Assembly Workflow

```
Admin creates package definitions → "VIP Package" contains: medal, yearbook, city guide, SIM card, badge holder
  → Participant approved → PackageAssembly auto-created (status: PENDING)
  → Assembly team prints packing list:

     PACKING LIST - Delegation: Republic of Kenya
     Package: VIP Welcome Package
     Recipient: H.E. President Ruto

     ☐ Commemorative Medal (gold box)
     ☐ AU Yearbook 2026
     ☐ Addis Ababa City Guide (English)
     ☐ Local SIM Card + data plan card
     ☐ Badge holder (VIP - gold)
     ☐ Event program booklet
     ☐ Branded pen + notepad
     ☐ Personalized welcome letter

     Assembled by: _________ Date: _________
     QA checked by: ________ Date: _________

  → Staff marks as ASSEMBLED → QA person checks → DELIVERED to hotel room
  → If hotel delivery not possible: available at registration desk pickup
```

### 12.28 Venue & Floor Plan Management

#### 12.28.1 Data Model

```prisma
model VenueFloorPlan {
  id          String   @id @default(cuid())
  venueId     String
  venue       Venue    @relation(fields: [venueId], references: [id], onDelete: Cascade)
  name        String   // "Ground Floor", "Conference Level 2", "Exhibition Hall"
  floorNumber Int?
  imageUrl    String   // Uploaded floor plan image (Azure Blob)
  width       Float?   // Image dimensions for coordinate mapping
  height      Float?
  zones       Json     @default("[]")
  // [{"id":"z1","name":"Registration","type":"FUNCTIONAL","polygon":[[x,y]...],"color":"#3B82F6"}]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  rooms       Room[]

  @@unique([venueId, name])
}

model Room {
  id           String         @id @default(cuid())
  venueId      String
  venue        Venue          @relation(fields: [venueId], references: [id], onDelete: Cascade)
  floorPlanId  String?
  floorPlan    VenueFloorPlan? @relation(fields: [floorPlanId], references: [id])
  name         String         // "Plenary Hall", "Bilateral Room 3", "Press Center"
  code         String?        // Short code: "PH", "BR3", "PC"
  capacity     Int
  setupType    RoomSetupType  @default(THEATER)
  equipment    Json           @default("[]")
  // ["projector","screen_16x9","wireless_mic_x4","interpretation_booth_x6","video_conference"]
  amenities    Json           @default("[]")
  // ["wifi","power_outlets","water_station","coat_room","disabled_access"]
  isBookable   Boolean        @default(true)
  hourlyRate   Float?
  positionX    Float?         // Position on floor plan image
  positionY    Float?
  notes        String?
  createdAt    DateTime       @default(now())
  updatedAt    DateTime       @updatedAt

  bookings     RoomBooking[]

  @@unique([venueId, name])
  @@index([venueId, isBookable])
}

enum RoomSetupType {
  THEATER       // Rows of chairs facing front
  BOARDROOM     // Large table with chairs around
  CLASSROOM     // Tables and chairs in rows
  BANQUET       // Round tables for dining
  U_SHAPE       // U-shaped table arrangement
  HOLLOW_SQUARE // Square with open center (typical for AU sessions)
  EXHIBITION    // Open floor with booth spaces
  RECEPTION     // Standing/cocktail layout
  CUSTOM        // Non-standard
}

model RoomBooking {
  id          String   @id @default(cuid())
  roomId      String
  room        Room     @relation(fields: [roomId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  meetingId   String?  // If linked to a Meeting record
  title       String
  bookedBy    String   // userId
  startTime   DateTime
  endTime     DateTime
  setupTime   Int      @default(30) // Minutes before for room setup
  teardownTime Int     @default(15) // Minutes after for cleanup
  setupType   RoomSetupType? // Override room default
  setupNotes  String?  // "4 country flags on stage", "U-shape with 20 seats", "No water on tables"
  attendees   Int?     // Expected count
  status      RoomBookingStatus @default(TENTATIVE)
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([roomId, startTime, endTime])
  @@index([eventId, startTime])
  @@index([status])
}

enum RoomBookingStatus {
  TENTATIVE
  CONFIRMED
  SETUP_IN_PROGRESS
  READY
  IN_USE
  TEARDOWN
  CANCELLED
}
```

#### 12.28.2 Room Booking Calendar

```
Room Calendar - Feb 10, 2026                              [Day] [Week]

                  08:00   09:00   10:00   11:00   12:00   13:00   14:00
Plenary Hall     ░Setup░ ├─── Opening Ceremony ───┤ Lunch ├── Plenary ──
  (600 cap)                     CONFIRMED                    CONFIRMED

Conf Room A      ░░░░░░ ├─ Committee on Peace ──┤ Lunch ├── Committee
  (120 cap)                   CONFIRMED                    TENTATIVE ⚠

Conf Room B      ░░░░░░ ├─ Political Affairs ───┤ Lunch ├── Political
  (120 cap)                   CONFIRMED                    CONFIRMED

Bilateral 1      ░░░░░░ ├Kenya-Ethiopia┤░░├Nigeria-Ghana┤░░├SA-Egypt┤
  (20 cap)              09:00-10:00      10:30-11:30      14:00-15:00

Bilateral 2      ░░░░░░ ├Tanzania-Rwanda┤░├Morocco-Tunisia┤░░░░░░░░░░
  (20 cap)              09:00-10:00      10:30-11:30

Press Center     ├──────────── Open all day ──────────────────────────
  (50 cap)                    CONFIRMED

░ = Setup/teardown buffer time
⚠ = Tentative booking (not yet confirmed)
```

**Conflict detection:** Before confirming a booking, the system checks:
1. No overlapping bookings for the same room (including setup/teardown buffers)
2. Expected attendees ≤ room capacity
3. Required equipment available in room (or flag what needs to be brought in)
4. If interpretation needed, verify booth is present in room

**Auto-generate setup tasks:** When a booking has `setupType` different from the room's default, or has `setupNotes`, the system creates a task in the staff task queue:

```
Setup Task: Conference Room A → Hollow Square
  Due: Feb 10, 07:30 (30 min before 08:00 booking)
  Current setup: Theater
  Target setup: Hollow Square, 20 seats
  Notes: "4 country flags on stage, nameplates for 20"
  Equipment needed: Move 4 flag stands from storage
  Assigned to: Setup Team A
  Status: PENDING
```

### 12.29 Media Center & Press Operations

Press/media participants need a managed workspace and services beyond accreditation.

#### 12.29.1 Data Model

```prisma
model PressConference {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  title       String   // "Joint Press Conference: Climate Action Summit"
  description String?
  date        DateTime @db.Date
  startTime   DateTime
  endTime     DateTime
  roomId      String?  // Links to Room booking
  status      String   // SCHEDULED, IN_PROGRESS, COMPLETED, CANCELLED
  isPoolOnly  Boolean  @default(false) // Restricted to pool journalists
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  speakers    PressConferenceSpeaker[]
  mediaAdvisories MediaAdvisory[]

  @@index([eventId, date])
}

model PressConferenceSpeaker {
  id                String   @id @default(cuid())
  pressConferenceId String
  pressConference   PressConference @relation(fields: [pressConferenceId], references: [id], onDelete: Cascade)
  participantId     String?  // If the speaker is a registered participant
  name              String
  title             String   // "Minister of Foreign Affairs, Republic of Kenya"
  speakingOrder     Int
  topic             String?
  biography         String?
  photoUrl          String?

  @@index([pressConferenceId])
}

model InterviewRequest {
  id                String   @id @default(cuid())
  tenantId          String
  eventId           String
  requestorId       String   // Participant of type Press/Media
  targetParticipantId String?
  targetDelegation  String?  // Country or organization name
  outlet            String   // "BBC World Service", "Al Jazeera"
  topic             String
  preferredDate     DateTime?
  preferredDuration Int?     // Minutes
  format            String   // IN_PERSON, PHONE, VIDEO, WRITTEN
  status            String   // SUBMITTED, FORWARDED, APPROVED, DECLINED, SCHEDULED, COMPLETED
  forwardedTo       String?  // Focal point userId who received the request
  respondedBy       String?
  respondedAt       DateTime?
  scheduledTime     DateTime?
  scheduledLocation String?
  notes             String?
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([eventId, status])
  @@index([targetDelegation])
  @@index([requestorId])
}

model MediaAdvisory {
  id                String   @id @default(cuid())
  tenantId          String
  eventId           String
  pressConferenceId String?
  pressConference   PressConference? @relation(fields: [pressConferenceId], references: [id])
  title             String
  body              String   // Rich text / markdown content
  embargoUntil      DateTime? // null = immediate release
  isPublished       Boolean  @default(false)
  publishedAt       DateTime?
  attachments       Json     @default("[]") // [{"name":"backgrounder.pdf","url":"..."}]
  distributedTo     Json     @default("[]") // ["all_media"] or specific participant IDs
  createdAt         DateTime @default(now())
  updatedAt         DateTime @updatedAt

  @@index([eventId, isPublished])
  @@index([embargoUntil])
}
```

#### 12.29.2 Interview Request Flow

```
Journalist (Press/Media participant) → Opens "Request Interview" in their portal
  → Selects target: delegation or specific delegate (searchable dropdown)
  → Fills: topic, preferred date/time, format (in-person/video/written), outlet name
  → Submits → InterviewRequest created (status: SUBMITTED)

System → Routes request to the target delegation's focal point
  → Focal point sees in their delegation portal: "3 interview requests pending"
  → Focal point reviews → [Approve] [Decline] [Forward to delegate]

If approved:
  → Focal point sets time and location
  → InterviewRequest.status = SCHEDULED
  → Both journalist and delegation receive notification
  → Appears on both parties' personal agendas
  → If room needed → auto-check availability and suggest booking

If declined:
  → Journalist notified with optional reason
  → InterviewRequest.status = DECLINED
```

#### 12.29.3 Embargo System

```
Admin creates MediaAdvisory:
  Title: "Joint Statement on Climate Action"
  Embargo until: Feb 12, 2026 at 14:00 UTC
  Attachments: statement.pdf, backgrounder.pdf

  → Advisory saved, NOT visible to media yet
  → At 14:00 UTC, background job:
    → Sets isPublished = true, publishedAt = now()
    → Sends email to all accredited Press/Media participants:
      "EMBARGO LIFTED: Joint Statement on Climate Action now available"
    → Advisory appears in participant app press kit section
    → If digital press kit exists, PDF auto-added
```

Advisories distributed before embargo lift show: "EMBARGOED - Not for publication before Feb 12, 14:00 UTC"

### 12.30 Budget & Financial Management

#### 12.30.1 Data Model

```prisma
model EventBudget {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name        String
  totalBudget Float
  currency    String   @default("USD")
  status      BudgetStatus @default(DRAFT)
  approvedBy  String?  // userId
  approvedAt  DateTime?
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  lineItems   BudgetLineItem[]
  sponsorships Sponsorship[]

  @@unique([tenantId, eventId, name])
}

enum BudgetStatus {
  DRAFT
  SUBMITTED
  APPROVED
  ACTIVE
  CLOSED
  OVER_BUDGET // Auto-set when actuals > budget
}

model BudgetLineItem {
  id          String   @id @default(cuid())
  budgetId    String
  budget      EventBudget @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  category    BudgetCategory
  subcategory String?  // "Airport transfers", "Shuttle service" under TRANSPORT
  description String
  vendor      String?
  vendorContact String?

  budgeted    Float
  committed   Float    @default(0) // POs issued
  actual      Float    @default(0) // Invoices received
  paid        Float    @default(0) // Payments made

  invoiceRef  String?
  purchaseOrderRef String?
  status      ExpenseStatus @default(ESTIMATED)
  dueDate     DateTime?
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([budgetId, category])
  @@index([status])
}

enum BudgetCategory {
  VENUE           // Rental, setup, utilities
  CATERING        // Meals, beverages, service staff
  TRANSPORT       // Vehicles, fuel, drivers, flights
  ACCOMMODATION   // Hotel room blocks, suite upgrades
  PRINTING        // Badges, programs, signage, nameplates
  EQUIPMENT       // AV, IT, furniture rental
  STAFF           // Temporary staff, overtime, uniforms
  INTERPRETATION  // Interpreters, equipment, booths
  SECURITY        // Guards, screening equipment, barriers
  COMMUNICATION   // SMS, email service, internet, radios
  PROTOCOL        // Gifts, welcome packages, flags, flowers
  MARKETING       // Branding, promotional materials
  INSURANCE       // Event insurance, liability
  CONTINGENCY     // Reserve fund
  OTHER
}

enum ExpenseStatus {
  ESTIMATED        // Budget projection
  COMMITTED        // Purchase order issued
  INVOICED         // Invoice received
  APPROVED         // Invoice approved for payment
  PAID             // Payment processed
  DISPUTED         // Invoice under dispute
}

model Sponsorship {
  id          String   @id @default(cuid())
  budgetId    String
  budget      EventBudget @relation(fields: [budgetId], references: [id], onDelete: Cascade)
  sponsorName String
  contactName String?
  contactEmail String?
  amount      Float
  currency    String   @default("USD")
  coversCategory BudgetCategory? // null = general fund
  status      String   // PLEDGED, CONFIRMED, RECEIVED, CANCELLED
  receivedAt  DateTime?
  notes       String?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([budgetId])
}
```

#### 12.30.2 Budget Dashboard

```
Event Budget: 38th AU Summit                    Status: ACTIVE
Total Budget: $2,450,000      Spent: $1,892,000 (77%)     Remaining: $558,000

┌──────────────────┬───────────┬───────────┬───────────┬──────────┬─────────┐
│ Category         │ Budgeted  │ Committed │ Actual    │ Variance │ Status  │
├──────────────────┼───────────┼───────────┼───────────┼──────────┼─────────┤
│ Venue            │  $400,000 │  $400,000 │  $400,000 │     $0   │ PAID    │
│ Catering         │  $350,000 │  $280,000 │  $310,000 │  -$40,000│ ⚠ OVER │
│ Transport        │  $280,000 │  $250,000 │  $220,000 │  +$60,000│ OK      │
│ Accommodation    │  $500,000 │  $480,000 │  $475,000 │  +$25,000│ OK      │
│ Interpretation   │  $120,000 │  $100,000 │   $50,100 │  +$69,900│ PARTIAL │
│ Printing         │   $80,000 │   $75,000 │   $72,000 │   +$8,000│ OK      │
│ Staff            │  $200,000 │  $180,000 │  $165,000 │  +$35,000│ OK      │
│ Security         │  $150,000 │  $150,000 │  $120,000 │  +$30,000│ OK      │
│ Protocol         │   $70,000 │   $60,000 │   $55,000 │  +$15,000│ OK      │
│ Contingency      │  $200,000 │        $0 │   $24,900 │ +$175,100│ OK      │
│ Other            │  $100,000 │   $80,000 │        $0 │ +$100,000│ —       │
├──────────────────┼───────────┼───────────┼───────────┼──────────┼─────────┤
│ TOTAL            │$2,450,000 │$2,055,000 │$1,892,000 │ +$558,000│         │
└──────────────────┴───────────┴───────────┴───────────┴──────────┴─────────┘

Sponsorships: $500,000 received of $600,000 pledged
Net cost to organization: $1,392,000

Cost per participant: $1,892,000 / 2,400 = $788/person
```

**Auto-populated actuals:** Interpretation costs auto-flow from Section 12.23 cost tracking. Transport costs from vehicle fleet fuel/rental records. Accommodation from room block rates × nights. This eliminates manual double-entry.

### 12.31 Risk Assessment & Contingency Planning

#### 12.31.1 Data Model

```prisma
model RiskRegister {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  title       String
  description String
  category    RiskCategory
  likelihood  Int      // 1-5 (1=Rare, 5=Almost Certain)
  impact      Int      // 1-5 (1=Negligible, 5=Catastrophic)
  riskScore   Int      // likelihood × impact (auto-calculated)
  status      RiskStatus @default(IDENTIFIED)

  // Mitigation
  mitigationPlan   String?
  mitigationOwner  String?  // userId
  mitigationStatus String?  // NOT_STARTED, IN_PROGRESS, COMPLETED

  // Contingency (if risk materializes)
  contingencyPlan  String?
  contingencyOwner String?

  // Monitoring
  triggerCondition String?  // "Registration exceeds 90% of capacity"
  monitoringField  String?  // "participant_count" — links to real-time data
  monitoringThreshold Float? // 0.9 (90%)
  isTriggered      Boolean  @default(false)

  // Post-event review
  didMaterialize   Boolean?
  actualImpact     String?
  lessonsLearned   String?

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([eventId, riskScore])
  @@index([eventId, status])
}

enum RiskCategory {
  SECURITY        // Terrorism, crowd control, VIP safety
  HEALTH          // Pandemic, food poisoning, medical emergency
  WEATHER         // Storms, extreme heat, flooding
  TECHNICAL       // Power failure, IT outage, AV malfunction
  LOGISTICS       // Transport delays, supply chain, vendor no-show
  POLITICAL       // Diplomatic incident, protest, boycott
  FINANCIAL       // Budget overrun, sponsor withdrawal, currency fluctuation
  REPUTATIONAL    // Negative press, social media crisis
  OPERATIONAL     // Staff shortage, overcrowding, registration delays
  LEGAL           // Compliance violation, contract dispute
}

enum RiskStatus {
  IDENTIFIED
  ASSESSED
  MITIGATING
  ACCEPTED      // Risk accepted, no further action
  CLOSED        // Risk no longer relevant
  MATERIALIZED  // Risk event occurred
}
```

#### 12.31.2 Risk Matrix Visualization

```
                        IMPACT
           1-Negligible  2-Minor  3-Moderate  4-Major  5-Catastrophic
          ┌──────────┬─────────┬──────────┬─────────┬──────────────┐
5-Almost  │          │         │  ⬤ Over- │ ⬤ Power │  ⬤ Terrorist │
  Certain │   LOW    │  MEDIUM │  crowd   │ failure │    threat    │
          ├──────────┼─────────┼──────────┼─────────┼──────────────┤
4-Likely  │          │         │ ⬤ Reg    │⬤ VIP    │              │
          │   LOW    │  MEDIUM │ delays   │ cancel  │    HIGH      │
L         ├──────────┼─────────┼──────────┼─────────┼──────────────┤
I  3-Poss │          │⬤ Vendor │⬤ Food   │         │              │
K         │   LOW    │ no-show │  safety  │  HIGH   │   CRITICAL   │
E         ├──────────┼─────────┼──────────┼─────────┼──────────────┤
L  2-Unl  │          │⬤ Badge  │          │⬤ Prot-  │              │
I         │   LOW    │printer  │  MEDIUM  │  est    │   CRITICAL   │
H         │          │ fail    │          │         │              │
O         ├──────────┼─────────┼──────────┼─────────┼──────────────┤
O  1-Rare │          │         │          │         │ ⬤ Earthquake │
D         │   LOW    │   LOW   │   LOW    │ MEDIUM  │              │
          └──────────┴─────────┴──────────┴─────────┴──────────────┘

Legend: GREEN = Low (1-4) | YELLOW = Medium (5-9) | ORANGE = High (10-16) | RED = Critical (17-25)
```

#### 12.31.3 Real-Time Risk Monitoring

Risks with `monitoringField` and `monitoringThreshold` are evaluated by a background job:

```typescript
async function evaluateRiskTriggers(eventId: string) {
  const risks = await prisma.riskRegister.findMany({
    where: { eventId, monitoringField: { not: null }, isTriggered: false },
  })

  for (const risk of risks) {
    const currentValue = await getMetricValue(eventId, risk.monitoringField!)
    if (currentValue >= risk.monitoringThreshold!) {
      await prisma.riskRegister.update({
        where: { id: risk.id },
        data: { isTriggered: true, status: 'MATERIALIZED' },
      })
      // Alert risk owner and command center
      await createNotification(risk.mitigationOwner, 'SYSTEM', `Risk triggered: ${risk.title}`)
      // Display on command center alert feed
    }
  }
}

async function getMetricValue(eventId: string, field: string): Promise<number> {
  switch (field) {
    case 'registration_capacity_ratio':
      const count = await prisma.participant.count({ where: { eventId, deletedAt: null } })
      const capacity = await getEventCapacity(eventId)
      return count / capacity
    case 'incident_count_today':
      return await prisma.incident.count({
        where: { eventId, reportedAt: { gte: startOfDay(new Date()) } },
      })
    case 'budget_variance_ratio':
      // actual / budgeted from EventBudget
    // ... other metrics
  }
}
```

#### 12.31.4 Contingency Procedures & Checklists

```prisma
model EventChecklist {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  name        String   // "Pre-Event Setup", "Day-Of Operations", "Emergency: Power Failure"
  category    String   // PRE_EVENT, DAY_OF, POST_EVENT, EMERGENCY
  assignedTo  String?  // userId or team name
  dueDate     DateTime?
  status      String   // NOT_STARTED, IN_PROGRESS, COMPLETED
  completedAt DateTime?
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  items       ChecklistItem[]

  @@index([eventId, category])
}

model ChecklistItem {
  id          String   @id @default(cuid())
  checklistId String
  checklist   EventChecklist @relation(fields: [checklistId], references: [id], onDelete: Cascade)
  order       Int
  description String
  isCompleted Boolean  @default(false)
  completedBy String?
  completedAt DateTime?
  notes       String?

  @@index([checklistId])
}
```

Example emergency checklist:

```
EMERGENCY PROCEDURE: Venue Power Failure

  ☐ 1. Confirm power outage scope (full venue vs. partial)
  ☐ 2. Contact venue facilities manager: +251-XXX-XXXX
  ☐ 3. Activate backup generators (Building A: rooftop, Building B: basement)
  ☐ 4. Deploy staff with flashlights to all exits
  ☐ 5. Broadcast to all participants: "Technical issue, please remain calm"
  ☐ 6. Pause all active sessions
  ☐ 7. If > 30 min: activate evacuation procedure for sessions in windowless rooms
  ☐ 8. Notify VIP security detail
  ☐ 9. Update command center status board
  ☐ 10. When restored: test all AV equipment before resuming sessions
  ☐ 11. Log incident in incident management system
  ☐ 12. Notify affected session chairs of delay duration
```

### 12.32 Sustainability & Carbon Tracking

#### 12.32.1 Data Model

```prisma
model CarbonFootprint {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  event       Event    @relation(fields: [tenantId], references: [id], onDelete: Cascade)

  // Travel emissions (auto-calculated from participant data)
  airTravelKgCO2      Float  @default(0)
  groundTransportKgCO2 Float @default(0)

  // Venue & operations
  venueEnergyKgCO2    Float  @default(0) // From venue utility data
  cateringKgCO2       Float  @default(0) // Based on meal types and counts
  printingKgCO2       Float  @default(0) // Paper volume × emission factor

  // Offsets
  offsetsPurchasedKgCO2 Float @default(0)
  offsetVendor        String?
  offsetCertificateUrl String?

  // Paper tracking
  badgesPrinted       Int    @default(0)
  digitalBadgesIssued Int    @default(0)
  documentsDigitized  Int    @default(0)
  estimatedPaperSavedKg Float @default(0)

  totalKgCO2          Float  @default(0) // Sum of all emission categories
  netKgCO2            Float  @default(0) // total - offsets

  calculatedAt        DateTime @default(now())
  updatedAt           DateTime @updatedAt

  @@unique([tenantId, eventId])
}
```

#### 12.32.2 Carbon Calculation Methodology

**Air travel** (typically 70-80% of event carbon):

```typescript
async function calculateAirTravelEmissions(eventId: string) {
  const participants = await prisma.participant.findMany({
    where: { eventId, status: { not: 'CANCELLED' }, deletedAt: null },
    include: { nationality: true },
  })

  let totalKgCO2 = 0

  for (const p of participants) {
    // Get approximate flight distance from participant's country to event city
    const distanceKm = getFlightDistance(p.nationality.code, eventCity)

    // ICAO emission factors (kg CO2 per passenger-km)
    // Short-haul (<1500km): 0.156 | Medium (1500-4000km): 0.131 | Long-haul (>4000km): 0.115
    const factor = distanceKm < 1500 ? 0.156 : distanceKm < 4000 ? 0.131 : 0.115

    // Round trip × radiative forcing multiplier (1.9 for high-altitude emissions)
    totalKgCO2 += distanceKm * 2 * factor * 1.9
  }

  return totalKgCO2
}
```

**Catering** (from meal data in Section 12.16):

```typescript
// Emission factors per meal type (kg CO2)
const mealFactors = {
  standard: 3.8,      // Mixed meat/fish
  vegetarian: 1.7,
  vegan: 0.9,
  halal: 3.5,         // Similar to standard
  kosher: 3.5,
}

async function calculateCateringEmissions(eventId: string) {
  // Aggregate dietary requirements from participant customData
  const dietaryCounts = await aggregateDietaryData(eventId)
  const totalMeals = getTotalMealCount(eventId) // meals per day × days × participants

  let totalKgCO2 = 0
  for (const [type, count] of Object.entries(dietaryCounts)) {
    totalKgCO2 += count * (mealFactors[type] || mealFactors.standard)
  }
  return totalKgCO2
}
```

#### 12.32.3 Sustainability Dashboard

```
Sustainability Report - 38th AU Summit

CARBON FOOTPRINT
  Total: 4,850 tonnes CO2e
  ┌───────────────────────────────────────────────────────────┐
  │  Air Travel          ██████████████████████████ 3,880t (80%)
  │  Ground Transport    ██░░░░░░░░░░░░░░░░░░░░░░░   340t  (7%)
  │  Catering            █░░░░░░░░░░░░░░░░░░░░░░░░   290t  (6%)
  │  Venue Energy        █░░░░░░░░░░░░░░░░░░░░░░░░   240t  (5%)
  │  Printing            ░░░░░░░░░░░░░░░░░░░░░░░░░   100t  (2%)
  └───────────────────────────────────────────────────────────┘

  Offsets purchased: 5,000t CO2e ($75,000 via Gold Standard)
  Net footprint: -150t CO2e ✓ CARBON NEUTRAL

PAPERLESS IMPACT
  Badges: 1,800 digital / 600 printed (75% digital adoption)
  Documents: 12,400 pages avoided through digital distribution
  Paper saved: ~62 kg (equivalent to 1 tree)

vs. PREVIOUS EVENT (37th Summit)
  Carbon: 5,200t → 4,850t (-6.7%)
  Digital badge adoption: 45% → 75% (+30%)
  Paper saved: 38kg → 62kg (+63%)
```

### 12.33 Multi-Venue & Zone Coordination

#### 12.33.1 Data Model

```prisma
model EventZone {
  id          String   @id @default(cuid())
  tenantId    String
  tenant      Tenant   @relation(fields: [tenantId], references: [id], onDelete: Cascade)
  eventId     String
  event       Event    @relation(fields: [eventId], references: [id], onDelete: Cascade)
  name        String   // "Registration Zone", "Conference Zone", "VIP Zone"
  code        String   // "REG", "CONF", "VIP"
  type        ZoneType
  venueId     String?  // Which venue this zone is in
  venue       Venue?   @relation(fields: [venueId], references: [id])
  color       String?  // For maps and badges: "#3B82F6"
  capacity    Int?
  currentOccupancy Int @default(0) // Real-time from access control scans

  // Access rules: which badge types / participant types can enter
  accessRules Json     @default("[]")
  // [{"participantTypes": ["Minister","Head of State"]}, {"staffRoles": ["PROTOCOL_OFFICER"]}]

  // Operating hours
  operatingHours Json  @default("{}")
  // {"mon": {"open":"06:00","close":"22:00"}, "tue": {...}}

  // Zone manager
  managerId   String?  // userId responsible for this zone

  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  accessLogs  ZoneAccessLog[]

  @@unique([tenantId, eventId, code])
  @@index([eventId])
}

enum ZoneType {
  REGISTRATION    // Badge pickup, document check
  CONFERENCE      // Meeting rooms, plenary halls
  EXHIBITION      // Booths, displays
  VIP             // Restricted VIP lounges
  PRESS           // Media center, press room
  CATERING        // Restaurants, coffee stations
  SERVICE         // Staff areas, storage, ops room
  PARKING         // Linked to ParkingZone
  MEDICAL         // First aid, medical station
  SECURITY        // Screening checkpoints
  SOCIAL          // Networking areas, reception venues
}

model ZoneAccessLog {
  id          String    @id @default(cuid())
  zoneId      String
  zone        EventZone @relation(fields: [zoneId], references: [id], onDelete: Cascade)
  participantId String?
  staffId     String?
  direction   String    // ENTRY, EXIT
  result      String    // ALLOWED, DENIED_ACCESS, DENIED_CAPACITY, DENIED_HOURS
  scannedAt   DateTime  @default(now())

  @@index([zoneId, scannedAt])
  @@index([participantId, scannedAt])
}

model InterZoneShuttle {
  id          String   @id @default(cuid())
  tenantId    String
  eventId     String
  name        String   // "Conference Centre ↔ Hotel Sheraton"
  fromZoneId  String
  toZoneId    String
  departureTime DateTime
  estimatedDuration Int // Minutes
  capacity    Int
  vehicleId   String?  // Linked to Vehicle record
  driverId    String?  // Linked to StaffMember
  status      String   // SCHEDULED, BOARDING, IN_TRANSIT, ARRIVED, CANCELLED
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([eventId, departureTime])
  @@index([fromZoneId])
}
```

#### 12.33.2 Zone Operations Dashboard

Each zone has a dedicated dashboard accessible to the zone manager and the central command center:

```
ZONE: CONFERENCE (Building A)                     Zone Manager: David M.
Status: OPERATIONAL      Occupancy: 485/600 (81%)     ████████████████░░░░

ROOMS STATUS                             ACTIVE STAFF
┌─────────────────┬──────┬──────────┐    ┌─────────────────────────────┐
│ Plenary Hall    │ 480  │ IN USE   │    │ Ushers:     8/10 on duty   │
│ Conf Room A     │  95  │ IN USE   │    │ Security:   4/4 on duty    │
│ Conf Room B     │  80  │ SETUP    │    │ IT Support: 2/2 on duty    │
│ Bilateral 1     │  12  │ IN USE   │    │ Protocol:   3/3 on duty    │
│ Bilateral 2     │   0  │ READY    │    │ Medical:    1/1 on duty    │
│ Bilateral 3     │   0  │ READY    │    │ Coverage gap: Usher Gate B │
│ Press Center    │  32  │ IN USE   │    │   12:00-13:00 (lunch)      │
└─────────────────┴──────┴──────────┘    └─────────────────────────────┘

NEXT 2 HOURS                             INCIDENTS
┌─────────────────────────────────────┐  ┌────────────────────────────┐
│ 11:00 Committee on Peace (Room A)   │  │ ⚠ Projector issue Room B  │
│ 11:00 Political Affairs (Room B)    │  │   Assigned: IT Support     │
│ 11:30 Bilateral: Kenya-Ethiopia     │  │   Status: IN_PROGRESS      │
│ 12:00 Lunch break (Catering Zone)   │  │                            │
│ 13:00 Plenary resumes              │  │ No other active incidents  │
└─────────────────────────────────────┘  └────────────────────────────┘

SHUTTLES TO THIS ZONE
  Next arrival: 10:45 from Hotel Sheraton (12 passengers)
  Next arrival: 10:50 from Hotel Hilton (8 passengers)
```

#### 12.33.3 Central Command Center Aggregation

The command center (Section 12.17) aggregates all zones into a unified view:

```
┌─ COMMAND CENTER ───────────────────────────────────────────────────────┐
│                                                                         │
│  ZONE STATUS MAP                        ALERT FEED                     │
│  ┌─────────────────────────────┐       ┌─────────────────────────────┐ │
│  │                             │       │ 10:42 ⚠ CONF: Room B proj- │ │
│  │   [REG]  ──shuttle──  [CONF]│       │        ector malfunction    │ │
│  │   480/600    ↕       485/600│       │ 10:38 ✓ VIP: H.E. Ruto     │ │
│  │              ↕              │       │        arrived, escorted    │ │
│  │   [PARK]            [VIP]   │       │ 10:35 ⚠ PARK: P2 at 90%   │ │
│  │   607/900    ↕       28/40  │       │        capacity             │ │
│  │              ↕              │       │ 10:30 ✓ REG: Morning rush   │ │
│  │   [PRESS]  ──shuttle── [CAT]│       │        complete, queue < 5  │ │
│  │    32/50             210/400│       │ 10:22 ● MED: Minor first    │ │
│  │                             │       │        aid, resolved         │ │
│  └─────────────────────────────┘       └─────────────────────────────┘ │
│                                                                         │
│  OVERALL METRICS                        QUICK ACTIONS                  │
│  Participants on-site: 1,842           [Emergency Broadcast]           │
│  Staff on-duty: 156/180               [Pause All Sessions]            │
│  Active incidents: 1                   [Close All Gates]              │
│  Shuttles in transit: 3               [Activate Contingency]          │
│  Meals served today: 1,420/2,400                                      │
│                                                                         │
└─────────────────────────────────────────────────────────────────────────┘
```

#### 12.33.4 Inter-Zone Coordination

When a participant's personal agenda includes sessions in different zones, the system:

1. Detects zone transitions needed between consecutive agenda items
2. Calculates travel time between zones
3. If walking distance: shows wayfinding directions in the participant app
4. If shuttle required: suggests next available shuttle and adds it to agenda
5. If insufficient transit time: warns participant ("You have 15 minutes between sessions in different buildings — shuttle departs at 10:45, arrives 10:55, session starts 11:00")

When an incident in one zone requires resources from another:

```
Incident in VIP Zone (medical) → Medical staff in VIP zone occupied
  → System checks: Medical zone has available staff
  → Auto-notification to Medical zone manager: "Medical support requested in VIP Zone"
  → Medical zone dispatches staff
  → Cross-zone incident log updated
  → Command center sees unified view of all incident response
```

---

## 13. Settings & Configuration Management

The settings system is the control plane for the entire platform. Every module — authentication, workflow, email, badge printing, catering, transport — has configurable parameters that admins need to adjust without code changes. A poorly designed settings system forces developers to hardcode values or add environment variables for every tweak. A well-designed one provides a unified, auditable, tenant-aware configuration layer that can be changed at runtime, cached for performance, and overridden per tenant.

### 13.1 Architecture Overview

```
┌─────────────────────────────────────────────────────────────────┐
│                    SETTINGS HIERARCHY                            │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                    DEFAULT VALUES                        │    │
│  │  Hardcoded in code — fallback when nothing is configured │    │
│  └────────────────────────────┬──────────────────────────── │    │
│                               ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  GLOBAL SETTINGS                         │    │
│  │  SystemSetting where tenantId = null                     │    │
│  │  Set by platform admin — applies to all tenants          │    │
│  └────────────────────────────┬──────────────────────────── │    │
│                               ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  TENANT SETTINGS                         │    │
│  │  SystemSetting where tenantId = :tenantId                │    │
│  │  Set by tenant admin — overrides global for this tenant  │    │
│  └────────────────────────────┬──────────────────────────── │    │
│                               ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  EVENT SETTINGS                          │    │
│  │  EventSetting where eventId = :eventId                   │    │
│  │  Set per event — overrides tenant for this event         │    │
│  └────────────────────────────┬──────────────────────────── │    │
│                               ▼                                  │
│  ┌─────────────────────────────────────────────────────────┐    │
│  │                  USER PREFERENCES                        │    │
│  │  UserPreference where userId = :userId                   │    │
│  │  Personal preferences — language, theme, notifications   │    │
│  └─────────────────────────────────────────────────────────┘    │
│                                                                  │
│  Resolution order: User → Event → Tenant → Global → Default    │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.2 Data Model

```prisma
enum SettingType {
  STRING
  NUMBER
  BOOLEAN
  JSON
  ENUM
  SECRET    // Encrypted at rest, masked in UI
}

enum SettingScope {
  GLOBAL
  TENANT
  EVENT
  USER
}

model SystemSetting {
  id          String       @id @default(cuid())
  key         String       // Dot-notation: "auth.maxLoginAttempts", "email.senderAddress"
  value       String       // Stored as string, parsed based on type
  type        SettingType  @default(STRING)
  scope       SettingScope @default(GLOBAL)
  category    String       // "auth", "email", "upload", "workflow", "badge", "catering", etc.
  label       String       // Human-readable: "Maximum Login Attempts"
  description String?      // Help text: "Number of failed attempts before account lockout"
  tenantId    String?      // null = global, set = tenant-specific override
  eventId     String?      // null = tenant-wide, set = event-specific override
  isSecret    Boolean      @default(false) // Mask value in UI, encrypt in DB
  validationRule Json?     // { min: 1, max: 100 } or { enum: ["A", "B", "C"] } or { pattern: "^[a-z]+$" }
  dependsOn   String?      // Key of another setting this depends on
  createdAt   DateTime     @default(now())
  updatedAt   DateTime     @updatedAt

  @@unique([key, tenantId, eventId])
  @@index([category])
  @@index([tenantId])
  @@index([eventId])
  @@index([scope])
}

model SettingAuditLog {
  id          String   @id @default(cuid())
  settingKey  String
  previousValue String?
  newValue    String
  tenantId    String?
  eventId     String?
  changedBy   String   // userId
  changeReason String? // Optional reason for the change
  changedAt   DateTime @default(now())

  @@index([settingKey, changedAt])
  @@index([changedBy, changedAt])
  @@index([tenantId, changedAt])
}

model UserPreference {
  id          String   @id @default(cuid())
  userId      String
  key         String   // "language", "theme", "timezone", "notifications.email", "ui.defaultPageSize"
  value       String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([userId, key])
  @@index([userId])
}

model FeatureFlag {
  id          String   @id @default(cuid())
  key         String   // "feature.bilateralScheduler", "feature.digitalBadge", "feature.carbonTracking"
  enabled     Boolean  @default(false)
  tenantId    String?  // null = global, set = tenant-specific
  description String?
  rolloutPercentage Int? // For gradual rollout: 0-100
  enabledForRoles String[] // Only enable for specific roles
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@unique([key, tenantId])
  @@index([tenantId])
}
```

### 13.3 Settings Categories

The platform organizes settings into logical categories. Each category maps to a tab in the admin settings UI.

#### 13.3.1 Authentication & Security

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `auth.maxLoginAttempts` | Max Login Attempts | 5 | NUMBER | Failed attempts before lockout |
| `auth.lockoutDurationMinutes` | Lockout Duration | 30 | NUMBER | Minutes locked out after max attempts |
| `auth.autoResetAfterMinutes` | Auto Reset | 60 | NUMBER | Minutes until failed attempt counter resets |
| `auth.maxLockCount` | Max Lock Count | 3 | NUMBER | Lockouts before permanent lock (admin unlock required) |
| `auth.sessionExpirationDays` | Session Expiration | 30 | NUMBER | Days until session expires |
| `auth.inactivityTimeoutMinutes` | Inactivity Timeout | 60 | NUMBER | Minutes of inactivity before forced logout |
| `auth.bcryptSaltRounds` | Bcrypt Salt Rounds | 10 | NUMBER | Password hashing strength |
| `auth.requireTwoFactor` | Require 2FA | false | BOOLEAN | Force 2FA for all users |
| `auth.passwordMinLength` | Min Password Length | 8 | NUMBER | Minimum password characters |
| `auth.passwordRequireSpecial` | Require Special Char | true | BOOLEAN | Require special characters in passwords |

#### 13.3.2 Email & Communication

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `email.senderAddress` | Sender Email | DoNotReply@accreditation.africanunion.org | STRING | From address for all emails |
| `email.senderName` | Sender Name | Accreditation System | STRING | From name displayed |
| `email.sendTimeoutSeconds` | Send Timeout | 180 | NUMBER | Timeout for email delivery |
| `email.maxRetriesPerMessage` | Max Retries | 3 | NUMBER | Retry count for failed deliveries |
| `email.dailySendLimit` | Daily Send Limit | 10000 | NUMBER | Max emails per day (rate limit) |
| `sms.enabled` | SMS Enabled | false | BOOLEAN | Enable SMS notifications |
| `sms.providerApiKey` | SMS API Key | — | SECRET | SMS provider credentials |
| `push.enabled` | Push Notifications | false | BOOLEAN | Enable push notifications |

#### 13.3.3 File Uploads & Storage

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `upload.maxImageSizeMB` | Max Image Size | 3 | NUMBER | Maximum image file size in MB |
| `upload.maxDocumentSizeMB` | Max Document Size | 10 | NUMBER | Maximum document file size in MB |
| `upload.maxCsvSizeMB` | Max CSV Size | 5 | NUMBER | Maximum CSV import file size |
| `upload.allowedImageTypes` | Allowed Image Types | ["jpeg","jpg","png","webp"] | JSON | Accepted image MIME types |
| `upload.allowedDocumentTypes` | Allowed Doc Types | ["pdf","doc","docx"] | JSON | Accepted document types |
| `upload.photoMinWidth` | Min Photo Width | 400 | NUMBER | Minimum photo width in pixels |
| `upload.photoMinHeight` | Min Photo Height | 500 | NUMBER | Minimum photo height in pixels |
| `storage.containerName` | Storage Container | accreditation | STRING | Azure Blob container name |

#### 13.3.4 Workflow & Approval

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `workflow.defaultSlaHours` | Default SLA | 24 | NUMBER | Default hours for step completion |
| `workflow.slaWarningThresholdPercent` | SLA Warning | 75 | NUMBER | % of SLA before warning indicator |
| `workflow.autoEscalateOnSlaBreach` | Auto-Escalate | false | BOOLEAN | Auto-escalate when SLA breached |
| `workflow.batchApprovalLimit` | Batch Limit | 100 | NUMBER | Max participants in one batch action |
| `workflow.requireRejectionReason` | Require Reason | true | BOOLEAN | Force validators to give rejection reason |
| `workflow.allowBypassWithoutTarget` | Allow Bypass | false | BOOLEAN | Allow bypass even if no target step |

#### 13.3.5 Badge & Printing

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `badge.maxReprintCount` | Max Reprints | 3 | NUMBER | Maximum badge reprints per participant |
| `badge.reprintWarningThreshold` | Reprint Warning | 2 | NUMBER | Reprint count that triggers warning |
| `badge.defaultDpi` | Default DPI | 150 | NUMBER | Badge rendering resolution |
| `badge.enableDigitalBadge` | Digital Badge | false | BOOLEAN | Enable Apple/Google Wallet badges |
| `badge.printQueueBatchSize` | Print Batch Size | 20 | NUMBER | Badges per print batch |

#### 13.3.6 Catering

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `catering.bufferPercentage` | Buffer % | 10 | NUMBER | Meal count buffer for over-ordering |
| `catering.allowDoubleCollection` | Allow Double | false | BOOLEAN | Allow same meal voucher twice |
| `catering.voucherExpiryMinutes` | Voucher Expiry | 30 | NUMBER | Minutes after meal end voucher expires |
| `catering.vendorPortalEnabled` | Vendor Portal | true | BOOLEAN | Enable vendor read-only dashboard |
| `catering.vendorLinkExpiryHours` | Vendor Link Expiry | 168 | NUMBER | Hours until vendor portal link expires |

#### 13.3.7 Transport

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `transport.pickupBufferMinutes` | Pickup Buffer | 45 | NUMBER | Minutes after flight arrival for pickup |
| `transport.noShowAlertMinutes` | No-Show Alert | 60 | NUMBER | Minutes without pickup before alert |
| `transport.gpsTrackingEnabled` | GPS Tracking | false | BOOLEAN | Enable real-time vehicle tracking |
| `transport.shuttleMinFrequency` | Min Shuttle Freq | 15 | NUMBER | Minimum minutes between shuttle runs |

#### 13.3.8 Accommodation

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `accommodation.autoAssignOnApproval` | Auto-Assign Room | true | BOOLEAN | Auto-assign room when participant approved |
| `accommodation.noShowReleaseHours` | No-Show Release | 24 | NUMBER | Hours after check-in date to release room |
| `accommodation.roomingListFormat` | Rooming List Format | PDF | ENUM | PDF or EXCEL for rooming list export |

#### 13.3.9 Waitlist

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `waitlist.enabled` | Enable Waitlist | true | BOOLEAN | Waitlist instead of reject when quota full |
| `waitlist.promotionDeadlineHours` | Promotion Deadline | 48 | NUMBER | Hours to confirm after promotion |
| `waitlist.maxPositionNotifications` | Position Notif. | 5 | NUMBER | Max position-change notifications per entry |
| `waitlist.autoExpireOnEventStart` | Auto-Expire | true | BOOLEAN | Expire all waitlist entries when event starts |

#### 13.3.10 Incident & Safety

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `incident.autoEscalateMinutes` | Auto-Escalate | 15 | NUMBER | Minutes before auto-escalation |
| `incident.criticalAlertSms` | Critical SMS | true | BOOLEAN | Send SMS for CRITICAL incidents |
| `incident.requireResolutionNotes` | Require Notes | true | BOOLEAN | Force resolution notes when closing |

#### 13.3.11 Data & Compliance

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `compliance.passportExpiryMonths` | Passport Expiry Check | 6 | NUMBER | Months before event passport must be valid |
| `compliance.dataRetentionDays` | Data Retention | 365 | NUMBER | Default days to retain participant data |
| `compliance.gdprEnabled` | GDPR Mode | true | BOOLEAN | Enable GDPR consent tracking and erasure |
| `compliance.autoComplianceCheck` | Auto Check | true | BOOLEAN | Run compliance check daily |

#### 13.3.12 System & Infrastructure

| Key | Label | Default | Type | Description |
|-----|-------|---------|------|-------------|
| `cache.ttlMinutes` | Cache TTL | 5 | NUMBER | Default cache duration in minutes |
| `pagination.defaultPageSize` | Page Size | 10 | NUMBER | Default items per page |
| `maintenance.enabled` | Maintenance Mode | false | BOOLEAN | Block non-admin access |
| `maintenance.message` | Maintenance Message | System temporarily unavailable... | STRING | Message shown during maintenance |
| `backup.retentionDays` | Backup Retention | 30 | NUMBER | Days to keep backups |
| `backup.maxCount` | Max Backups | 10 | NUMBER | Maximum backup files |
| `otp.validityMinutes` | OTP Validity | 10 | NUMBER | Minutes OTP code is valid |

### 13.4 User Preferences

User preferences are personal to each user and do not affect system behavior for other users. They are stored in the `UserPreference` model.

#### 13.4.1 Available Preferences

| Key | Label | Default | Options | Description |
|-----|-------|---------|---------|-------------|
| `ui.theme` | Theme | system | light, dark, system | Color theme preference |
| `ui.language` | Language | en | en, fr, ar, pt | UI language |
| `ui.timezone` | Timezone | UTC | IANA timezone | Display timezone |
| `ui.dateFormat` | Date Format | YYYY-MM-DD | YYYY-MM-DD, DD/MM/YYYY, MM/DD/YYYY | Date display format |
| `ui.defaultPageSize` | Page Size | 10 | 10, 25, 50, 100 | Preferred items per page |
| `ui.sidebarCollapsed` | Sidebar | false | true, false | Remember sidebar state |
| `notifications.emailEnabled` | Email Notifications | true | true, false | Receive email notifications |
| `notifications.smsEnabled` | SMS Notifications | false | true, false | Receive SMS notifications |
| `notifications.pushEnabled` | Push Notifications | true | true, false | Receive push notifications |
| `notifications.digestMode` | Digest Mode | immediate | immediate, hourly, daily | Notification batching |
| `notifications.quietHoursStart` | Quiet Start | — | HH:MM | Suppress notifications after |
| `notifications.quietHoursEnd` | Quiet End | — | HH:MM | Resume notifications after |
| `workflow.autoRefresh` | Auto-Refresh Queue | true | true, false | SSE auto-refresh validator queue |
| `workflow.soundOnNew` | Sound on New | true | true, false | Audio alert on new request |

#### 13.4.2 Preferences UI Wireframe

```
┌─────────────────────────────────────────────────────────────────┐
│  Settings — Preferences                                         │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Appearance                                                      │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Theme          (●) Light  ( ) Dark  ( ) System          │   │
│  │ Language        [English ▾]                               │   │
│  │ Timezone        [Africa/Addis_Ababa ▾]                   │   │
│  │ Date Format     [YYYY-MM-DD ▾]                           │   │
│  │ Items per page  [25 ▾]                                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Notifications                                                   │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Email notifications     [✓]  Receive email alerts       │   │
│  │ SMS notifications       [ ]  Receive SMS alerts          │   │
│  │ Push notifications      [✓]  Browser push alerts         │   │
│  │ Delivery mode           (●) Immediate  ( ) Hourly digest │   │
│  │ Quiet hours             [22:00] to [07:00]               │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Workflow                                                        │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │ Auto-refresh queue      [✓]  Live updates via SSE       │   │
│  │ Sound on new request    [✓]  Play chime for new items   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  [Save Preferences]  [Reset to Defaults]                        │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.5 Admin Settings UI

#### 13.5.1 Global Settings Page

Platform-level admin settings accessible at `/admin/settings`. Uses a tabbed interface with one tab per category.

```
┌─────────────────────────────────────────────────────────────────┐
│  System Settings                                    [Audit Log] │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  [Auth] [Email] [Upload] [Workflow] [Badge] [Catering] ...     │
│  ─────                                                           │
│                                                                  │
│  Authentication & Security                                       │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │                                                          │   │
│  │  Max Login Attempts              [5        ] NUMBER      │   │
│  │  Number of failed attempts before account lockout        │   │
│  │  [Save]  [Reset to Default: 5]                           │   │
│  │                                                          │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │                                                          │   │
│  │  Lockout Duration (minutes)      [30       ] NUMBER      │   │
│  │  Minutes locked out after max attempts                   │   │
│  │  [Save]  [Reset to Default: 30]                          │   │
│  │                                                          │   │
│  │  ─────────────────────────────────────────────────────── │   │
│  │                                                          │   │
│  │  Require Two-Factor Auth         [OFF ●───] BOOLEAN      │   │
│  │  Force 2FA for all users                                 │   │
│  │  [Save]  [Reset to Default: OFF]                         │   │
│  │                                                          │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 13.5.2 Tenant Settings Page

Tenant admins see settings for their tenant at `/admin/tenants/:tenantId/settings`. Shows global default alongside tenant override.

```
┌─────────────────────────────────────────────────────────────────┐
│  Tenant Settings — African Union Commission                     │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Max Login Attempts                                              │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Global default:  5                                      │   │
│  │  Tenant override: [3        ]  (overrides global)        │   │
│  │  [Save Override]  [Use Global Default]                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Email Sender Address                                            │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Global default:  DoNotReply@accreditation.africanunion.org│  │
│  │  Tenant override: [accred@au.int      ]                  │   │
│  │  [Save Override]  [Use Global Default]                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 13.5.3 Event Settings Page

Event-specific overrides at `/admin/events/:eventId/settings`. Shows the resolution chain: event → tenant → global.

```
┌─────────────────────────────────────────────────────────────────┐
│  Event Settings — 38th AU Summit                                │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Catering Buffer %                                               │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Global default:  10%                                    │   │
│  │  Tenant setting:  10% (using global)                     │   │
│  │  Event override:  [15       ]%  (this event has more     │   │
│  │                                  dietary variety)        │   │
│  │  [Save Override]  [Use Tenant Default]                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
│  Waitlist Promotion Deadline (hours)                             │
│  ┌──────────────────────────────────────────────────────────┐   │
│  │  Global default:  48                                     │   │
│  │  Tenant setting:  48 (using global)                      │   │
│  │  Event override:  [24       ]  (shorter deadline for     │   │
│  │                                 this urgent event)       │   │
│  │  [Save Override]  [Use Tenant Default]                   │   │
│  └──────────────────────────────────────────────────────────┘   │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.6 Feature Flags

Feature flags control which platform capabilities are available. New features (bilateral scheduler, digital badges, carbon tracking) roll out behind flags, enabling gradual deployment and tenant-specific enabling.

```
Admin opens Feature Flags page:

┌─────────────────────────────────────────────────────────────────┐
│  Feature Flags                                     [Add Flag]   │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  ┌────────────────────────┬─────────┬──────────┬──────────────┐ │
│  │ Feature                │ Global  │ AU Comm. │ ECOWAS       │ │
│  ├────────────────────────┼─────────┼──────────┼──────────────┤ │
│  │ Bilateral Scheduler    │  OFF    │   ON ✓   │   OFF        │ │
│  │ Digital Badge (Wallet) │  OFF    │   ON ✓   │   OFF        │ │
│  │ Carbon Tracking        │  OFF    │   OFF    │   OFF        │ │
│  │ Catering Module        │  ON ✓   │   ON ✓   │   ON ✓       │ │
│  │ Transport Module       │  ON ✓   │   ON ✓   │   OFF        │ │
│  │ Survey Module          │  OFF    │   ON ✓   │   OFF        │ │
│  │ Kiosk Mode             │  ON ✓   │   ON ✓   │   ON ✓       │ │
│  │ Companion Program      │  OFF    │   OFF    │   OFF        │ │
│  └────────────────────────┴─────────┴──────────┴──────────────┘ │
│                                                                  │
│  Feature flags control module visibility in the admin sidebar,  │
│  API endpoint availability, and route access. Disabled features │
│  return 404 and are hidden from navigation.                     │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

#### 13.6.1 Feature Flag Resolution

```
Request to /admin/events/:eventId/bilateral-meetings
  → Middleware checks: isFeatureEnabled("feature.bilateralScheduler", tenantId)
  → Resolution:
    1. Check FeatureFlag WHERE key AND tenantId → found, enabled: true → ✓ ALLOW
    2. If not found for tenant → check global (tenantId = null)
    3. If not found globally → feature is OFF by default
  → If disabled: return 404, route not rendered, sidebar link hidden
  → If enabled: proceed to route handler

Sidebar navigation:
  → For each nav item, check feature flag
  → Only render links for enabled features
  → Prevents confusion: users never see disabled features
```

### 13.7 Settings Resolution Engine

The settings utility provides a unified API for reading settings anywhere in the server code:

```typescript
// Resolution order: Event → Tenant → Global → Default
async function getSetting<T>(
  key: SettingKey,
  context?: { tenantId?: string; eventId?: string }
): Promise<T> {
  // 1. Check cache first
  const cached = cache.get(buildCacheKey(key, context))
  if (cached) return cached as T

  // 2. If eventId provided, check event-specific override
  if (context?.eventId) {
    const eventSetting = await db.systemSetting.findUnique({
      where: { key_tenantId_eventId: { key, tenantId: context.tenantId, eventId: context.eventId } }
    })
    if (eventSetting) return parseValue(eventSetting) as T
  }

  // 3. If tenantId provided, check tenant-specific override
  if (context?.tenantId) {
    const tenantSetting = await db.systemSetting.findUnique({
      where: { key_tenantId_eventId: { key, tenantId: context.tenantId, eventId: null } }
    })
    if (tenantSetting) return parseValue(tenantSetting) as T
  }

  // 4. Check global setting
  const globalSetting = await db.systemSetting.findUnique({
    where: { key_tenantId_eventId: { key, tenantId: null, eventId: null } }
  })
  if (globalSetting) return parseValue(globalSetting) as T

  // 5. Return hardcoded default
  return DefaultSettings[key].defaultValue as T
}
```

**Caching strategy:**
- Default TTL: 5 minutes (configurable via `cache.ttlMinutes`)
- Short TTL (10 seconds): `maintenance.enabled`, `maintenance.message` — time-sensitive
- Cache invalidation: on every `updateSetting()` call, clear the affected cache key
- Cache key format: `settings:${key}:${tenantId}:${eventId}`

### 13.8 Settings Audit Trail

Every settings change is logged for compliance and troubleshooting:

```
Admin changes "auth.maxLoginAttempts" from 5 to 3:
  → SettingAuditLog created:
    settingKey: "auth.maxLoginAttempts"
    previousValue: "5"
    newValue: "3"
    tenantId: "tenant_au"
    changedBy: "user_admin1"
    changeReason: "Tightening security after incident"
    changedAt: 2026-02-10T14:30:00Z

Admin Settings → [Audit Log]:
┌─────────────────────────────────────────────────────────────────┐
│  Settings Audit Log                      [Filter ▾] [Export]    │
├─────────────────────────────────────────────────────────────────┤
│                                                                  │
│  Feb 10, 14:30  auth.maxLoginAttempts  5 → 3                   │
│                 Changed by: Admin User | Tenant: AU Commission  │
│                 Reason: Tightening security after incident       │
│                                                                  │
│  Feb 10, 11:15  catering.bufferPercentage  10 → 15             │
│                 Changed by: Event Manager | Event: 38th Summit  │
│                 Reason: Higher dietary variety expected           │
│                                                                  │
│  Feb 9, 16:00   maintenance.enabled  false → true               │
│                 Changed by: System Admin | Global                │
│                 Reason: Scheduled maintenance window              │
│                                                                  │
└─────────────────────────────────────────────────────────────────┘
```

### 13.9 Settings Import/Export

```
Admin clicks [Export Settings]:
  → System generates JSON file with all settings for selected scope:
    {
      "exportedAt": "2026-02-10T14:30:00Z",
      "scope": "tenant",
      "tenantId": "tenant_au",
      "settings": [
        { "key": "auth.maxLoginAttempts", "value": "3", "type": "NUMBER", "category": "auth" },
        { "key": "email.senderAddress", "value": "accred@au.int", "type": "STRING", "category": "email" },
        ...
      ]
    }

Admin clicks [Import Settings]:
  → Upload JSON file
  → Preview: "23 settings will be updated, 5 will be created"
  → Diff view: shows which settings will change and from what to what
  → [Confirm Import]
  → All changes logged in SettingAuditLog with changeReason: "Bulk import"
```

### 13.10 Integration Points

| System | How Settings Are Used |
|--------|----------------------|
| Authentication | Login attempts, lockout, session duration, 2FA requirements |
| Workflow Engine | SLA thresholds, batch limits, escalation rules |
| Badge Printing | Reprint limits, DPI, digital badge toggle |
| Communication Hub | Sender address, daily limits, retry policies |
| Catering | Buffer percentage, voucher expiry, vendor portal toggle |
| Transport | Pickup buffer, no-show alerts, GPS toggle |
| Accommodation | Auto-assign toggle, no-show release timing |
| Waitlist | Enable/disable, promotion deadline, expiry behavior |
| Incident Management | Escalation timing, SMS alerts, resolution requirements |
| Compliance | Passport expiry check window, retention period, GDPR mode |
| Check-In / Access | Offline sync interval, capacity thresholds |
| Feature Flags | Module visibility, sidebar navigation, API access |
| All modules | Pagination page size, cache TTL, file upload limits |

---

## 14. Implementation Roadmap

### Phase 0: Foundation

| Item | Category | Deliverable |
|------|----------|-------------|
| Secret rotation | Security | Remove `.env` from repo, `.env.example` with placeholders, rotate all secrets |
| Testing framework | Quality | Vitest setup, workflow engine unit tests, MSW mocks |
| CI/CD pipeline | DevOps | GitHub Actions: lint → typecheck → test → build |
| Containerization | DevOps | Dockerfile + docker-compose for reproducible environments |
| Error tracking | Observability | Sentry integration |
| Structured logging | Observability | Pino replacing console.log/Morgan |
| Missing indexes | Performance | Standalone indexes on all FKs identified in analysis |
| Pre-commit hooks | Quality | Husky + lint-staged |
| User soft delete | Data | Add `deletedAt` to User, Workflow, WorkflowTemplate |
| Nonce-based CSP | Security | Replace `unsafe-inline` with per-request nonces |

### Phase 1: Dynamic Schema + Core Reliability

| Item | Category | Deliverable |
|------|----------|-------------|
| CustomFieldDef model | Dynamic Schema | Prisma migration + CRUD routes |
| `customData` JSONB column | Dynamic Schema | Add to Participant and Event models |
| Dynamic Zod validation | Dynamic Schema | `buildCustomDataSchema()` server utility |
| Dynamic form renderer | Dynamic Schema | `DynamicFieldRenderer` + `DynamicFieldSection` components |
| Custom field admin UI | Dynamic Schema | List, create, edit, reorder, delete field definitions |
| JSONB query layer | Dynamic Schema | `filterWithCustomFields()` + expression index management |
| Workflow versioning | Core | WorkflowVersion model, snapshot on participant entry |
| SLA enforcement | Core | Background job for overdue detection + email alerts |
| Optimistic locking | Core | Prevent concurrent actions on same participant |
| Rate limiting completeness | Security | Add limits to authenticated routes |
| File upload scanning | Security | ClamAV or Azure Defender integration |

### Phase 2: Visual Form Designer + UX

| Item | Category | Deliverable |
|------|----------|-------------|
| FormTemplate model | Form Designer | Prisma migration + CRUD routes |
| Form designer: three-panel UI | Form Designer | field-palette, design-canvas, properties-panel |
| Form designer: sections & pages | Form Designer | Sections with columns, pages as wizard steps |
| Form designer: drag-and-drop | Form Designer | @dnd-kit with nested sortable contexts |
| Form designer: conditional visibility | Form Designer | condition-builder component + evaluator |
| Form designer: preview mode | Form Designer | form-renderer shared between designer and registration |
| Section templates | Form Designer | Save/load reusable section layouts |
| SSE real-time updates | UX | Live queue updates for validator/printer/dispatcher |
| Notification system | Feature | Notification model + bell UI + SSE push |
| Global search | UX | Cross-event participant search bar |
| Keyboard shortcuts | UX | Hotkeys for approval workflow |
| Skeleton loading | UX | Loading states for data-heavy pages |

### Phase 3: Mobile + Intelligence

| Item | Category | Deliverable |
|------|----------|-------------|
| PWA + responsive views | UX | Mobile validator, printer, dispatcher interfaces |
| Offline mode | UX | Service Worker + IndexedDB for badge collection/printing |
| Delegation portal | Feature | Focal point self-service portal |
| Conditional workflow routing | Core | Step conditions for dynamic routing |
| Step assignment/reassignment | Core | StepAssignment model + admin UI |
| Auto-action rules | Core | Rule-based automatic workflow actions |
| Saved views | Feature | Airtable-style table/kanban/calendar views |
| Custom objects | Dynamic Schema | CustomObjectDef + CustomObjectRecord + admin CRUD |
| Analytics dashboard | Feature | Real-time operational intelligence with SSE |
| Internationalization | UX | react-i18next with en/fr/ar/pt |

### Phase 4: Ecosystem & Integrations

| Item | Category | Deliverable |
|------|----------|-------------|
| REST API | Platform | API endpoints with key auth + rate limiting |
| Webhook system | Platform | Event subscriptions for external integrations |
| Check-in/access control | Feature | QR scanner + AccessLog + venue occupancy |
| Communication hub | Feature | Broadcast messaging + SMS + email templates |
| Kiosk mode | Feature | Self-service participant terminal |
| Bulk operations center | Feature | CSV import/export + batch actions + undo |
| Template marketplace | Feature | Cross-tenant template sharing |
| Batch workflow actions | Core | First-class batch approve/reject/bypass |
| Parallel workflow paths | Core | Fork/join for simultaneous approvals |
| Duplicate detection & blacklist | Security | Passport/name/email matching + watchlist screening |
| Event cloning | Core | Deep clone with selective element copy |
| Waitlist management | Feature | Auto-waitlist, position tracking, auto-promote |
| Storybook | Dev | Component library documentation |

### Phase 5: Event Operations & Logistics

| Item | Category | Deliverable |
|------|----------|-------------|
| Accommodation management | Logistics | Hotels, room blocks, assignments, rooming lists |
| Transportation & logistics | Logistics | Airport transfers, shuttle scheduling, vehicle fleet |
| Catering & meal management | Logistics | Meal planning, dietary aggregation, meal vouchers |
| Parking & zone access | Logistics | Parking zones, permit generation, gate scanning |
| Venue & floor plan management | Logistics | Interactive floor plans, room booking, setup management |
| Protocol & seating management | Protocol | Visual seating designer, rank-based auto-assign, nameplates |
| Bilateral meeting scheduler | Protocol | Request/confirm flow, availability detection, room assignment |
| Companion & spouse program | Protocol | Companion registration, activity program, group management |
| Gift protocol & welcome packages | Protocol | Gift registry, package assembly, delivery tracking |
| Incident management | Safety | Logging, escalation, resolution tracking, map view |
| Live event command center | Operations | Multi-panel real-time dashboard for ops room |
| Staff & volunteer management | Operations | Roster, shift scheduling, check-in/out, skill-based assignment |
| Document expiry & compliance | Compliance | Passport alerts, data retention, GDPR, visa tracking |
| Post-event surveys | Feedback | Survey builder (reuse form designer), sentiment analysis |
| Certificate generation | Feature | Certificate designer (reuse badge designer), bulk generation |
| Recurring event series | Core | Year-over-year linking, carry-forward participants, cross-edition analytics |

### Phase 6: Platform Intelligence & Experience

| Item | Category | Deliverable |
|------|----------|-------------|
| Participant mobile app | Experience | Digital badge, personal agenda, self-service, networking |
| Digital wallet integration | Experience | Apple Wallet / Google Wallet badge passes |
| Interpretation services | Logistics | Language pair scheduling, interpreter rotation, equipment tracking |
| Media center & press ops | Feature | Press workspace, press conferences, interview requests, embargoes |
| Budget & financial management | Finance | Budget planning, actuals tracking, cost-per-participant, vendor management |
| Inventory & asset management | Logistics | Equipment catalog, check-out/return, deployment tracking |
| Risk assessment & contingency | Planning | Risk register, mitigation plans, contingency procedures, checklists |
| Sustainability & carbon tracking | Compliance | Carbon calculator, offset tracking, sustainability reporting |
| Multi-venue & zone coordination | Operations | Zone dashboards, inter-zone transport, cross-zone escalation |
| Networking features | Experience | Participant directory, meeting requests, QR contact exchange |
| Sponsor & exhibitor portal | Commercial | Sponsor visibility, booth management, lead retrieval (future) |

---

*This document defines the target architecture for the Accreditation Platform. Implementation follows the phased roadmap, with each phase building on the previous. Each phase delivers independently valuable functionality — the platform evolves from an accreditation tool (Phases 0-2) to an event management platform (Phases 3-4) to a complete event operations system (Phases 5-6).*
