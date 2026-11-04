import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import type { AccessLevel, Event, ParticipantType } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import {
	Form,
	useActionData,
	useNavigate,
	useOutletContext,
	useParams,
} from '@remix-run/react'
import { PlusIcon, TrashIcon } from 'lucide-react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { Field, FieldError } from '~/components/forms'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import {
	Table,
	TableBody,
	TableCell,
	TableHead,
	TableHeader,
	TableRow,
} from '~/components/ui/table'
import { useIsPending } from '~/utils/misc'
import { xssTransform } from '~/utils/validations'
import { type action } from './__invitation-editor.server'

const InvitationConstraintSchema = z.object({
	id: z.string().optional(),
	participantTypeId: z.string({
		required_error: 'Participant type is required',
	}),
	accessLevel: z.enum(['OPEN', 'CLOSED']),
	quota: z
		.string()
		.optional()
		.transform(val => (val ? parseInt(val, 10) : undefined)),
	sourceRestrictionId: z.string().optional(),
})

export const InvitationEditorSchema = z.object({
	id: z.string().optional(),
	organization: z
		.string({ required_error: 'Organization is required' })
		.transform(xssTransform),
	name: z.string().optional().transform(xssTransform),
	email: z
		.string({ required_error: 'Email is required' })
		.transform(xssTransform),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	maximumQuota: z.string().optional().transform(xssTransform),
	constraints: z.array(InvitationConstraintSchema).optional(),
})

export const InvitationDeleteSchema = z.object({
	id: z.string(),
})

type RestrictionWithConstraints = {
	id: string
	name: string
	constraints: {
		id: string
		participantTypeId: string
		accessLevel: AccessLevel
		quota: number
	}[]
}

type InvitationConstraint = {
	id?: string
	participantTypeId: string
	accessLevel: AccessLevel
	quota?: number | null
	sourceRestrictionId?: string | null
}

export function InvitationEditor({
	event,
	invitation,
	title,
	intent,
}: {
	event: SerializeFrom<Pick<Event, 'id' | 'name' | 'tenantId'>>
	invitation?: SerializeFrom<{
		id: string
		organization: string
		name: string | null
		email: string
		tenantId: string
		eventId: string
		maximumQuota: number | null
		invitationConstraints?: InvitationConstraint[]
	}>
	title: string
	intent?: 'add' | 'edit' | 'delete'
}) {
	const context = useOutletContext<{
		restrictions: RestrictionWithConstraints[]
		participantTypes: ParticipantType[]
		accessLevels: AccessLevel[]
	}>()
	const restrictions = context?.restrictions ?? []
	const participantTypes = context?.participantTypes ?? []
	const accessLevels = context?.accessLevels ?? []
	const actionData = useActionData<typeof action>()
	const navigate = useNavigate()
	const isPending = useIsPending()
	const { eventId } = useParams()

	const isDelete = intent === 'delete'
	const lastResult =
		actionData?.result && 'status' in actionData.result
			? actionData.result
			: undefined

	const [form, fields] = useForm({
		id: 'register-invitation',
		constraint: getZodConstraint(InvitationEditorSchema),
		lastResult,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: InvitationEditorSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...invitation,
			eventId: event.id,
			tenantId: event.tenantId,
			maximumQuota: invitation?.maximumQuota?.toString() ?? '',
			constraints:
				invitation?.invitationConstraints?.map(c => ({
					id: c.id,
					participantTypeId: c.participantTypeId,
					accessLevel: c.accessLevel,
					quota: c.quota?.toString() ?? '',
					sourceRestrictionId: c.sourceRestrictionId ?? '',
				})) ?? [],
		},
	})

	const constraints = fields.constraints.getFieldList()

	const handleClose = () => navigate(`/admin/events/${eventId}/invitations`)

	const handleLoadFromTemplate = (restrictionId: string) => {
		// Clear existing constraints first (remove from end to avoid index issues)
		for (let i = constraints.length - 1; i >= 0; i--) {
			form.remove({ name: fields.constraints.name, index: i })
		}

		// If "none" selected, just clear constraints and return
		if (restrictionId === 'none') return

		const restriction = restrictions.find(r => r.id === restrictionId)
		if (!restriction) return

		// Add constraints from template with source tracking
		// Treat quota of 0 as unlimited (empty string)
		restriction.constraints.forEach(constraint => {
			form.insert({
				name: fields.constraints.name,
				defaultValue: {
					participantTypeId: constraint.participantTypeId,
					accessLevel: constraint.accessLevel,
					quota: constraint.quota ? constraint.quota.toString() : '',
					sourceRestrictionId: restrictionId, // Track which template was used
				},
			})
		})
	}

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="max-h-[90vh] overflow-y-auto sm:max-w-[700px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{isDelete
							? 'Are you sure you want to delete this invitation? This action cannot be undone.'
							: intent === 'edit'
								? 'Update the invitation details below.'
								: 'Fill in the details to create a new invitation.'}
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<InputField meta={fields.id} type="hidden" />
					<InputField meta={fields.eventId} type="hidden" />
					<InputField meta={fields.tenantId} type="hidden" />
					<input type="hidden" name="intent" value={intent} />

					{!isDelete && (
						<div className="grid gap-4 py-4">
							<Field>
								<Label htmlFor={fields.name.id}>Focal Person's Name</Label>
								<InputField
									meta={fields.name}
									type="text"
									autoComplete="off"
								/>
								<p className="text-xs text-muted-foreground">
									Full name for the focal user account.
								</p>
								{fields.name.errors && (
									<FieldError>{fields.name.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.email.id}>Email</Label>
								<InputField
									meta={fields.email}
									type="text"
									autoComplete="off"
								/>
								{fields.email.errors && (
									<FieldError>{fields.email.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.organization.id}>Organization</Label>
								<InputField
									meta={fields.organization}
									type="text"
									autoComplete="off"
								/>
								{fields.organization.errors && (
									<FieldError>{fields.organization.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.maximumQuota.id}>Maximum Quota</Label>
								<InputField meta={fields.maximumQuota} type="number" />
								<p className="text-xs text-muted-foreground">
									Overall limit. Leave empty for unlimited.
								</p>
								{fields.maximumQuota.errors && (
									<FieldError>{fields.maximumQuota.errors}</FieldError>
								)}
							</Field>

							<div className="space-y-4">
								<div className="flex items-center justify-between">
									<Label>Constraints</Label>
									<div className="flex items-center gap-2">
										<Select onValueChange={handleLoadFromTemplate}>
											<SelectTrigger className="w-[180px]">
												<SelectValue placeholder="Load from template..." />
											</SelectTrigger>
											<SelectContent>
												<SelectItem value="none">None (Clear all)</SelectItem>
												{restrictions.map(restriction => (
													<SelectItem
														key={restriction.id}
														value={restriction.id}
													>
														{restriction.name}
													</SelectItem>
												))}
											</SelectContent>
										</Select>
										<Button
											{...form.insert.getButtonProps({
												name: fields.constraints.name,
											})}
											variant="outline"
											size="sm"
										>
											<PlusIcon className="mr-1 h-4 w-4" />
											Add
										</Button>
									</div>
								</div>

								{constraints.length > 0 && (
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Participant Type</TableHead>
												<TableHead>Access Level</TableHead>
												<TableHead>Quota</TableHead>
												<TableHead className="w-[50px]"></TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{constraints.map((constraint, index) => {
												const constraintFields = constraint.getFieldset()
												return (
													<TableRow key={constraint.key}>
														<TableCell>
															<InputField
																meta={constraintFields.id}
																type="hidden"
															/>
															<InputField
																meta={constraintFields.sourceRestrictionId}
																type="hidden"
															/>
															<SelectField
																meta={constraintFields.participantTypeId}
																items={participantTypes.map(pt => ({
																	name: pt.name,
																	value: pt.id,
																}))}
																placeholder="Select type"
															/>
															{constraintFields.participantTypeId.errors && (
																<FieldError>
																	{constraintFields.participantTypeId.errors}
																</FieldError>
															)}
														</TableCell>
														<TableCell>
															<SelectField
																meta={constraintFields.accessLevel}
																items={accessLevels.map(level => ({
																	name: level,
																	value: level,
																}))}
																placeholder="Select level"
															/>
															{constraintFields.accessLevel.errors && (
																<FieldError>
																	{constraintFields.accessLevel.errors}
																</FieldError>
															)}
														</TableCell>
														<TableCell>
															<InputField
																meta={constraintFields.quota}
																type="number"
																placeholder="Unlimited"
															/>
														</TableCell>
														<TableCell>
															<Button
																variant="ghost"
																size="icon"
																className="h-8 w-8 text-destructive hover:text-destructive"
																onClick={e => {
																	e.preventDefault()
																	form.remove({
																		name: fields.constraints.name,
																		index,
																	})
																}}
															>
																<TrashIcon className="h-4 w-4" />
															</Button>
														</TableCell>
													</TableRow>
												)
											})}
										</TableBody>
									</Table>
								)}

								{constraints.length === 0 && (
									<p className="text-sm text-muted-foreground">
										No constraints defined. Any participant type can register up
										to the maximum quota.
									</p>
								)}
							</div>
						</div>
					)}

					{isDelete && invitation?.invitationConstraints && (
						<div className="space-y-4 py-4">
							<div className="grid grid-cols-1 sm:grid-cols-2 gap-4 text-sm">
								<div>
									<span className="text-muted-foreground">Organization:</span>{' '}
									<span className="font-medium">{invitation.organization}</span>
								</div>
								<div>
									<span className="text-muted-foreground">Email:</span>{' '}
									<span className="font-medium">{invitation.email}</span>
								</div>
							</div>

							{invitation.invitationConstraints.length > 0 && (
								<div>
									<Label className="mb-2 block">Constraints</Label>
									<Table>
										<TableHeader>
											<TableRow>
												<TableHead>Participant Type</TableHead>
												<TableHead>Access Level</TableHead>
												<TableHead>Quota</TableHead>
											</TableRow>
										</TableHeader>
										<TableBody>
											{invitation.invitationConstraints.map(
												(constraint, index) => {
													const participantType = participantTypes.find(
														pt => pt.id === constraint.participantTypeId,
													)
													return (
														<TableRow key={index}>
															<TableCell>
																{participantType?.name ?? 'Unknown'}
															</TableCell>
															<TableCell>{constraint.accessLevel}</TableCell>
															<TableCell>
																{constraint.quota ?? 'Unlimited'}
															</TableCell>
														</TableRow>
													)
												},
											)}
										</TableBody>
									</Table>
								</div>
							)}
						</div>
					)}

					<DialogFooter>
						<Button type="button" variant="outline" onClick={handleClose}>
							Cancel
						</Button>
						<Button
							type="submit"
							variant={isDelete ? 'destructive' : 'default'}
							disabled={isPending}
						>
							{isPending
								? isDelete
									? 'Deleting...'
									: 'Saving...'
								: isDelete
									? 'Delete'
									: 'Save'}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
