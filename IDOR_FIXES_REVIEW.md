# IDOR Vulnerability Fixes Review

This document lists all the changes made to fix Insecure Direct Object Reference (IDOR) vulnerabilities in the codebase.

---

## 1. `app/routes/admin+/users+/$userId.edit.tsx`

### Before:
```typescript
import { requireAdminAccess } from '~/utils/auth.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireAdminAccess(request)
	const { userId } = params

	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			roles: true,
			tenant: { select: { id: true, name: true } },
		},
	})
```

### After:
```typescript
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)
	const { userId } = params

	const user = await prisma.user.findFirst({
		where: {
			id: userId,
			...tenantFilter,
		},
		include: {
			roles: true,
			tenant: { select: { id: true, name: true } },
		},
	})
```

**Change:** Added tenant filter to prevent tenant admins from editing users in other tenants.

---

## 2. `app/routes/admin+/users+/$userId.delete.tsx`

### Before:
```typescript
import { requireAdminAccess } from '~/utils/auth.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireAdminAccess(request)
	const { userId } = params

	const user = await prisma.user.findUnique({
		where: { id: userId },
		include: {
			roles: true,
			tenant: { select: { id: true, name: true } },
		},
	})
```

### After:
```typescript
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)
	const { userId } = params

	const user = await prisma.user.findFirst({
		where: {
			id: userId,
			...tenantFilter,
		},
		include: {
			roles: true,
			tenant: { select: { id: true, name: true } },
		},
	})
```

**Change:** Added tenant filter to prevent tenant admins from deleting users in other tenants.

---

## 3. `app/routes/admin+/participants+/$participantId_.delete.tsx`

### Before (Loader):
```typescript
import { requireUserWithRoles } from '~/utils/auth.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])
	const { participantId } = params

	const participant = await prisma.participant.findUnique({
		where: { id: participantId },
		include: { ... },
	})
```

### After (Loader):
```typescript
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)
	const { participantId } = params

	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			...tenantFilter,
		},
		include: { ... },
	})
```

### Before (Action):
```typescript
export async function action({ request }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])
	// ... validation ...

	// Soft delete - set deletedAt timestamp instead of actually deleting
	const participant = await prisma.participant.update({
		where: { id: submission.value.id },
		data: { deletedAt: new Date() },
		select: { ... },
	})
```

### After (Action):
```typescript
export async function action({ request }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	// ... validation ...

	// Verify participant belongs to the current user's tenant
	const existingParticipant = await prisma.participant.findFirst({
		where: {
			id: submission.value.id,
			...tenantFilter,
		},
	})

	invariantResponse(existingParticipant, 'Not Found', { status: 404 })

	// Soft delete - set deletedAt timestamp instead of actually deleting
	const participant = await prisma.participant.update({
		where: { id: submission.value.id },
		data: { deletedAt: new Date() },
		select: { ... },
	})
```

**Change:** Added tenant verification in both loader and action to prevent cross-tenant participant deletion.

---

## 4. `app/routes/resources+/user-images.$imageId.tsx`

### Before:
```typescript
import { LoaderFunctionArgs } from '@remix-run/node'
import { prisma } from '~/utils/db.server'

export async function loader({ params }: LoaderFunctionArgs) {
	const { imageId } = params

	if (!imageId) {
		throw new Response('Image ID required', { status: 400 })
	}

	const image = await prisma.userImage.findUnique({
		where: { id: imageId },
		select: {
			blob: true,
			contentType: true,
		},
	})

	if (!image) {
		throw new Response('Image not found', { status: 404 })
	}

	return new Response(image.blob, { ... })
}
```

### After:
```typescript
import { LoaderFunctionArgs } from '@remix-run/node'
import { requireUserId } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUserId = await requireUserId(request)
	const { imageId } = params

	if (!imageId) {
		throw new Response('Image ID required', { status: 400 })
	}

	const image = await prisma.userImage.findUnique({
		where: { id: imageId },
		select: {
			blob: true,
			contentType: true,
			userId: true,
		},
	})

	if (!image) {
		throw new Response('Image not found', { status: 404 })
	}

	// Check if current user can access this image
	// Users can view their own image, or admins can view images of users in their tenant
	if (image.userId !== currentUserId) {
		const currentUser = await prisma.user.findUnique({
			where: { id: currentUserId },
			select: {
				tenantId: true,
				roles: { select: { name: true, scope: true } },
			},
		})

		const isGlobalAdmin = currentUser?.roles.some(r => r.scope === 'GLOBAL')
		const isAdmin = currentUser?.roles.some(r =>
			['admin', 'tenant'].includes(r.name),
		)

		if (!isAdmin && !isGlobalAdmin) {
			throw new Response('Forbidden', { status: 403 })
		}

		// For tenant admins, verify the image owner belongs to their tenant
		if (!isGlobalAdmin && isAdmin) {
			const imageOwner = await prisma.user.findUnique({
				where: { id: image.userId },
				select: { tenantId: true },
			})

			if (imageOwner?.tenantId !== currentUser?.tenantId) {
				throw new Response('Forbidden', { status: 403 })
			}
		}
	}

	return new Response(image.blob, { ... })
}
```

**Change:** Added authentication requirement and authorization check. Users can only view their own images, or admins can view images of users within their tenant.

---

## 5. `app/routes/admin+/resources+/participants.$attachmentId.tsx`

### Before:
```typescript
import { type LoaderFunctionArgs } from '@remix-run/node'
import { prisma } from '~/utils/db.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const { attachmentId } = params
	// ...

	const attachment = await prisma.participantDocument.findUnique({
		where: { id: attachmentId },
		include: {
			participant: true,
		},
	})
```

### After:
```typescript
import { type LoaderFunctionArgs } from '@remix-run/node'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)

	const { attachmentId } = params
	// ...

	const attachment = await prisma.participantDocument.findFirst({
		where: {
			id: attachmentId,
			participant: tenantFilter,
		},
		include: {
			participant: true,
		},
	})
```

**Change:** Added admin access requirement and tenant filter to prevent cross-tenant participant document access.

---

## 6. `app/routes/admin+/resources+/attachments.$attachmentId.tsx`

### Before:
```typescript
import { type LoaderFunctionArgs } from '@remix-run/node'
import { prisma } from '~/utils/db.server'

export async function loader({ params }: LoaderFunctionArgs) {
	const { attachmentId } = params
	// ...

	const attachment = await prisma.attachment.findUnique({
		where: { id: attachmentId },
		select: { ... },
	})
```

### After:
```typescript
import { type LoaderFunctionArgs } from '@remix-run/node'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)

	const { attachmentId } = params
	// ...

	const attachment = await prisma.attachment.findFirst({
		where: {
			id: attachmentId,
			template: tenantFilter,
		},
		select: { ... },
	})
```

**Change:** Added admin access requirement and tenant filter to prevent cross-tenant template attachment access.

---

## 7. `app/routes/admin+/events+/$eventId+/index.tsx`

### Before:
```typescript
import { requireUserWithRoles } from '~/utils/auth.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { ... },
	})
```

### After:
```typescript
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)

	const { eventId } = params

	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...tenantFilter,
		},
		select: { ... },
	})
```

**Change:** Added tenant filter to prevent cross-tenant event access.

---

## 8. `app/routes/admin+/events+/$eventId+/workflows+/$workflowId.tsx`

### Before:
```typescript
import { requireUserWithRoles } from '~/utils/auth.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId } = params  // Bug: tenantId doesn't exist in params

	const participantTypes = await prisma.participantType.findMany({
		where: { tenantId },
	})
```

### After:
```typescript
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { invariantResponse } from '~/utils/misc'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)

	const { eventId } = params

	// Verify the event belongs to the current user's tenant
	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...tenantFilter,
		},
		select: { tenantId: true },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const participantTypes = await prisma.participantType.findMany({
		where: { tenantId: event.tenantId },
	})
```

**Change:** Fixed bug where `tenantId` was read from params (doesn't exist), now properly verifies event ownership and uses event's tenantId.

---

## 9. `app/routes/admin+/events+/$eventId+/workflows+/$workflowId.edit.tsx`

### Before:
```typescript
import { requireUserWithRoles } from '~/utils/auth.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId, workflowId } = params

	const event = await prisma.event.findUnique({
		select: { id: true, tenantId: true, name: true },
		where: { id: eventId },
	})

	const workflow = await prisma.workflow.findUnique({
		where: { id: workflowId },
	})
```

### After:
```typescript
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const currentUser = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(currentUser)

	const { eventId, workflowId } = params

	const event = await prisma.event.findFirst({
		select: { id: true, tenantId: true, name: true },
		where: {
			id: eventId,
			...tenantFilter,
		},
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	const workflow = await prisma.workflow.findFirst({
		where: {
			id: workflowId,
			event: tenantFilter,
		},
	})
```

**Change:** Added tenant filter to both event and workflow queries.

---

## 10. `app/routes/admin+/events+/$eventId+/workflows+/$workflowId.delete.tsx`

### Before (Loader):
```typescript
const event = await prisma.event.findUnique({
	select: { id: true, tenantId: true, name: true },
	where: { id: eventId },
})

const workflow = await prisma.workflow.findUnique({
	select: { ... },
	where: { id: workflowId },
})
```

### After (Loader):
```typescript
const event = await prisma.event.findFirst({
	select: { id: true, tenantId: true, name: true },
	where: {
		id: eventId,
		...tenantFilter,
	},
})

invariantResponse(event, 'Event not found', { status: 404 })

const workflow = await prisma.workflow.findFirst({
	select: { ... },
	where: {
		id: workflowId,
		event: tenantFilter,
	},
})
```

### Before (Action):
```typescript
const workflow = await prisma.workflow.findUnique({
	where: { id: workflowId },
	select: { ... },
})
```

### After (Action):
```typescript
const workflow = await prisma.workflow.findFirst({
	where: {
		id: workflowId,
		event: tenantFilter,
	},
	select: { ... },
})
```

**Change:** Added tenant filter to both loader and action to prevent cross-tenant workflow deletion.

---

## 11. `app/routes/admin+/events+/$eventId+/workflows+/__workflow-editor.server.tsx`

### Before (Delete):
```typescript
const workflowToDelete = await prisma.workflow.findUnique({
	where: { id: submission.value.id },
	select: { ... },
})

const workflow = await prisma.workflow.delete({
	select: { eventId: true },
	where: { id: submission.value.id },
})
```

### After (Delete):
```typescript
// Verify workflow belongs to the current user's tenant before deletion
const workflowToDelete = await prisma.workflow.findFirst({
	where: {
		id: submission.value.id,
		event: tenantFilter,
	},
	select: { ... },
})

invariantResponse(workflowToDelete, 'Workflow not found', { status: 404 })

const workflow = await prisma.workflow.delete({
	select: { eventId: true },
	where: { id: submission.value.id },
})
```

### Before (Create/Update):
```typescript
const { id: workflowId, name, templateId, ...data } = submission.value

const workflow = await prisma.workflow.upsert({
	select: { id: true },
	where: { id: workflowId ?? '__new_workflow__' },
	create: { ... },
	update: { ... },
})
```

### After (Create/Update):
```typescript
const { id: workflowId, name, templateId, ...data } = submission.value

// Verify the event belongs to the current user's tenant
const eventForWorkflow = await prisma.event.findFirst({
	where: {
		id: data.eventId,
		...tenantFilter,
	},
	select: { id: true },
})

invariantResponse(eventForWorkflow, 'Event not found', { status: 404 })

// If editing, verify the workflow belongs to the current user's tenant
if (workflowId) {
	const existingWorkflow = await prisma.workflow.findFirst({
		where: {
			id: workflowId,
			event: tenantFilter,
		},
		select: { id: true },
	})
	invariantResponse(existingWorkflow, 'Workflow not found', { status: 404 })
}

const workflow = await prisma.workflow.upsert({
	select: { id: true },
	where: { id: workflowId ?? '__new_workflow__' },
	create: { ... },
	update: { ... },
})
```

**Change:** Added tenant verification for delete, create, and update operations.

---

## 12. `app/routes/admin+/events+/$eventId+/workflows+/__step-editor.server.tsx`

### Before (Delete):
```typescript
const stepToDelete = await prisma.step.findUnique({
	where: { id: submission.value.id },
	select: { ... },
})

await prisma.step.delete({
	where: { id: submission.value.id },
})
```

### After (Delete):
```typescript
// Verify step belongs to current user's tenant
const stepToDelete = await prisma.step.findFirst({
	where: {
		id: submission.value.id,
		workflow: { event: tenantFilter },
	},
	select: { ... },
})

invariantResponse(stepToDelete, 'Step not found', { status: 404 })

await prisma.step.delete({
	where: { id: submission.value.id },
})
```

### Before (Create/Update):
```typescript
const { id: stepId, name, nextStepId, ...data } = submission.value

// Check if isRejectionTarget or isBypassTarget is changing
if (stepId) {
	const existingStep = await prisma.step.findUnique({
		where: { id: stepId },
		select: { isRejectionTarget: true, isBypassTarget: true },
	})
```

### After (Create/Update):
```typescript
const { id: stepId, name, nextStepId, ...data } = submission.value

// Verify the workflow belongs to the current user's tenant
const workflowForStep = await prisma.workflow.findFirst({
	where: {
		id: data.workflowId,
		event: tenantFilter,
	},
	select: { id: true },
})

invariantResponse(workflowForStep, 'Workflow not found', { status: 404 })

// Check if isRejectionTarget or isBypassTarget is changing
if (stepId) {
	// Verify existing step belongs to current user's tenant
	const existingStep = await prisma.step.findFirst({
		where: {
			id: stepId,
			workflow: { event: tenantFilter },
		},
		select: { isRejectionTarget: true, isBypassTarget: true },
	})
	invariantResponse(existingStep, 'Step not found', { status: 404 })
```

**Change:** Added tenant verification for delete, create, and update operations on workflow steps.

---

## Summary of Changes

| File | Vulnerability | Fix Applied |
|------|--------------|-------------|
| `$userId.edit.tsx` | Cross-tenant user editing | Added `getTenantFilter` with `findFirst` |
| `$userId.delete.tsx` | Cross-tenant user deletion | Added `getTenantFilter` with `findFirst` |
| `$participantId_.delete.tsx` | Cross-tenant participant deletion | Added tenant verification in loader and action |
| `user-images.$imageId.tsx` | Unauthenticated image access | Added auth check and tenant-based authorization |
| `participants.$attachmentId.tsx` | Cross-tenant document access | Added `requireAdminAccess` and tenant filter |
| `attachments.$attachmentId.tsx` | Cross-tenant attachment access | Added `requireAdminAccess` and tenant filter |
| `events/$eventId+/index.tsx` | Cross-tenant event access | Added tenant filter |
| `$workflowId.tsx` | Cross-tenant workflow access + bug | Fixed param bug, added tenant filter |
| `$workflowId.edit.tsx` | Cross-tenant workflow editing | Added tenant filter |
| `$workflowId.delete.tsx` | Cross-tenant workflow deletion | Added tenant filter in loader and action |
| `__workflow-editor.server.tsx` | Cross-tenant workflow CRUD | Added tenant verification for all operations |
| `__step-editor.server.tsx` | Cross-tenant step CRUD | Added tenant verification for all operations |

All changes use the `getTenantFilter()` helper which:
- Returns an empty filter `{}` for global admins (they can access everything)
- Returns `{ tenantId: user.tenantId }` for tenant admins (restricts to their tenant)
