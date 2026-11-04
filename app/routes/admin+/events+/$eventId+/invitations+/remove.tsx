import { parseWithZod } from '@conform-to/zod'
import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint } from '@conform-to/zod'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigate, useNavigation, useParams } from '@remix-run/react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { SelectField } from '~/components/conform/SelectField'
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
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

const RemoveRestrictionSchema = z.object({
	restrictionId: z.string({ required_error: 'Please select a restriction' }),
	constraintTarget: z.enum(['all', 'selected']),
	constraintKeys: z.array(z.string()).optional(),
	invitationTarget: z.enum(['all', 'selected']),
	invitationIds: z.array(z.string()).optional(),
}).refine(
	data => data.constraintTarget === 'all' || (data.constraintKeys && data.constraintKeys.length > 0),
	{
		message: 'Please select at least one constraint',
		path: ['constraintKeys'],
	}
).refine(
	data => data.invitationTarget === 'all' || (data.invitationIds && data.invitationIds.length > 0),
	{
		message: 'Please select at least one invitation',
		path: ['invitationIds'],
	}
)

export async function loader({ request, params }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { eventId } = params

	const event = await prisma.event.findUnique({
		where: { id: eventId },
		select: { id: true, name: true, tenantId: true },
	})

	invariantResponse(event, 'Event not found', { status: 404 })

	// Get invitations for this event
	const invitations = await prisma.invitation.findMany({
		where: { eventId },
		select: {
			id: true,
			organization: true,
			email: true,
		},
		orderBy: { organization: 'asc' },
	})

	// Find all applied constraints with their source restriction
	const appliedConstraints = await prisma.invitationConstraint.findMany({
		where: {
			invitationId: { in: invitations.map(i => i.id) },
			sourceRestrictionId: { not: null },
		},
		select: {
			sourceRestrictionId: true,
			participantTypeId: true,
			accessLevel: true,
		},
		distinct: ['sourceRestrictionId', 'participantTypeId', 'accessLevel'],
	})

	// Group constraints by restriction
	const restrictionConstraintsMap = new Map<string, Array<{ participantTypeId: string; accessLevel: string }>>()
	for (const constraint of appliedConstraints) {
		const key = constraint.sourceRestrictionId!
		if (!restrictionConstraintsMap.has(key)) {
			restrictionConstraintsMap.set(key, [])
		}
		restrictionConstraintsMap.get(key)!.push({
			participantTypeId: constraint.participantTypeId,
			accessLevel: constraint.accessLevel,
		})
	}

	const restrictions = await prisma.restriction.findMany({
		where: {
			id: { in: Array.from(restrictionConstraintsMap.keys()) },
		},
		select: {
			id: true,
			name: true,
		},
		orderBy: { name: 'asc' },
	})

	// Attach constraints to restrictions
	const restrictionsWithConstraints = restrictions.map(r => ({
		...r,
		appliedConstraints: restrictionConstraintsMap.get(r.id) ?? [],
	}))

	const participantTypes = await prisma.participantType.findMany({
		where: { tenantId: event.tenantId },
		select: {
			id: true,
			name: true,
		},
		orderBy: { name: 'asc' },
	})

	return json({ event, restrictions: restrictionsWithConstraints, invitations, participantTypes })
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])
	const { eventId } = params

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	const submission = parseWithZod(formData, {
		schema: RemoveRestrictionSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { restrictionId, constraintTarget, constraintKeys, invitationTarget, invitationIds } = submission.value

	// Get invitations based on target
	const invitations = await prisma.invitation.findMany({
		where: invitationTarget === 'all'
			? { eventId }
			: { id: { in: invitationIds } },
		select: { id: true },
	})

	// Build the where clause for deletion
	let deleteWhere: any = {
		invitationId: { in: invitations.map(i => i.id) },
		sourceRestrictionId: restrictionId,
	}

	// If specific constraints selected, filter by them
	if (constraintTarget === 'selected' && constraintKeys && constraintKeys.length > 0) {
		// constraintKeys are formatted as "participantTypeId:accessLevel"
		const constraintFilters = constraintKeys.map(key => {
			const [participantTypeId, accessLevel] = key.split(':')
			return { participantTypeId, accessLevel }
		})
		deleteWhere = {
			...deleteWhere,
			OR: constraintFilters,
		}
	}

	const result = await prisma.invitationConstraint.deleteMany({
		where: deleteWhere,
	})

	return redirectWithToast(`/admin/events/${eventId}/invitations`, {
		type: 'success',
		title: 'Restriction Removed',
		description: `Removed ${result.count} constraint${result.count === 1 ? '' : 's'} from ${invitations.length} invitation${invitations.length === 1 ? '' : 's'}.`,
	})
}

export default function RemoveRestrictionRoute() {
	const { event, restrictions, invitations, participantTypes } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const navigate = useNavigate()
	const { eventId } = useParams()
	const isSubmitting = navigation.state === 'submitting'

	const [selectedRestrictionId, setSelectedRestrictionId] = useState<string>('')
	const [constraintTarget, setConstraintTarget] = useState<'all' | 'selected'>('all')
	const [selectedConstraints, setSelectedConstraints] = useState<string[]>([])
	const [invitationTarget, setInvitationTarget] = useState<'all' | 'selected'>('all')
	const [selectedInvitations, setSelectedInvitations] = useState<string[]>([])

	const selectedRestriction = restrictions.find(r => r.id === selectedRestrictionId)
	const getParticipantTypeName = (id: string) => participantTypes.find(pt => pt.id === id)?.name ?? 'Unknown'

	const [form, fields] = useForm({
		id: 'remove-restriction',
		constraint: getZodConstraint(RemoveRestrictionSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: RemoveRestrictionSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			constraintTarget: 'all',
			invitationTarget: 'all',
		},
	})

	const handleClose = () => navigate(`/admin/events/${eventId}/invitations`)

	const handleSelectAllConstraints = () => {
		if (!selectedRestriction) return
		if (selectedConstraints.length === selectedRestriction.appliedConstraints.length) {
			setSelectedConstraints([])
		} else {
			setSelectedConstraints(selectedRestriction.appliedConstraints.map(c => `${c.participantTypeId}:${c.accessLevel}`))
		}
	}

	const handleToggleConstraint = (key: string) => {
		setSelectedConstraints(prev =>
			prev.includes(key) ? prev.filter(i => i !== key) : [...prev, key]
		)
	}

	const handleSelectAllInvitations = () => {
		if (selectedInvitations.length === invitations.length) {
			setSelectedInvitations([])
		} else {
			setSelectedInvitations(invitations.map(i => i.id))
		}
	}

	const handleToggleInvitation = (id: string) => {
		setSelectedInvitations(prev =>
			prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
		)
	}

	const handleRestrictionChange = (value: string) => {
		setSelectedRestrictionId(value)
		setSelectedConstraints([])
		setConstraintTarget('all')
	}

	const hasRestrictions = restrictions.length > 0

	const constraintCount = constraintTarget === 'all'
		? (selectedRestriction?.appliedConstraints.length ?? 0)
		: selectedConstraints.length
	const invitationCount = invitationTarget === 'all'
		? invitations.length
		: selectedInvitations.length

	const buttonLabel = isSubmitting
		? 'Removing...'
		: `Remove ${constraintCount} Constraint${constraintCount === 1 ? '' : 's'} from ${invitationCount} Invitation${invitationCount === 1 ? '' : 's'}`

	const isDisabled = isSubmitting
		|| !selectedRestrictionId
		|| (constraintTarget === 'selected' && selectedConstraints.length === 0)
		|| (invitationTarget === 'selected' && selectedInvitations.length === 0)

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Remove Restriction</DialogTitle>
					<DialogDescription>
						{hasRestrictions
							? "Remove constraints that were applied from a specific restriction. Only constraints created via 'Apply' will be removed."
							: "No restrictions have been applied to invitations yet."}
					</DialogDescription>
				</DialogHeader>

				{hasRestrictions ? (
					<Form method="POST" {...getFormProps(form)}>
						<AuthenticityTokenInput />
						<HoneypotInputs />

						<div className="grid gap-4 py-4">
							<Field>
								<Label htmlFor={fields.restrictionId.id}>Select Restriction to Remove</Label>
								<SelectField
									meta={fields.restrictionId}
									items={restrictions.map(r => ({
										name: `${r.name} (${r.appliedConstraints.length} constraints)`,
										value: r.id,
									}))}
									placeholder="Select a restriction..."
									onValueChange={handleRestrictionChange}
								/>
								{fields.restrictionId.errors && (
									<FieldError>{fields.restrictionId.errors}</FieldError>
								)}
							</Field>

							{selectedRestriction && (
								<Field>
									<Label>Constraints to Remove</Label>
									<RadioGroup
										name={fields.constraintTarget.name}
										defaultValue="all"
										onValueChange={(value) => setConstraintTarget(value as 'all' | 'selected')}
									>
										<div className="flex items-start space-x-3">
											<RadioGroupItem value="all" id="constraint-all" />
											<div className="space-y-1">
												<Label htmlFor="constraint-all" className="font-medium">
													All Constraints ({selectedRestriction.appliedConstraints.length})
												</Label>
												<p className="text-sm text-muted-foreground">
													Remove all constraints from this restriction
												</p>
											</div>
										</div>
										<div className="flex items-start space-x-3">
											<RadioGroupItem value="selected" id="constraint-selected" />
											<div className="space-y-1">
												<Label htmlFor="constraint-selected" className="font-medium">
													Selected Constraints
												</Label>
												<p className="text-sm text-muted-foreground">
													Choose specific constraints to remove
												</p>
											</div>
										</div>
									</RadioGroup>
									{fields.constraintTarget.errors && <FieldError>{fields.constraintTarget.errors}</FieldError>}
								</Field>
							)}

							{selectedRestriction && constraintTarget === 'selected' && (
								<Field>
									<div className="flex items-center justify-between mb-2">
										<Label>Select Constraints</Label>
										<button
											type="button"
											onClick={handleSelectAllConstraints}
											className="text-sm text-primary hover:underline"
										>
											{selectedConstraints.length === selectedRestriction.appliedConstraints.length ? 'Deselect All' : 'Select All'}
										</button>
									</div>
									<div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-2">
										{selectedRestriction.appliedConstraints.map(constraint => {
											const key = `${constraint.participantTypeId}:${constraint.accessLevel}`
											return (
												<div key={key} className="flex items-center space-x-2">
													<Checkbox
														id={`constraint-${key}`}
														checked={selectedConstraints.includes(key)}
														onCheckedChange={() => handleToggleConstraint(key)}
													/>
													<input
														type="hidden"
														name="constraintKeys"
														value={key}
														disabled={!selectedConstraints.includes(key)}
													/>
													<label
														htmlFor={`constraint-${key}`}
														className="text-sm cursor-pointer flex-1"
													>
														<span className="font-medium">{getParticipantTypeName(constraint.participantTypeId)}</span>
														<span className="text-muted-foreground ml-2">
															({constraint.accessLevel})
														</span>
													</label>
												</div>
											)
										})}
									</div>
									{selectedConstraints.length === 0 && (
										<p className="text-sm text-destructive mt-1">
											Please select at least one constraint
										</p>
									)}
									{fields.constraintKeys?.errors && (
										<FieldError>{fields.constraintKeys.errors}</FieldError>
									)}
								</Field>
							)}

							<Field>
								<Label>Remove From Invitations</Label>
								<RadioGroup
									name={fields.invitationTarget.name}
									defaultValue="all"
									onValueChange={(value) => setInvitationTarget(value as 'all' | 'selected')}
								>
									<div className="flex items-start space-x-3">
										<RadioGroupItem value="all" id="invitation-all" />
										<div className="space-y-1">
											<Label htmlFor="invitation-all" className="font-medium">
												All Invitations ({invitations.length})
											</Label>
											<p className="text-sm text-muted-foreground">
												Remove from all invitations in this event
											</p>
										</div>
									</div>
									<div className="flex items-start space-x-3">
										<RadioGroupItem value="selected" id="invitation-selected" />
										<div className="space-y-1">
											<Label htmlFor="invitation-selected" className="font-medium">
												Selected Invitations
											</Label>
											<p className="text-sm text-muted-foreground">
												Choose specific invitations to remove the restriction from
											</p>
										</div>
									</div>
								</RadioGroup>
								{fields.invitationTarget.errors && <FieldError>{fields.invitationTarget.errors}</FieldError>}
							</Field>

							{invitationTarget === 'selected' && (
								<Field>
									<div className="flex items-center justify-between mb-2">
										<Label>Select Invitations</Label>
										<button
											type="button"
											onClick={handleSelectAllInvitations}
											className="text-sm text-primary hover:underline"
										>
											{selectedInvitations.length === invitations.length ? 'Deselect All' : 'Select All'}
										</button>
									</div>
									<div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-2">
										{invitations.map(invitation => (
											<div key={invitation.id} className="flex items-center space-x-2">
												<Checkbox
													id={invitation.id}
													checked={selectedInvitations.includes(invitation.id)}
													onCheckedChange={() => handleToggleInvitation(invitation.id)}
												/>
												<input
													type="hidden"
													name="invitationIds"
													value={invitation.id}
													disabled={!selectedInvitations.includes(invitation.id)}
												/>
												<label
													htmlFor={invitation.id}
													className="text-sm cursor-pointer flex-1"
												>
													<span className="font-medium">{invitation.organization}</span>
													<span className="text-muted-foreground ml-2">({invitation.email})</span>
												</label>
											</div>
										))}
									</div>
									{selectedInvitations.length === 0 && (
										<p className="text-sm text-destructive mt-1">
											Please select at least one invitation
										</p>
									)}
									{fields.invitationIds?.errors && (
										<FieldError>{fields.invitationIds.errors}</FieldError>
									)}
								</Field>
							)}
						</div>

						<DialogFooter>
							<Button type="button" variant="outline" onClick={handleClose}>
								Cancel
							</Button>
							<Button type="submit" variant="destructive" disabled={isDisabled}>
								{buttonLabel}
							</Button>
						</DialogFooter>
					</Form>
				) : (
					<>
						<div className="rounded-lg border border-muted bg-muted/50 p-6 text-center py-4">
							<p className="text-muted-foreground">
								No restrictions have been applied to invitations yet.
							</p>
							<p className="mt-2 text-sm text-muted-foreground">
								Use "Apply" to apply a restriction to invitations first.
							</p>
						</div>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={handleClose}>
								Back to Invitations
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	)
}
