-- CreateEnum
CREATE TYPE "RecurrencePattern" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "EventStatus" AS ENUM ('DRAFT', 'PUBLISHED', 'CANCELED', 'COMPLETED', 'POSTPONED', 'RESCHEDULED');

-- CreateEnum
CREATE TYPE "TemplateType" AS ENUM ('BADGE', 'FLYER', 'BANNER', 'LOGO');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'LOCKED', 'DELETED');

-- CreateEnum
CREATE TYPE "Priority" AS ENUM ('LOW', 'MEDIUM', 'HIGH');

-- CreateEnum
CREATE TYPE "Action" AS ENUM ('APPROVE', 'REJECT', 'NOTIFY', 'PRINT', 'COLLECT', 'ARCHIVE', 'CANCEL', 'BYPASS', 'REPRINT');

-- CreateEnum
CREATE TYPE "AccessLevel" AS ENUM ('OPEN', 'CLOSED');

-- CreateEnum
CREATE TYPE "ApprovalResult" AS ENUM ('SUCCESS', 'FAILURE', 'SKIPPED');

-- CreateEnum
CREATE TYPE "RequestStatus" AS ENUM ('PENDING', 'INPROGRESS', 'APPROVED', 'REJECTED', 'CANCELLED', 'PRINTED', 'COLLECTED', 'NOTIFIED', 'ARCHIVED', 'BYPASSED');

-- CreateEnum
CREATE TYPE "DocumentType" AS ENUM ('PASSPORT', 'PHOTO', 'LETTER', 'OTHER');

-- CreateEnum
CREATE TYPE "IdentityDocumentType" AS ENUM ('PASSPORT', 'NATIONAL_ID');

-- CreateEnum
CREATE TYPE "BadgeElementType" AS ENUM ('PHOTO', 'QR_CODE', 'TEXT', 'DYNAMIC_TEXT', 'IMAGE', 'SHAPE');

-- CreateEnum
CREATE TYPE "AuditAction" AS ENUM ('CREATE', 'UPDATE', 'DELETE', 'LOGIN', 'LOGIN_FAILED', 'LOGOUT', 'PASSWORD_RESET', 'PASSWORD_CHANGE', 'TWO_FACTOR_ENABLE', 'TWO_FACTOR_DISABLE', 'SESSION_REVOKE', 'APPROVE', 'REJECT', 'EXPORT', 'IMPORT', 'PRINT', 'COLLECT', 'BYPASS', 'REPRINT', 'IMPERSONATE', 'IMPERSONATE_END', 'VERIFY', 'OTHER');

-- CreateEnum
CREATE TYPE "AuditEntityType" AS ENUM ('TENANT', 'USER', 'ROLE', 'PERMISSION', 'MENU', 'MENU_ITEM', 'PARTICIPANT', 'PARTICIPANT_TYPE', 'EVENT', 'MEETING', 'MEETING_TYPE', 'VENUE', 'WORKFLOW', 'STEP', 'STEP_TEMPLATE', 'INVITATION', 'INVITATION_CONSTRAINT', 'TEMPLATE', 'BADGE_TEMPLATE', 'RESTRICTION', 'RESTRICTION_CONSTRAINT', 'COUNTRY', 'TITLE', 'SESSION', 'SYSTEM', 'BACKUP', 'EMAIL_TEMPLATE', 'BOX', 'OTHER');

-- CreateEnum
CREATE TYPE "BackupStatus" AS ENUM ('PENDING', 'IN_PROGRESS', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "BackupType" AS ENUM ('MANUAL', 'PRE_RESTORE');

-- CreateEnum
CREATE TYPE "RoleScope" AS ENUM ('GLOBAL', 'TENANT', 'EVENT');

-- CreateEnum
CREATE TYPE "SettingType" AS ENUM ('STRING', 'NUMBER', 'BOOLEAN', 'JSON');

-- CreateEnum
CREATE TYPE "EmailTrigger" AS ENUM ('REQUEST_RECEIVED', 'RETURNED_FOR_CORRECTION', 'BADGE_READY', 'BADGE_COLLECTED');

-- CreateEnum
CREATE TYPE "EmailStatus" AS ENUM ('PENDING', 'SENT', 'FAILED');

-- CreateEnum
CREATE TYPE "BoxSplit" AS ENUM ('INVITATION', 'TYPE', 'SURNAME', 'SIZE');

-- CreateEnum
CREATE TYPE "BoxMemberKind" AS ENUM ('INCLUDE', 'EXCLUDE');

-- CreateTable
CREATE TABLE "Tenant" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "phone" TEXT NOT NULL,
    "website" TEXT,
    "address" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zip" TEXT,
    "country" TEXT,
    "billingInfo" JSONB,
    "subscriptionPlan" TEXT NOT NULL,
    "featureFlags" JSONB,
    "usageMetrics" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Tenant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "name" TEXT,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "failedLoginAttempts" INTEGER NOT NULL DEFAULT 0,
    "lastFailedLoginAt" TIMESTAMP(3),
    "lockedAt" TIMESTAMP(3),
    "lockReason" TEXT,
    "lockCount" INTEGER NOT NULL DEFAULT 0,
    "autoUnlockAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "tenantId" TEXT,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserImage" (
    "id" TEXT NOT NULL,
    "altText" TEXT,
    "contentType" TEXT NOT NULL,
    "blob" BYTEA NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "UserImage_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Password" (
    "hash" TEXT NOT NULL,
    "userId" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expirationDate" TIMESTAMP(3) NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "metadata" JSONB,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "secret" TEXT NOT NULL,
    "algorithm" TEXT NOT NULL,
    "digits" INTEGER NOT NULL,
    "period" INTEGER NOT NULL,
    "charSet" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "scope" "RoleScope" NOT NULL DEFAULT 'EVENT',
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Permission" (
    "id" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "access" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Permission_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "link" TEXT NOT NULL,
    "icon" TEXT,
    "menuId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Venue" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "contactInfo" TEXT,
    "address" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "state" TEXT NOT NULL,
    "zip" TEXT NOT NULL,
    "country" TEXT NOT NULL,
    "capacity" INTEGER NOT NULL,
    "latitude" DOUBLE PRECISION,
    "longitude" DOUBLE PRECISION,
    "amenities" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Venue_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Template" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "templateType" "TemplateType" NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "participantTypeId" TEXT NOT NULL,
    "badgeTemplateId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Template_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" TEXT NOT NULL,
    "altText" TEXT,
    "contentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Event" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "status" "EventStatus" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Event_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Country" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Country_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Title" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Title_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "MeetingType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "MeetingType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantType" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "priority" "Priority" NOT NULL,
    "isExemptedFromFullQuota" BOOLEAN NOT NULL,
    "isExemptedFromOpenSessionQuota" BOOLEAN NOT NULL,
    "isExemptedFromClosedSessionQuota" BOOLEAN NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantType_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EventParticipantType" (
    "eventId" TEXT NOT NULL,
    "participantTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EventParticipantType_pkey" PRIMARY KEY ("eventId","participantTypeId")
);

-- CreateTable
CREATE TABLE "Meeting" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "venueId" TEXT NOT NULL,
    "meetingTypeId" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL,
    "startDate" TIMESTAMP(3) NOT NULL,
    "endDate" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Meeting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Restriction" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Restriction_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Constraint" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "restrictionId" TEXT NOT NULL,
    "participantTypeId" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL,
    "quota" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Constraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Workflow" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "participantTypeId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Workflow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Step" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "order" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "action" "Action" NOT NULL,
    "workflowId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "nextStepId" TEXT,
    "isRejectionTarget" BOOLEAN NOT NULL DEFAULT false,
    "isBypassTarget" BOOLEAN NOT NULL DEFAULT false,
    "requiresAssignment" BOOLEAN NOT NULL DEFAULT true,
    "slaDurationMinutes" INTEGER,
    "positionX" DOUBLE PRECISION,
    "positionY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Step_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "UserEventAccess" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "roleId" TEXT NOT NULL,
    "stepId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "UserEventAccess_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "WorkflowTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "tenantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "WorkflowTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StepTemplate" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "action" "Action" NOT NULL,
    "order" INTEGER NOT NULL,
    "roleId" TEXT NOT NULL,
    "workflowTemplateId" TEXT NOT NULL,
    "nextStepId" TEXT,
    "isRejectionTarget" BOOLEAN NOT NULL DEFAULT false,
    "isBypassTarget" BOOLEAN NOT NULL DEFAULT false,
    "requiresAssignment" BOOLEAN NOT NULL DEFAULT true,
    "slaDurationMinutes" INTEGER,
    "positionX" DOUBLE PRECISION,
    "positionY" DOUBLE PRECISION,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StepTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Invitation" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "organization" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "participantTypeId" TEXT,
    "restrictionId" TEXT,
    "maximumQuota" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Invitation_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "InvitationConstraint" (
    "id" TEXT NOT NULL,
    "invitationId" TEXT NOT NULL,
    "participantTypeId" TEXT NOT NULL,
    "accessLevel" "AccessLevel" NOT NULL,
    "quota" INTEGER,
    "sourceRestrictionId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "InvitationConstraint_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Participant" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "invitationId" TEXT,
    "participantTypeId" TEXT NOT NULL,
    "registrationCode" TEXT NOT NULL,
    "gender" TEXT NOT NULL,
    "titleId" TEXT NOT NULL,
    "firstName" TEXT NOT NULL,
    "familyName" TEXT NOT NULL,
    "dateOfBirth" TIMESTAMP(3) NOT NULL,
    "nationalityId" TEXT NOT NULL,
    "identityDocumentType" "IdentityDocumentType" NOT NULL DEFAULT 'PASSPORT',
    "passportNumber" TEXT NOT NULL,
    "passportExpiry" TIMESTAMP(3),
    "organization" TEXT NOT NULL,
    "jobTitle" TEXT NOT NULL,
    "countryId" TEXT NOT NULL,
    "city" TEXT NOT NULL,
    "email" TEXT,
    "website" TEXT,
    "telephone" TEXT,
    "address" TEXT,
    "preferredLanguage" TEXT,
    "needsVisa" BOOLEAN,
    "needsCarPass" BOOLEAN,
    "vehicleType" TEXT,
    "vehiclePlateNumber" TEXT,
    "needsCarFromOrganizer" BOOLEAN NOT NULL,
    "flightNumber" TEXT,
    "arrivalDate" TIMESTAMP(3),
    "wishList" TEXT,
    "attendClosedSession" BOOLEAN NOT NULL DEFAULT false,
    "attendExecutiveCouncilClosedSession" BOOLEAN NOT NULL DEFAULT false,
    "status" "RequestStatus" NOT NULL,
    "collectedBy" TEXT,
    "collectedByPhone" TEXT,
    "collectionNotes" TEXT,
    "collectedAt" TIMESTAMP(3),
    "reprintCount" INTEGER NOT NULL DEFAULT 0,
    "badgeVersion" INTEGER NOT NULL DEFAULT 1,
    "badgeRevokedAt" TIMESTAMP(3),
    "badgeRevokedReason" TEXT,
    "stepId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Participant_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ParticipantDocument" (
    "id" TEXT NOT NULL,
    "documentType" "DocumentType" NOT NULL,
    "altText" TEXT,
    "contentType" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "extension" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ParticipantDocument_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Approval" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "stepId" TEXT NOT NULL,
    "action" "Action" NOT NULL DEFAULT 'APPROVE',
    "result" "ApprovalResult" NOT NULL,
    "remarks" TEXT,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Approval_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" "AuditAction" NOT NULL,
    "entityType" "AuditEntityType" NOT NULL,
    "entityId" TEXT,
    "description" TEXT NOT NULL,
    "metadata" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BadgeTemplate" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "width" DOUBLE PRECISION NOT NULL DEFAULT 153,
    "height" DOUBLE PRECISION NOT NULL DEFAULT 243,
    "borderWidth" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "borderColor" TEXT NOT NULL DEFAULT '#000000',
    "borderRadius" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "elements" JSONB NOT NULL DEFAULT '[]',
    "badgeIdPrefix" TEXT NOT NULL DEFAULT 'BADGE',
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "BadgeTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SystemSetting" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "type" "SettingType" NOT NULL DEFAULT 'STRING',
    "category" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "description" TEXT,
    "tenantId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "SystemSetting_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "DatabaseBackup" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "sizeBytes" BIGINT NOT NULL,
    "status" "BackupStatus" NOT NULL DEFAULT 'PENDING',
    "backupType" "BackupType" NOT NULL DEFAULT 'MANUAL',
    "errorMessage" TEXT,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "DatabaseBackup_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CustomReport" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "dataSource" TEXT NOT NULL,
    "config" JSONB NOT NULL,
    "isPublic" BOOLEAN NOT NULL DEFAULT false,
    "tenantId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CustomReport_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "trigger" "EmailTrigger" NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "updatedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "EmailLog" (
    "id" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "trigger" "EmailTrigger" NOT NULL,
    "recipient" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "status" "EmailStatus" NOT NULL DEFAULT 'PENDING',
    "error" TEXT,
    "triggeredById" TEXT,
    "sentAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "EmailLog_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Box" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "eventId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "hasRule" BOOLEAN NOT NULL DEFAULT true,
    "participantTypeIds" TEXT[],
    "closedSessionOnly" BOOLEAN NOT NULL DEFAULT false,
    "position" INTEGER NOT NULL DEFAULT 0,
    "splitBy" "BoxSplit",
    "batchSize" INTEGER NOT NULL DEFAULT 25,
    "maxPerBox" INTEGER,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Box_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "BoxMember" (
    "boxId" TEXT NOT NULL,
    "participantId" TEXT NOT NULL,
    "kind" "BoxMemberKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoxMember_pkey" PRIMARY KEY ("boxId","participantId")
);

-- CreateTable
CREATE TABLE "BoxPlacement" (
    "participantId" TEXT NOT NULL,
    "boxId" TEXT NOT NULL,
    "splitBy" "BoxSplit",
    "part" TEXT,
    "printedById" TEXT,
    "printedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "BoxPlacement_pkey" PRIMARY KEY ("participantId")
);

-- CreateTable
CREATE TABLE "_RoleToUser" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_PermissionToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_MenuToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateTable
CREATE TABLE "_MenuItemToRole" (
    "A" TEXT NOT NULL,
    "B" TEXT NOT NULL
);

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_name_key" ON "Tenant"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Tenant_email_key" ON "Tenant"("email");

-- CreateIndex
CREATE INDEX "Tenant_name_email_idx" ON "Tenant"("name", "email");

-- CreateIndex
CREATE UNIQUE INDEX "User_email_key" ON "User"("email");

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "UserImage_userId_key" ON "UserImage"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Password_userId_key" ON "Password"("userId");

-- CreateIndex
CREATE INDEX "Session_userId_idx" ON "Session"("userId");

-- CreateIndex
CREATE UNIQUE INDEX "Verification_target_type_key" ON "Verification"("target", "type");

-- CreateIndex
CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

-- CreateIndex
CREATE UNIQUE INDEX "Permission_action_entity_access_key" ON "Permission"("action", "entity", "access");

-- CreateIndex
CREATE UNIQUE INDEX "Menu_name_key" ON "Menu"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MenuItem_menuId_name_link_key" ON "MenuItem"("menuId", "name", "link");

-- CreateIndex
CREATE UNIQUE INDEX "Venue_tenantId_name_key" ON "Venue"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Template_tenantId_eventId_templateType_name_key" ON "Template"("tenantId", "eventId", "templateType", "name");

-- CreateIndex
CREATE INDEX "Attachment_templateId_idx" ON "Attachment"("templateId");

-- CreateIndex
CREATE INDEX "Event_tenantId_name_idx" ON "Event"("tenantId", "name");

-- CreateIndex
CREATE INDEX "Event_tenantId_status_idx" ON "Event"("tenantId", "status");

-- CreateIndex
CREATE INDEX "Event_deletedAt_idx" ON "Event"("deletedAt");

-- CreateIndex
CREATE UNIQUE INDEX "Event_tenantId_name_key" ON "Event"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Event_tenantId_name_startDate_endDate_key" ON "Event"("tenantId", "name", "startDate", "endDate");

-- CreateIndex
CREATE UNIQUE INDEX "Title_name_key" ON "Title"("name");

-- CreateIndex
CREATE UNIQUE INDEX "MeetingType_tenantId_name_key" ON "MeetingType"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "ParticipantType_tenantId_name_key" ON "ParticipantType"("tenantId", "name");

-- CreateIndex
CREATE INDEX "EventParticipantType_participantTypeId_idx" ON "EventParticipantType"("participantTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Meeting_tenantId_eventId_meetingTypeId_venueId_accessLevel__key" ON "Meeting"("tenantId", "eventId", "meetingTypeId", "venueId", "accessLevel", "startDate", "endDate");

-- CreateIndex
CREATE INDEX "Restriction_eventId_name_idx" ON "Restriction"("eventId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "Restriction_tenantId_eventId_name_key" ON "Restriction"("tenantId", "eventId", "name");

-- CreateIndex
CREATE INDEX "Constraint_restrictionId_participantTypeId_idx" ON "Constraint"("restrictionId", "participantTypeId");

-- CreateIndex
CREATE UNIQUE INDEX "Constraint_tenantId_restrictionId_participantTypeId_accessL_key" ON "Constraint"("tenantId", "restrictionId", "participantTypeId", "accessLevel");

-- CreateIndex
CREATE INDEX "Workflow_eventId_participantTypeId_idx" ON "Workflow"("eventId", "participantTypeId");

-- CreateIndex
CREATE INDEX "Workflow_tenantId_idx" ON "Workflow"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "Workflow_tenantId_eventId_participantTypeId_name_key" ON "Workflow"("tenantId", "eventId", "participantTypeId", "name");

-- CreateIndex
CREATE INDEX "Step_workflowId_action_idx" ON "Step"("workflowId", "action");

-- CreateIndex
CREATE INDEX "Step_workflowId_isBypassTarget_idx" ON "Step"("workflowId", "isBypassTarget");

-- CreateIndex
CREATE INDEX "Step_workflowId_isRejectionTarget_idx" ON "Step"("workflowId", "isRejectionTarget");

-- CreateIndex
CREATE UNIQUE INDEX "Step_tenantId_workflowId_roleId_action_name_key" ON "Step"("tenantId", "workflowId", "roleId", "action", "name");

-- CreateIndex
CREATE INDEX "UserEventAccess_userId_idx" ON "UserEventAccess"("userId");

-- CreateIndex
CREATE INDEX "UserEventAccess_eventId_idx" ON "UserEventAccess"("eventId");

-- CreateIndex
CREATE INDEX "UserEventAccess_stepId_idx" ON "UserEventAccess"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "UserEventAccess_userId_eventId_roleId_stepId_key" ON "UserEventAccess"("userId", "eventId", "roleId", "stepId");

-- CreateIndex
CREATE UNIQUE INDEX "WorkflowTemplate_tenantId_name_key" ON "WorkflowTemplate"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "StepTemplate_workflowTemplateId_roleId_action_name_key" ON "StepTemplate"("workflowTemplateId", "roleId", "action", "name");

-- CreateIndex
CREATE INDEX "Invitation_tenantId_eventId_email_idx" ON "Invitation"("tenantId", "eventId", "email");

-- CreateIndex
CREATE UNIQUE INDEX "Invitation_tenantId_eventId_organization_email_key" ON "Invitation"("tenantId", "eventId", "organization", "email");

-- CreateIndex
CREATE INDEX "InvitationConstraint_invitationId_idx" ON "InvitationConstraint"("invitationId");

-- CreateIndex
CREATE INDEX "InvitationConstraint_sourceRestrictionId_idx" ON "InvitationConstraint"("sourceRestrictionId");

-- CreateIndex
CREATE UNIQUE INDEX "InvitationConstraint_invitationId_participantTypeId_accessL_key" ON "InvitationConstraint"("invitationId", "participantTypeId", "accessLevel");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_registrationCode_key" ON "Participant"("registrationCode");

-- CreateIndex
CREATE INDEX "Participant_deletedAt_idx" ON "Participant"("deletedAt");

-- CreateIndex
CREATE INDEX "Participant_eventId_stepId_status_idx" ON "Participant"("eventId", "stepId", "status");

-- CreateIndex
CREATE INDEX "Participant_tenantId_eventId_participantTypeId_idx" ON "Participant"("tenantId", "eventId", "participantTypeId");

-- CreateIndex
CREATE INDEX "Participant_status_createdAt_idx" ON "Participant"("status", "createdAt");

-- CreateIndex
CREATE INDEX "Participant_userId_idx" ON "Participant"("userId");

-- CreateIndex
CREATE INDEX "Participant_invitationId_idx" ON "Participant"("invitationId");

-- CreateIndex
CREATE INDEX "Participant_invitationId_participantTypeId_idx" ON "Participant"("invitationId", "participantTypeId");

-- CreateIndex
CREATE INDEX "Participant_invitationId_attendClosedSession_idx" ON "Participant"("invitationId", "attendClosedSession");

-- CreateIndex
CREATE INDEX "Participant_invitationId_attendExecutiveCouncilClosedSessio_idx" ON "Participant"("invitationId", "attendExecutiveCouncilClosedSession");

-- CreateIndex
CREATE UNIQUE INDEX "Participant_tenantId_eventId_passportNumber_key" ON "Participant"("tenantId", "eventId", "passportNumber");

-- CreateIndex
CREATE INDEX "ParticipantDocument_participantId_idx" ON "ParticipantDocument"("participantId");

-- CreateIndex
CREATE INDEX "Approval_participantId_createdAt_idx" ON "Approval"("participantId", "createdAt");

-- CreateIndex
CREATE INDEX "Approval_userId_createdAt_idx" ON "Approval"("userId", "createdAt");

-- CreateIndex
CREATE INDEX "Approval_stepId_idx" ON "Approval"("stepId");

-- CreateIndex
CREATE UNIQUE INDEX "Approval_participantId_stepId_userId_createdAt_key" ON "Approval"("participantId", "stepId", "userId", "createdAt");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_action_idx" ON "AuditLog"("tenantId", "action");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_entityType_entityId_idx" ON "AuditLog"("tenantId", "entityType", "entityId");

-- CreateIndex
CREATE INDEX "AuditLog_tenantId_userId_idx" ON "AuditLog"("tenantId", "userId");

-- CreateIndex
CREATE INDEX "AuditLog_createdAt_idx" ON "AuditLog"("createdAt");

-- CreateIndex
CREATE INDEX "BadgeTemplate_tenantId_idx" ON "BadgeTemplate"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "BadgeTemplate_tenantId_name_key" ON "BadgeTemplate"("tenantId", "name");

-- CreateIndex
CREATE INDEX "SystemSetting_category_idx" ON "SystemSetting"("category");

-- CreateIndex
CREATE INDEX "SystemSetting_tenantId_idx" ON "SystemSetting"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "SystemSetting_key_tenantId_key" ON "SystemSetting"("key", "tenantId");

-- CreateIndex
CREATE INDEX "DatabaseBackup_status_idx" ON "DatabaseBackup"("status");

-- CreateIndex
CREATE INDEX "DatabaseBackup_createdAt_idx" ON "DatabaseBackup"("createdAt");

-- CreateIndex
CREATE INDEX "CustomReport_tenantId_idx" ON "CustomReport"("tenantId");

-- CreateIndex
CREATE INDEX "CustomReport_createdById_idx" ON "CustomReport"("createdById");

-- CreateIndex
CREATE UNIQUE INDEX "CustomReport_tenantId_name_key" ON "CustomReport"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "EmailTemplate_eventId_trigger_key" ON "EmailTemplate"("eventId", "trigger");

-- CreateIndex
CREATE INDEX "EmailLog_participantId_createdAt_idx" ON "EmailLog"("participantId", "createdAt");

-- CreateIndex
CREATE INDEX "EmailLog_status_idx" ON "EmailLog"("status");

-- CreateIndex
CREATE UNIQUE INDEX "Box_eventId_name_key" ON "Box"("eventId", "name");

-- CreateIndex
CREATE INDEX "BoxMember_participantId_idx" ON "BoxMember"("participantId");

-- CreateIndex
CREATE INDEX "BoxPlacement_boxId_idx" ON "BoxPlacement"("boxId");

-- CreateIndex
CREATE UNIQUE INDEX "_RoleToUser_AB_unique" ON "_RoleToUser"("A", "B");

-- CreateIndex
CREATE INDEX "_RoleToUser_B_index" ON "_RoleToUser"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_PermissionToRole_AB_unique" ON "_PermissionToRole"("A", "B");

-- CreateIndex
CREATE INDEX "_PermissionToRole_B_index" ON "_PermissionToRole"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_MenuToRole_AB_unique" ON "_MenuToRole"("A", "B");

-- CreateIndex
CREATE INDEX "_MenuToRole_B_index" ON "_MenuToRole"("B");

-- CreateIndex
CREATE UNIQUE INDEX "_MenuItemToRole_AB_unique" ON "_MenuItemToRole"("A", "B");

-- CreateIndex
CREATE INDEX "_MenuItemToRole_B_index" ON "_MenuItemToRole"("B");

-- AddForeignKey
ALTER TABLE "User" ADD CONSTRAINT "User_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserImage" ADD CONSTRAINT "UserImage_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Password" ADD CONSTRAINT "Password_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Venue" ADD CONSTRAINT "Venue_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_participantTypeId_fkey" FOREIGN KEY ("participantTypeId") REFERENCES "ParticipantType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Template" ADD CONSTRAINT "Template_badgeTemplateId_fkey" FOREIGN KEY ("badgeTemplateId") REFERENCES "BadgeTemplate"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "Template"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Event" ADD CONSTRAINT "Event_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "MeetingType" ADD CONSTRAINT "MeetingType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantType" ADD CONSTRAINT "ParticipantType_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipantType" ADD CONSTRAINT "EventParticipantType_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EventParticipantType" ADD CONSTRAINT "EventParticipantType_participantTypeId_fkey" FOREIGN KEY ("participantTypeId") REFERENCES "ParticipantType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_venueId_fkey" FOREIGN KEY ("venueId") REFERENCES "Venue"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Meeting" ADD CONSTRAINT "Meeting_meetingTypeId_fkey" FOREIGN KEY ("meetingTypeId") REFERENCES "MeetingType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restriction" ADD CONSTRAINT "Restriction_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Restriction" ADD CONSTRAINT "Restriction_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_restrictionId_fkey" FOREIGN KEY ("restrictionId") REFERENCES "Restriction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Constraint" ADD CONSTRAINT "Constraint_participantTypeId_fkey" FOREIGN KEY ("participantTypeId") REFERENCES "ParticipantType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Workflow" ADD CONSTRAINT "Workflow_participantTypeId_fkey" FOREIGN KEY ("participantTypeId") REFERENCES "ParticipantType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_workflowId_fkey" FOREIGN KEY ("workflowId") REFERENCES "Workflow"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Step" ADD CONSTRAINT "Step_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEventAccess" ADD CONSTRAINT "UserEventAccess_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEventAccess" ADD CONSTRAINT "UserEventAccess_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEventAccess" ADD CONSTRAINT "UserEventAccess_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "UserEventAccess" ADD CONSTRAINT "UserEventAccess_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "WorkflowTemplate" ADD CONSTRAINT "WorkflowTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StepTemplate" ADD CONSTRAINT "StepTemplate_workflowTemplateId_fkey" FOREIGN KEY ("workflowTemplateId") REFERENCES "WorkflowTemplate"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_participantTypeId_fkey" FOREIGN KEY ("participantTypeId") REFERENCES "ParticipantType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Invitation" ADD CONSTRAINT "Invitation_restrictionId_fkey" FOREIGN KEY ("restrictionId") REFERENCES "Restriction"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationConstraint" ADD CONSTRAINT "InvitationConstraint_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationConstraint" ADD CONSTRAINT "InvitationConstraint_participantTypeId_fkey" FOREIGN KEY ("participantTypeId") REFERENCES "ParticipantType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "InvitationConstraint" ADD CONSTRAINT "InvitationConstraint_sourceRestrictionId_fkey" FOREIGN KEY ("sourceRestrictionId") REFERENCES "Restriction"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_invitationId_fkey" FOREIGN KEY ("invitationId") REFERENCES "Invitation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_participantTypeId_fkey" FOREIGN KEY ("participantTypeId") REFERENCES "ParticipantType"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_titleId_fkey" FOREIGN KEY ("titleId") REFERENCES "Title"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_nationalityId_fkey" FOREIGN KEY ("nationalityId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_countryId_fkey" FOREIGN KEY ("countryId") REFERENCES "Country"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Participant" ADD CONSTRAINT "Participant_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "ParticipantDocument" ADD CONSTRAINT "ParticipantDocument_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "Step"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Approval" ADD CONSTRAINT "Approval_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BadgeTemplate" ADD CONSTRAINT "BadgeTemplate_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "DatabaseBackup" ADD CONSTRAINT "DatabaseBackup_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomReport" ADD CONSTRAINT "CustomReport_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CustomReport" ADD CONSTRAINT "CustomReport_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailTemplate" ADD CONSTRAINT "EmailTemplate_updatedById_fkey" FOREIGN KEY ("updatedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "EmailLog" ADD CONSTRAINT "EmailLog_triggeredById_fkey" FOREIGN KEY ("triggeredById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "Tenant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_eventId_fkey" FOREIGN KEY ("eventId") REFERENCES "Event"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Box" ADD CONSTRAINT "Box_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxMember" ADD CONSTRAINT "BoxMember_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxMember" ADD CONSTRAINT "BoxMember_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxPlacement" ADD CONSTRAINT "BoxPlacement_participantId_fkey" FOREIGN KEY ("participantId") REFERENCES "Participant"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxPlacement" ADD CONSTRAINT "BoxPlacement_boxId_fkey" FOREIGN KEY ("boxId") REFERENCES "Box"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "BoxPlacement" ADD CONSTRAINT "BoxPlacement_printedById_fkey" FOREIGN KEY ("printedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD CONSTRAINT "_RoleToUser_A_fkey" FOREIGN KEY ("A") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_RoleToUser" ADD CONSTRAINT "_RoleToUser_B_fkey" FOREIGN KEY ("B") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Permission"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_PermissionToRole" ADD CONSTRAINT "_PermissionToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MenuToRole" ADD CONSTRAINT "_MenuToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MenuToRole" ADD CONSTRAINT "_MenuToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MenuItemToRole" ADD CONSTRAINT "_MenuItemToRole_A_fkey" FOREIGN KEY ("A") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "_MenuItemToRole" ADD CONSTRAINT "_MenuItemToRole_B_fkey" FOREIGN KEY ("B") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;

