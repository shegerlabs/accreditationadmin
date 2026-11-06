import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Form,
	useActionData,
	useLoaderData,
	useNavigate,
	useParams,
} from '@remix-run/react'
import { Prisma } from '@prisma/client'
import { useMemo, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import {
	DynamicBadge,
	ParticipantBadgeData,
	dbTemplateToConfig,
} from '~/components/badge-designer'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'
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
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { getEventParticipantTypes } from '~/utils/event-participant-types.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

// Sample participant data for badge preview
const SAMPLE_PARTICIPANT: ParticipantBadgeData = {
	badgeId: 'SAMPLE-001234',
	firstName: 'John',
	familyName: 'Doe',
	fullName: 'John Doe',
	title: 'Mr.',
	organization: 'Sample Organization',
	jobTitle: 'Software Engineer',
	country: 'Ethiopia',
	nationality: 'Ethiopian',
	email: 'john.doe@example.com',
	participantType: 'Delegate',
	eventName: 'Sample Event 2025',
	profileUrl: 'https://example.com/profile/sample',
	photoUrl: '/placeholder-avatar.jpg',
}

// Badge template type with full details
type BadgeTemplateWithDetails = {
	id: string
	name: string
	isDefault: boolean
	width: number
	height: number
	borderWidth: number
	borderColor: string
	borderRadius: number
	badgeIdPrefix: string
	elements: Prisma.JsonValue
}

const BulkCreateSchema = z
	.object({
		eventId: z.string(),
		tenantId: z.string(),
		badgeTemplateId: z.string({ required_error: 'Badge design is required' }),
		scope: z.enum(['all', 'some']),
		participantTypeIds: z.array(z.string()),
	})
	.refine(
		data => data.scope === 'all' || data.participantTypeIds.length > 0,
		{
			message: 'Select at least one participant type',
			path: ['participantTypeIds'],
		},
	)

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		select: { id: true, name: true, tenantId: true },
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	// Get all badge templates for this tenant
	const badgeTemplates = await prisma.badgeTemplate.findMany({
		where: { tenantId: event.tenantId },
		select: {
			id: true,
			name: true,
			isDefault: true,
			width: true,
			height: true,
			borderWidth: true,
			borderColor: true,
			borderRadius: true,
			badgeIdPrefix: true,
			elements: true,
		},
		orderBy: [{ isDefault: 'desc' }, { name: 'asc' }],
	})

	const defaultBadgeTemplate = badgeTemplates.find(t => t.isDefault)

	const participantTypes = await getEventParticipantTypes(event.id)

	// Get existing templates for this event to know which ones to skip
	const existingTemplates = await prisma.template.findMany({
		where: { eventId },
		select: { participantTypeId: true },
	})

	const existingParticipantTypeIds = existingTemplates.map(
		t => t.participantTypeId,
	)

	return json({
		event,
		badgeTemplates,
		defaultBadgeTemplate,
		participantTypes,
		existingParticipantTypeIds,
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

	const { scope, participantTypeIds: selectedIds, badgeTemplateId } = submission.value

	const event = await prisma.event.findUnique({
		select: { id: true, tenantId: true },
		where: { id: eventId },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	// Determine which participant types to create templates for
	let targetParticipantTypeIds: string[]
	const allParticipantTypes = await getEventParticipantTypes(event.id)

	if (scope === 'all') {
		// Get all participant types that don't already have templates
		const existingTemplates = await prisma.template.findMany({
			where: { eventId },
			select: { participantTypeId: true },
		})
		const existingSet = new Set(
			existingTemplates.map(t => t.participantTypeId),
		)

		targetParticipantTypeIds = allParticipantTypes
			.filter(pt => !existingSet.has(pt.id))
			.map(pt => pt.id)
	} else {
		targetParticipantTypeIds = selectedIds.filter(id =>
			allParticipantTypes.some(pt => pt.id === id),
		)
	}

	if (targetParticipantTypeIds.length === 0) {
		return redirectWithToast(`/admin/events/${eventId}/templates`, {
			type: 'message',
			title: 'No Templates Created',
			description: 'All selected participant types already have templates.',
		})
	}

	// Fetch participant type names for template naming
	const participantTypes = await prisma.participantType.findMany({
		where: { id: { in: targetParticipantTypeIds } },
		select: { id: true, name: true },
	})

	// Create templates for each participant type
	await prisma.template.createMany({
		data: participantTypes.map(pt => ({
			name: `Badge Template for ${pt.name}`,
			description: `Badge Template for ${pt.name}`,
			tenantId: event.tenantId,
			eventId: event.id,
			participantTypeId: pt.id,
			templateType: 'BADGE',
			badgeTemplateId,
		})),
	})

	return redirectWithToast(`/admin/events/${eventId}/templates`, {
		type: 'success',
		title: 'Templates Created',
		description: `Successfully created ${participantTypes.length} template${participantTypes.length !== 1 ? 's' : ''}.`,
	})
}

export default function BulkCreateTemplatesRoute() {
	const {
		event,
		badgeTemplates,
		defaultBadgeTemplate,
		participantTypes,
		existingParticipantTypeIds,
	} = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const { eventId } = useParams()
	const navigate = useNavigate()
	const isPending = useIsPending()
	const [scope, setScope] = useState<'all' | 'some'>('all')
	const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set())
	const cancelUrl = `/admin/events/${eventId}/templates`

	// Get initial badge template (default or first available)
	const initialBadgeTemplate = (badgeTemplates as BadgeTemplateWithDetails[]).find(
		t => t.isDefault,
	) ?? (badgeTemplates[0] as BadgeTemplateWithDetails | undefined)

	const [selectedBadgeTemplateId, setSelectedBadgeTemplateId] = useState(
		() => initialBadgeTemplate?.id ?? '',
	)

	// Get the selected badge template for preview
	const selectedBadgeTemplate =
		(badgeTemplates as BadgeTemplateWithDetails[]).find(
			t => t.id === selectedBadgeTemplateId,
		) ?? initialBadgeTemplate ?? null

	const [form, fields] = useForm({
		id: 'bulk-create-templates',
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
			badgeTemplateId: initialBadgeTemplate?.id ?? '',
			scope: 'all',
		},
	})

	const handleOpenChange = (open: boolean) => {
		if (!open) {
			navigate(cancelUrl)
		}
	}

	const existingSet = new Set(existingParticipantTypeIds)
	const availableParticipantTypes = participantTypes.filter(
		pt => !existingSet.has(pt.id),
	)

	// No badge templates configured
	if (badgeTemplates.length === 0) {
		return (
			<Dialog open onOpenChange={handleOpenChange}>
				<DialogContent
					className="sm:max-w-[450px]"
					onInteractOutside={e => e.preventDefault()}
				>
					<DialogHeader>
						<DialogTitle>Bulk Create Templates</DialogTitle>
						<DialogDescription>
							No badge templates are configured for this tenant. Please go to
							Badge Templates and create at least one before bulk creating
							templates.
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" asChild>
							<a href={cancelUrl}>Close</a>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		)
	}

	// All participant types already have templates
	if (availableParticipantTypes.length === 0) {
		return (
			<Dialog open onOpenChange={handleOpenChange}>
				<DialogContent
					className="sm:max-w-[450px]"
					onInteractOutside={e => e.preventDefault()}
				>
					<DialogHeader>
						<DialogTitle>Bulk Create Templates</DialogTitle>
						<DialogDescription>
							All participant types already have templates for this event.
							{existingParticipantTypeIds.length > 0 &&
								` (${existingParticipantTypeIds.length} existing template${existingParticipantTypeIds.length !== 1 ? 's' : ''})`}
						</DialogDescription>
					</DialogHeader>
					<DialogFooter>
						<Button type="button" variant="outline" asChild>
							<a href={cancelUrl}>Close</a>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		)
	}

	return (
		<Dialog open onOpenChange={handleOpenChange}>
			<DialogContent
				className={
					selectedBadgeTemplate
						? 'max-h-[90vh] overflow-y-auto sm:max-w-[900px]'
						: 'sm:max-w-[500px]'
				}
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Bulk Create Templates</DialogTitle>
					<DialogDescription>
						Create badge templates for participant types using the selected badge
						design.
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<input type="hidden" name="eventId" value={event.id} />
					<input type="hidden" name="tenantId" value={event.tenantId} />

					<div
						className={
							selectedBadgeTemplate
								? 'grid gap-6 py-4 lg:grid-cols-2'
								: 'grid gap-4 py-4'
						}
					>
						<div className="space-y-4">
							<Field>
								<Label htmlFor="badgeTemplateId">Badge Design</Label>
								<Select
									name="badgeTemplateId"
									value={selectedBadgeTemplateId}
									onValueChange={setSelectedBadgeTemplateId}
								>
									<SelectTrigger>
										<SelectValue placeholder="Select a badge design" />
									</SelectTrigger>
									<SelectContent>
										{badgeTemplates.map(bt => (
											<SelectItem key={bt.id} value={bt.id}>
												{bt.name}
												{bt.isDefault && ' (Default)'}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
							</Field>

							<Field>
							<Label>Create For</Label>
							{existingParticipantTypeIds.length > 0 && (
								<p className="mb-3 text-sm text-muted-foreground">
									{existingParticipantTypeIds.length} participant type(s) already
									have templates and will be skipped.
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
											if (selectedIds.size === availableParticipantTypes.length) {
												setSelectedIds(new Set())
											} else {
												setSelectedIds(new Set(availableParticipantTypes.map(pt => pt.id)))
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

							<p className="text-xs text-muted-foreground">
								Note: Front and back background images can be uploaded later by
								editing each template.
							</p>
						</div>

						{/* Badge Preview Panel */}
						{selectedBadgeTemplate && (
							<Card>
								<CardHeader className="py-3">
									<CardTitle className="text-lg">Badge Preview</CardTitle>
								</CardHeader>
								<CardContent>
									<DynamicBadge
										template={dbTemplateToConfig({
											width: selectedBadgeTemplate.width,
											height: selectedBadgeTemplate.height,
											borderWidth: selectedBadgeTemplate.borderWidth,
											borderColor: selectedBadgeTemplate.borderColor,
											borderRadius: selectedBadgeTemplate.borderRadius,
											badgeIdPrefix: selectedBadgeTemplate.badgeIdPrefix,
											elements: selectedBadgeTemplate.elements,
										})}
										participant={SAMPLE_PARTICIPANT}
										height="320px"
									/>
								</CardContent>
							</Card>
						)}
					</div>

					<DialogFooter>
						<Button type="button" variant="outline" asChild>
							<a href={cancelUrl}>Cancel</a>
						</Button>
						<Button type="submit" disabled={isPending}>
							{isPending ? 'Creating...' : 'Create Templates'}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
