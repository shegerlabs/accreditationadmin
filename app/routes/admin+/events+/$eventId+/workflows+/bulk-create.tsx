import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Form,
	useActionData,
	useLoaderData,
	useNavigate,
} from '@remix-run/react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import { Checkbox } from '~/components/ui/checkbox'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Label } from '~/components/ui/label'
import { RadioGroup, RadioGroupItem } from '~/components/ui/radio-group'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { auditRequest } from '~/utils/audit.server'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { getEventParticipantTypes } from '~/utils/event-participant-types.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'
import { createWorkflowFromTemplate } from '~/utils/workflow-clone.server'

const BulkCreateSchema = z
	.object({
		eventId: z.string(),
		tenantId: z.string(),
		templateId: z.string({ required_error: 'Template is required' }),
		scope: z.enum(['all', 'some']),
		participantTypeIds: z.array(z.string()),
	})
	.refine(data => data.scope === 'all' || data.participantTypeIds.length > 0, {
		message: 'Select at least one participant type',
		path: ['participantTypeIds'],
	})

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		select: { id: true, tenantId: true, name: true },
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	// Fetch workflow templates for the tenant
	const templates = await prisma.workflowTemplate.findMany({
		where: { tenantId: event.tenantId },
		select: { id: true, name: true, description: true },
		orderBy: { name: 'asc' },
	})

	const participantTypes = await getEventParticipantTypes(eventId!)

	// Get existing workflows to show which participant types already have workflows
	const existingWorkflows = await prisma.workflow.findMany({
		where: { eventId },
		select: { participantTypeId: true },
	})
	const existingParticipantTypeIds = new Set(
		existingWorkflows.map(w => w.participantTypeId),
	)

	return json({
		event,
		templates,
		participantTypes,
		existingParticipantTypeIds: Array.from(existingParticipantTypeIds),
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	// Parse participantTypeIds from form data (multiple checkboxes)
	const participantTypeIds = formData.getAll('participantTypeIds') as string[]

	const submission = parseWithZod(formData, {
		schema: BulkCreateSchema.transform(data => ({
			...data,
			participantTypeIds,
		})),
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const {
		templateId,
		tenantId,
		scope,
		participantTypeIds: selectedIds,
	} = submission.value

	// Get the event to find the tenant
	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { tenantId: true },
	})

	if (!event) {
		return json(
			{ result: submission.reply({ formErrors: ['Event not found'] }) },
			{ status: 400 },
		)
	}

	// Determine which participant types to create workflows for
	let targetParticipantTypeIds: string[]
	const allParticipantTypes = await getEventParticipantTypes(eventId!)

	if (scope === 'all') {
		const existingWorkflows = await prisma.workflow.findMany({
			where: { eventId },
			select: { participantTypeId: true },
		})
		const existingSet = new Set(existingWorkflows.map(w => w.participantTypeId))
		targetParticipantTypeIds = allParticipantTypes
			.filter(pt => !existingSet.has(pt.id))
			.map(pt => pt.id)
	} else {
		targetParticipantTypeIds = selectedIds.filter(id =>
			allParticipantTypes.some(pt => pt.id === id),
		)
	}

	// Fetch the template with its name
	const template = await prisma.workflowTemplate.findUnique({
		where: { id: templateId },
		select: { name: true },
	})

	if (!template) {
		return json(
			{ result: submission.reply({ formErrors: ['Template not found'] }) },
			{ status: 400 },
		)
	}

	// Fetch participant type names for workflow naming
	const participantTypes = await prisma.participantType.findMany({
		where: { id: { in: targetParticipantTypeIds } },
		select: { id: true, name: true },
	})

	const participantTypeMap = new Map(
		participantTypes.map(pt => [pt.id, pt.name]),
	)

	let createdCount = 0

	// Create workflow for each target participant type
	for (const participantTypeId of targetParticipantTypeIds) {
		const participantTypeName =
			participantTypeMap.get(participantTypeId) || 'Unknown'

		// Check if workflow already exists for this participant type
		const existing = await prisma.workflow.findFirst({
			where: {
				eventId,
				participantTypeId,
			},
		})

		if (existing) {
			continue // Skip if workflow already exists
		}

		await createWorkflowFromTemplate(prisma, {
			tenantId,
			eventId: eventId!,
			participantTypeId,
			participantTypeName,
			templateId,
			templateName: template.name,
		})

		createdCount++
	}

	// Log bulk workflow creation
	const user = await requireUserWithRoles(request, ['admin', 'tenant'])
	const eventDetails = await prisma.event.findUnique({
		where: { id: eventId },
		select: { id: true, name: true },
	})

	await auditRequest({
		request,
		action: AuditAction.CREATE,
		entityType: AuditEntityType.WORKFLOW,
		description: `Bulk created ${createdCount} workflow(s) for event "${eventDetails?.name}" from template "${template.name}"`,
		userId: user.id,
		tenantId,
		metadata: {
			bulkCreate: true,
			workflowsCreated: createdCount,
			templateId,
			templateName: template.name,
			event: {
				id: eventDetails?.id,
				name: eventDetails?.name,
			},
			scope,
			targetParticipantTypes: participantTypes
				.filter(pt => targetParticipantTypeIds.includes(pt.id))
				.map(pt => ({ id: pt.id, name: pt.name })),
		},
	})

	return redirectWithToast(`/admin/events/${eventId}/workflows`, {
		type: 'success',
		title: 'Workflows Created',
		description: `Successfully created ${createdCount} workflow${createdCount !== 1 ? 's' : ''} from template.`,
	})
}

export default function BulkCreateWorkflowsRoute() {
	const { event, templates, participantTypes, existingParticipantTypeIds } =
		useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigate = useNavigate()
	const isPending = useIsPending()
	const [scope, setScope] = useState<'all' | 'some'>('all')
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())

	const [form, fields] = useForm({
		id: 'bulk-create-workflows',
		constraint: getZodConstraint(BulkCreateSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			const participantTypeIds = formData.getAll(
				'participantTypeIds',
			) as string[]
			return parseWithZod(formData, {
				schema: BulkCreateSchema.transform(data => ({
					...data,
					participantTypeIds,
				})),
			})
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			eventId: event.id,
			tenantId: event.tenantId,
			scope: 'all',
		},
	})

	const handleClose = () => navigate(`/admin/events/${event.id}/workflows`)

	const existingSet = new Set(existingParticipantTypeIds)
	const availableParticipantTypes = participantTypes.filter(
		pt => !existingSet.has(pt.id),
	)

	if (templates.length === 0) {
		return (
			<Dialog open={true} onOpenChange={handleClose}>
				<DialogContent
					className="sm:max-w-[500px]"
					onInteractOutside={e => e.preventDefault()}
				>
					<DialogHeader>
						<DialogTitle>Bulk Create Workflows</DialogTitle>
						<DialogDescription>
							No workflow templates available. Please create a workflow template
							first.
						</DialogDescription>
					</DialogHeader>
					<p className="py-4 text-muted-foreground">
						Go to the tenant settings to create workflow templates.
					</p>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleClose}>
							Back
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		)
	}

	if (availableParticipantTypes.length === 0) {
		return (
			<Dialog open={true} onOpenChange={handleClose}>
				<DialogContent
					className="sm:max-w-[500px]"
					onInteractOutside={e => e.preventDefault()}
				>
					<DialogHeader>
						<DialogTitle>Bulk Create Workflows</DialogTitle>
						<DialogDescription>
							All participant types already have workflows for this event.
						</DialogDescription>
					</DialogHeader>
					<p className="py-4 text-muted-foreground">
						All participant types have been assigned workflows.
					</p>
					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleClose}>
							Back
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		)
	}

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="sm:max-w-[500px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Bulk Create Workflows</DialogTitle>
					<DialogDescription>
						Create workflows for multiple participant types from a template.
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<input type="hidden" name="eventId" value={event.id} />
					<input type="hidden" name="tenantId" value={event.tenantId} />

					<div className="grid gap-4 py-4">
						<Field>
							<Label htmlFor={fields.templateId.id}>Workflow Template</Label>
							<Select
								name={fields.templateId.name}
								defaultValue={fields.templateId.initialValue}
							>
								<SelectTrigger id={fields.templateId.id}>
									<SelectValue placeholder="Select a template" />
								</SelectTrigger>
								<SelectContent>
									{templates.map(template => (
										<SelectItem key={template.id} value={template.id}>
											{template.name}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
							{fields.templateId.errors && (
								<FieldError>{fields.templateId.errors}</FieldError>
							)}
						</Field>

						<Field>
							<Label>Create For</Label>
							{existingParticipantTypeIds.length > 0 && (
								<p className="mb-3 text-sm text-muted-foreground">
									{existingParticipantTypeIds.length} participant type(s)
									already have workflows and will be skipped.
								</p>
							)}
							<RadioGroup
								name="scope"
								defaultValue="all"
								onValueChange={value => setScope(value as 'all' | 'some')}
								className="space-y-3"
							>
								<div className="flex items-center space-x-3">
									<RadioGroupItem value="all" id="scope-all" />
									<Label
										htmlFor="scope-all"
										className="cursor-pointer font-normal"
									>
										All participant types ({availableParticipantTypes.length}{' '}
										available)
									</Label>
								</div>
								<div className="flex items-center space-x-3">
									<RadioGroupItem value="some" id="scope-some" />
									<Label
										htmlFor="scope-some"
										className="cursor-pointer font-normal"
									>
										Select specific participant types
									</Label>
								</div>
							</RadioGroup>
						</Field>

						{scope === 'some' && (
							<Field>
								<div className="flex items-center justify-between">
									<Label>Select Participant Types</Label>
									<Button
										type="button"
										variant="ghost"
										size="sm"
										onClick={() => {
											if (
												selectedIds.size === availableParticipantTypes.length
											) {
												setSelectedIds(new Set())
											} else {
												setSelectedIds(
													new Set(availableParticipantTypes.map(pt => pt.id)),
												)
											}
										}}
									>
										{selectedIds.size === availableParticipantTypes.length
											? 'Deselect All'
											: 'Select All'}
									</Button>
								</div>
								<div className="max-h-48 space-y-3 overflow-y-auto rounded-md border p-4">
									{availableParticipantTypes.map(pt => (
										<div key={pt.id} className="flex items-center space-x-3">
											<Checkbox
												id={`pt-${pt.id}`}
												name="participantTypeIds"
												value={pt.id}
												checked={selectedIds.has(pt.id)}
												onCheckedChange={checked => {
													const newSet = new Set(selectedIds)
													if (checked) {
														newSet.add(pt.id)
													} else {
														newSet.delete(pt.id)
													}
													setSelectedIds(newSet)
												}}
											/>
											<Label
												htmlFor={`pt-${pt.id}`}
												className="cursor-pointer font-normal"
											>
												{pt.name}
											</Label>
										</div>
									))}
								</div>
								{fields.participantTypeIds.errors && (
									<FieldError>{fields.participantTypeIds.errors}</FieldError>
								)}
							</Field>
						)}
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleClose}>
							Cancel
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? 'Creating...' : 'Create Workflows'}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
