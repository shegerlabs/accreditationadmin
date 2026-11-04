import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, json, LoaderFunctionArgs } from '@remix-run/node'
import {
	Form,
	useActionData,
	useLoaderData,
	useNavigate,
	useParams,
} from '@remix-run/react'
import { useState } from 'react'
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
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { useIsPending } from '~/utils/misc'
import { requireAdminAccess } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { validateCSRF } from '~/utils/csrf.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { redirectWithToast } from '~/utils/toast.server'
import { auditRequest } from '~/utils/audit.server'
import { AuditAction, AuditEntityType } from '@prisma/client'

const BulkRemoveSchema = z.object({
	removeType: z.enum(['all', 'byRole', 'byStep', 'byUser']),
	roleId: z.string().optional(),
	stepName: z.string().optional(),
	userIds: z.array(z.string()).optional(),
	eventId: z.string(),
})

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const { eventId } = params

	invariantResponse(eventId, 'Event ID is required')

	if (!user.isGlobalAdmin && !user.tenantId) {
		throw json({ error: 'Access denied' }, { status: 403 })
	}

	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
		},
		select: { id: true, name: true },
	})

	invariantResponse(event, 'Access denied', { status: 403 })

	// Get count of access records
	const accessCount = await prisma.userEventAccess.count({
		where: { eventId },
	})

	// Get counts per role
	const accessByRole = await prisma.userEventAccess.groupBy({
		by: ['roleId'],
		where: { eventId },
		_count: { id: true },
	})

	// Get role details
	const roles = await prisma.role.findMany({
		where: {
			id: { in: accessByRole.map(r => r.roleId) },
		},
		select: { id: true, name: true },
	})

	const rolesWithCount = roles.map(role => ({
		...role,
		count: accessByRole.find(r => r.roleId === role.id)?._count.id ?? 0,
	}))

	// Get counts per step name
	const accessRecordsWithStep = await prisma.userEventAccess.findMany({
		where: { eventId, stepId: { not: null } },
		select: {
			step: {
				select: { name: true },
			},
		},
	})

	const stepCountMap = new Map<string, number>()
	for (const record of accessRecordsWithStep) {
		if (record.step?.name) {
			stepCountMap.set(
				record.step.name,
				(stepCountMap.get(record.step.name) ?? 0) + 1,
			)
		}
	}

	const stepsWithCount = Array.from(stepCountMap.entries()).map(
		([name, count]) => ({ name, count }),
	)

	// Get counts per user
	const accessByUser = await prisma.userEventAccess.groupBy({
		by: ['userId'],
		where: { eventId },
		_count: { id: true },
	})

	const userIds = accessByUser.map(u => u.userId)
	const users = await prisma.user.findMany({
		where: { id: { in: userIds } },
		select: { id: true, username: true, email: true },
	})

	const usersWithCount = users.map(user => ({
		...user,
		count: accessByUser.find(u => u.userId === user.id)?._count.id ?? 0,
	}))

	return json({
		eventId: event.id,
		accessCount,
		rolesWithCount,
		stepsWithCount,
		usersWithCount,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const { eventId } = params
	invariantResponse(eventId, 'Event ID is required')

	if (!user.isGlobalAdmin && !user.tenantId) {
		throw json({ error: 'Access denied' }, { status: 403 })
	}

	const event = await prisma.event.findFirst({
		where: {
			id: eventId,
			...(user.isGlobalAdmin ? {} : { tenantId: user.tenantId! }),
		},
		select: { id: true, name: true },
	})

	invariantResponse(event, 'Access denied', { status: 403 })

	const submission = await parseWithZod(formData, {
		schema: BulkRemoveSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json({ result: submission.reply() }, { status: 400 })
	}

	const { removeType, roleId, stepName, userIds } = submission.value

	let deleteCount = 0
	let whereClause: any = { eventId }

	switch (removeType) {
		case 'all':
			// Delete all access records for this event
			break

		case 'byRole':
			if (!roleId) {
				return json(
					{
						result: submission.reply({
							formErrors: ['Please select a role'],
						}),
					},
					{ status: 400 },
				)
			}
			whereClause.roleId = roleId
			break

		case 'byStep':
			if (!stepName) {
				return json(
					{
						result: submission.reply({
							formErrors: ['Please select a step'],
						}),
					},
					{ status: 400 },
				)
			}
			// Find all steps with this name across all workflows for this event
			const steps = await prisma.step.findMany({
				where: {
					name: stepName,
					workflow: { eventId },
				},
				select: { id: true },
			})
			whereClause.stepId = { in: steps.map(s => s.id) }
			break

		case 'byUser':
			if (!userIds || userIds.length === 0) {
				return json(
					{
						result: submission.reply({
							formErrors: ['Please select at least one user'],
						}),
					},
					{ status: 400 },
				)
			}
			whereClause.userId = { in: userIds }
			break
	}

	const result = await prisma.userEventAccess.deleteMany({
		where: whereClause,
	})

	deleteCount = result.count

	await auditRequest({
		request,
		action: AuditAction.DELETE,
		entityType: AuditEntityType.USER,
		entityId: eventId,
		description: `Bulk removed ${deleteCount} access record(s) from event ${event.name} (type: ${removeType})`,
		userId: user.id,
	})

	return redirectWithToast(`/admin/events/${eventId}/access`, {
		type: 'success',
		title: 'Access Removed',
		description: `Successfully removed ${deleteCount} access record(s)`,
	})
}

export default function BulkRemoveAccessRoute() {
	const { eventId, accessCount, rolesWithCount, stepsWithCount, usersWithCount } =
		useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const navigate = useNavigate()
	const params = useParams()

	const [removeType, setRemoveType] = useState<
		'all' | 'byRole' | 'byStep' | 'byUser'
	>('all')
	const [selectedUserIds, setSelectedUserIds] = useState<string[]>([])

	const [form, fields] = useForm({
		id: 'bulk-remove-access',
		constraint: getZodConstraint(BulkRemoveSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: BulkRemoveSchema })
		},
		defaultValue: {
			removeType: 'all',
			eventId: eventId,
		},
	})

	const handleUserToggle = (userId: string) => {
		setSelectedUserIds(prev =>
			prev.includes(userId)
				? prev.filter(id => id !== userId)
				: [...prev, userId],
		)
	}

	return (
		<Dialog
			open={true}
			onOpenChange={() => navigate(`/admin/events/${params.eventId}/access`)}
		>
			<DialogContent
				className="sm:max-w-[550px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>Bulk Remove Access</DialogTitle>
					<DialogDescription>
						Remove access records for this event. Currently {accessCount} access
						record(s) exist.
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<input type="hidden" name="eventId" value={eventId} />

					<div className="grid gap-4 py-4 px-1 max-h-[60vh] overflow-y-auto">
						{/* Remove Type Selection */}
						<Field>
							<Label>Remove Type</Label>
							<RadioGroup
								value={removeType}
								onValueChange={value =>
									setRemoveType(
										value as 'all' | 'byRole' | 'byStep' | 'byUser',
									)
								}
								className="mt-2 space-y-2"
							>
								<div className="flex items-center space-x-2">
									<RadioGroupItem value="all" id="remove-all" />
									<Label htmlFor="remove-all" className="font-normal">
										Remove All ({accessCount} records)
									</Label>
								</div>
								<div className="flex items-center space-x-2">
									<RadioGroupItem value="byRole" id="remove-by-role" />
									<Label htmlFor="remove-by-role" className="font-normal">
										Remove by Role
									</Label>
								</div>
								<div className="flex items-center space-x-2">
									<RadioGroupItem value="byStep" id="remove-by-step" />
									<Label htmlFor="remove-by-step" className="font-normal">
										Remove by Step
									</Label>
								</div>
								<div className="flex items-center space-x-2">
									<RadioGroupItem value="byUser" id="remove-by-user" />
									<Label htmlFor="remove-by-user" className="font-normal">
										Remove by User
									</Label>
								</div>
							</RadioGroup>
							<input type="hidden" name="removeType" value={removeType} />
						</Field>

						{/* Role Selection */}
						{removeType === 'byRole' && (
							<Field>
								<Label htmlFor={fields.roleId.id}>Select Role</Label>
								{rolesWithCount.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No roles have access records for this event.
									</p>
								) : (
									<SelectField
										meta={fields.roleId}
										items={rolesWithCount.map(role => ({
											name: `${role.name} (${role.count} record${role.count !== 1 ? 's' : ''})`,
											value: role.id,
										}))}
										placeholder="Select a role to remove"
									/>
								)}
								{fields.roleId.errors && (
									<FieldError>{fields.roleId.errors}</FieldError>
								)}
							</Field>
						)}

						{/* Step Selection */}
						{removeType === 'byStep' && (
							<Field>
								<Label htmlFor={fields.stepName.id}>Select Step</Label>
								{stepsWithCount.length === 0 ? (
									<p className="text-sm text-muted-foreground">
										No steps have access records for this event.
									</p>
								) : (
									<>
										<SelectField
											meta={fields.stepName}
											items={stepsWithCount.map(step => ({
												name: `${step.name} (${step.count} record${step.count !== 1 ? 's' : ''})`,
												value: step.name,
											}))}
											placeholder="Select a step to remove"
										/>
										<p className="text-xs text-muted-foreground mt-1">
											This will remove access for this step across all participant
											types
										</p>
									</>
								)}
								{fields.stepName.errors && (
									<FieldError>{fields.stepName.errors}</FieldError>
								)}
							</Field>
						)}

						{/* User Selection */}
						{removeType === 'byUser' && (
							<Field>
								<Label>Select Users</Label>
								{usersWithCount.length === 0 ? (
									<p className="text-sm text-muted-foreground mt-2">
										No users have access to this event.
									</p>
								) : (
									<>
										<div className="mt-2 border rounded-md p-3">
											<div className="flex gap-3 mb-2 text-sm">
												<button
													type="button"
													className="text-primary hover:underline"
													onClick={() =>
														setSelectedUserIds(usersWithCount.map(u => u.id))
													}
												>
													Select All
												</button>
												<button
													type="button"
													className="text-primary hover:underline"
													onClick={() => setSelectedUserIds([])}
												>
													Deselect All
												</button>
												{selectedUserIds.length > 0 && (
													<span className="text-muted-foreground">
														({selectedUserIds.length} selected)
													</span>
												)}
											</div>
											<div className="max-h-40 overflow-y-auto space-y-2">
												{usersWithCount.map(user => (
													<div
														key={user.id}
														className="flex items-center space-x-2"
													>
														<Checkbox
															id={`user-${user.id}`}
															checked={selectedUserIds.includes(user.id)}
															onCheckedChange={() => handleUserToggle(user.id)}
														/>
														<Label
															htmlFor={`user-${user.id}`}
															className="font-normal"
														>
															{user.username} ({user.email}) - {user.count} record{user.count !== 1 ? 's' : ''}
														</Label>
														<input
															type="hidden"
															name="userIds"
															value={user.id}
															disabled={!selectedUserIds.includes(user.id)}
														/>
													</div>
												))}
											</div>
										</div>
										{selectedUserIds.length === 0 && (
											<p className="text-sm text-destructive mt-1">
												Please select at least one user
											</p>
										)}
									</>
								)}
							</Field>
						)}

						{/* Warning */}
						<div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
							<p className="text-sm text-destructive font-medium">Warning</p>
							<p className="text-sm text-muted-foreground">
								This action cannot be undone. The selected access records will
								be permanently removed.
							</p>
						</div>
					</div>

					<DialogFooter>
						<Button
							type="button"
							variant="outline"
							onClick={() => navigate(`/admin/events/${params.eventId}/access`)}
						>
							Cancel
						</Button>
						<Button
							type="submit"
							variant="destructive"
							disabled={
								isPending ||
								accessCount === 0 ||
								(removeType === 'byUser' && selectedUserIds.length === 0)
							}
						>
							{isPending ? 'Removing...' : 'Remove Access'}
						</Button>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
