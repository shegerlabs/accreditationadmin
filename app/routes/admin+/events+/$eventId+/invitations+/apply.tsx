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

const ApplyRestrictionSchema = z.object({
	restrictionId: z.string({ required_error: 'Please select a restriction' }),
	mode: z.enum(['replace', 'merge']),
	constraintTarget: z.enum(['all', 'selected']),
	constraintIds: z.array(z.string()).optional(),
	invitationTarget: z.enum(['all', 'selected']),
	invitationIds: z.array(z.string()).optional(),
}).refine(
	data => data.constraintTarget === 'all' || (data.constraintIds && data.constraintIds.length > 0),
	{
		message: 'Please select at least one constraint',
		path: ['constraintIds'],
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

	const restrictions = await prisma.restriction.findMany({
		where: { eventId },
		select: {
			id: true,
			name: true,
			constraints: {
				select: {
					id: true,
					participantTypeId: true,
					accessLevel: true,
					quota: true,
				},
			},
		},
		orderBy: { name: 'asc' },
	})

	const invitations = await prisma.invitation.findMany({
		where: { eventId },
		select: {
			id: true,
			organization: true,
			email: true,
		},
		orderBy: { organization: 'asc' },
	})

	const participantTypes = await prisma.participantType.findMany({
		where: { tenantId: event.tenantId },
		select: {
			id: true,
			name: true,
		},
		orderBy: { name: 'asc' },
	})

	return json({ event, restrictions, invitations, participantTypes })
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])
	const { eventId } = params

	const formData = await request.formData()
	await validateCSRF(formData, request.headers)
	checkHoneypot(formData)

	const submission = parseWithZod(formData, {
		schema: ApplyRestrictionSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { restrictionId, mode, constraintTarget, constraintIds, invitationTarget, invitationIds } = submission.value

	const restriction = await prisma.restriction.findUnique({
		where: { id: restrictionId },
		include: {
			constraints: {
				select: {
					id: true,
					participantTypeId: true,
					accessLevel: true,
					quota: true,
				},
			},
		},
	})

	invariantResponse(restriction, 'Restriction not found', { status: 404 })

	// Filter constraints based on selection
	const constraintsToApply = constraintTarget === 'all'
		? restriction.constraints
		: restriction.constraints.filter(c => constraintIds?.includes(c.id))

	// Get invitations based on target
	const invitations = await prisma.invitation.findMany({
		where: invitationTarget === 'all'
			? { eventId }
			: { id: { in: invitationIds } },
		select: { id: true },
	})

	await prisma.$transaction(async tx => {
		for (const invitation of invitations) {
			if (mode === 'replace') {
				await tx.invitationConstraint.deleteMany({
					where: { invitationId: invitation.id },
				})
			}

			for (const constraint of constraintsToApply) {
				if (mode === 'merge') {
					const existing = await tx.invitationConstraint.findUnique({
						where: {
							invitationId_participantTypeId_accessLevel: {
								invitationId: invitation.id,
								participantTypeId: constraint.participantTypeId,
								accessLevel: constraint.accessLevel,
							},
						},
					})
					if (existing) continue
				}

				await tx.invitationConstraint.create({
					data: {
						invitationId: invitation.id,
						participantTypeId: constraint.participantTypeId,
						accessLevel: constraint.accessLevel,
						quota: constraint.quota,
						sourceRestrictionId: restrictionId,
					},
				})
			}
		}
	})

	return redirectWithToast(`/admin/events/${eventId}/invitations`, {
		type: 'success',
		title: 'Restriction Applied',
		description: `Applied ${constraintsToApply.length} constraint${constraintsToApply.length === 1 ? '' : 's'} to ${invitations.length} invitation${invitations.length === 1 ? '' : 's'}.`,
	})
}

export default function ApplyRestrictionRoute() {
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
		id: 'apply-restriction',
		constraint: getZodConstraint(ApplyRestrictionSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: ApplyRestrictionSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			mode: 'replace',
			constraintTarget: 'all',
			invitationTarget: 'all',
		},
	})

	const handleClose = () => navigate(`/admin/events/${eventId}/invitations`)

	const handleSelectAllConstraints = () => {
		if (!selectedRestriction) return
		if (selectedConstraints.length === selectedRestriction.constraints.length) {
			setSelectedConstraints([])
		} else {
			setSelectedConstraints(selectedRestriction.constraints.map(c => c.id))
		}
	}

	const handleToggleConstraint = (id: string) => {
		setSelectedConstraints(prev =>
			prev.includes(id) ? prev.filter(i => i !== id) : [...prev, id]
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

	const constraintCount = constraintTarget === 'all'
		? (selectedRestriction?.constraints.length ?? 0)
		: selectedConstraints.length
	const invitationCount = invitationTarget === 'all'
		? invitations.length
		: selectedInvitations.length

	const buttonLabel = isSubmitting
		? 'Applying...'
		: `Apply ${constraintCount} Constraint${constraintCount === 1 ? '' : 's'} to ${invitationCount} Invitation${invitationCount === 1 ? '' : 's'}`

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
					<DialogTitle>Apply Restriction</DialogTitle>
					<DialogDescription>
						Apply a restriction to invitations in this event.
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<div className="grid gap-4 py-4">
						<Field>
							<Label htmlFor={fields.restrictionId.id}>Select Restriction</Label>
							<SelectField
								meta={fields.restrictionId}
								items={restrictions.map(r => ({
									name: `${r.name} (${r.constraints.length} constraints)`,
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
								<Label>Constraints to Apply</Label>
								<RadioGroup
									name={fields.constraintTarget.name}
									defaultValue="all"
									onValueChange={(value) => setConstraintTarget(value as 'all' | 'selected')}
								>
									<div className="flex items-start space-x-3">
										<RadioGroupItem value="all" id="constraint-all" />
										<div className="space-y-1">
											<Label htmlFor="constraint-all" className="font-medium">
												All Constraints ({selectedRestriction.constraints.length})
											</Label>
											<p className="text-sm text-muted-foreground">
												Apply all constraints from this restriction
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
												Choose specific constraints to apply
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
										{selectedConstraints.length === selectedRestriction.constraints.length ? 'Deselect All' : 'Select All'}
									</button>
								</div>
								<div className="max-h-40 overflow-y-auto rounded-md border p-2 space-y-2">
									{selectedRestriction.constraints.map(constraint => (
										<div key={constraint.id} className="flex items-center space-x-2">
											<Checkbox
												id={`constraint-${constraint.id}`}
												checked={selectedConstraints.includes(constraint.id)}
												onCheckedChange={() => handleToggleConstraint(constraint.id)}
											/>
											<input
												type="hidden"
												name="constraintIds"
												value={constraint.id}
												disabled={!selectedConstraints.includes(constraint.id)}
											/>
											<label
												htmlFor={`constraint-${constraint.id}`}
												className="text-sm cursor-pointer flex-1"
											>
												<span className="font-medium">{getParticipantTypeName(constraint.participantTypeId)}</span>
												<span className="text-muted-foreground ml-2">
													({constraint.accessLevel}, Quota: {constraint.quota ?? 'Unlimited'})
												</span>
											</label>
										</div>
									))}
								</div>
								{selectedConstraints.length === 0 && (
									<p className="text-sm text-destructive mt-1">
										Please select at least one constraint
									</p>
								)}
								{fields.constraintIds?.errors && (
									<FieldError>{fields.constraintIds.errors}</FieldError>
								)}
							</Field>
						)}

						<Field>
							<Label>Apply Mode</Label>
							<RadioGroup
								name={fields.mode.name}
								defaultValue="replace"
							>
								<div className="flex items-start space-x-3">
									<RadioGroupItem value="replace" id="replace" />
									<div className="space-y-1">
										<Label htmlFor="replace" className="font-medium">
											Replace
										</Label>
										<p className="text-sm text-muted-foreground">
											Remove all existing constraints and apply the restriction
										</p>
									</div>
								</div>
								<div className="flex items-start space-x-3">
									<RadioGroupItem value="merge" id="merge" />
									<div className="space-y-1">
										<Label htmlFor="merge" className="font-medium">
											Merge
										</Label>
										<p className="text-sm text-muted-foreground">
											Keep existing constraints and add new ones (skips duplicates)
										</p>
									</div>
								</div>
							</RadioGroup>
							{fields.mode.errors && <FieldError>{fields.mode.errors}</FieldError>}
						</Field>

						<Field>
							<Label>Apply To Invitations</Label>
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
											Apply to all invitations in this event
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
											Choose specific invitations to apply the restriction to
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
						<Button type="submit" disabled={isDisabled}>
							{buttonLabel}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
