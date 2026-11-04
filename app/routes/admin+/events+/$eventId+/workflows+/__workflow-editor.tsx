import { getFormProps, getInputProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Event, ParticipantType, Workflow, WorkflowTemplate } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { Form, useActionData, useNavigate, useOutletContext } from '@remix-run/react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
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
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { useIsPending } from '~/utils/misc'
import { xssTransform } from '~/utils/validations'
import { type action } from './__workflow-editor.server'

export const WorkflowEditorSchema = z.object({
	id: z.string().optional(),
	name: z
		.string({ required_error: 'Name is required' })
		.transform(xssTransform),
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
	participantTypeId: z.string({
		required_error: 'Participant Type is required',
	}),
	templateId: z.string().optional(),
})

export const WorkflowDeleteSchema = z.object({
	id: z.string(),
})

export function WorkflowEditor({
	event,
	workflow,
	title,
	intent = 'add',
	templates,
}: {
	event: SerializeFrom<Pick<Event, 'id' | 'name' | 'tenantId'>>
	workflow?: SerializeFrom<
		Pick<Workflow, 'id' | 'name' | 'tenantId' | 'eventId' | 'participantTypeId'>
	>
	title: string
	intent?: 'add' | 'edit' | 'delete'
	templates?: SerializeFrom<Pick<WorkflowTemplate, 'id' | 'name' | 'description'>>[]
}) {
	const { participantTypes } = useOutletContext<{
		participantTypes: ParticipantType[]
	}>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const navigate = useNavigate()

	const isDelete = intent === 'delete'

	// State for auto-suggest name
	const [selectedTemplateId, setSelectedTemplateId] = useState<string | undefined>(undefined)
	const [selectedParticipantTypeId, setSelectedParticipantTypeId] = useState<string | undefined>(
		workflow?.participantTypeId
	)
	const [suggestedName, setSuggestedName] = useState<string>(workflow?.name || '')

	// Auto-suggest name when template and participant type are selected
	const updateSuggestedName = (templateId?: string, participantTypeId?: string) => {
		if (intent !== 'add') return

		const template = templates?.find(t => t.id === templateId)
		const participantType = participantTypes.find(pt => pt.id === participantTypeId)

		if (template && participantType) {
			setSuggestedName(`${participantType.name} - ${template.name}`)
		}
	}

	const [form, fields] = useForm({
		id: 'workflow-editor',
		constraint: getZodConstraint(WorkflowEditorSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: WorkflowEditorSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...workflow,
			eventId: event.id,
			tenantId: event.tenantId,
		},
	})

	const handleClose = () => navigate(`/admin/events/${event.id}/workflows`)

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="sm:max-w-[500px]"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						{isDelete
							? 'Are you sure you want to delete this workflow? This action cannot be undone.'
							: intent === 'edit'
								? 'Update the workflow details below.'
								: 'Fill in the details to create a new workflow.'}
					</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<input
						{...getInputProps(fields.id, { type: 'hidden' })}
						key={fields.id.key}
					/>
					<input
						{...getInputProps(fields.eventId, { type: 'hidden' })}
						key={fields.eventId.key}
					/>
					<input
						{...getInputProps(fields.tenantId, { type: 'hidden' })}
						key={fields.tenantId.key}
					/>
					<input type="hidden" name="intent" value={intent} />

					{!isDelete && (
						<div className="grid gap-4 py-4">
							{intent === 'add' && templates && templates.length > 0 && (
								<Field>
									<Label htmlFor={fields.templateId.id}>
										Clone from Template (Optional)
									</Label>
									<Select
										name={fields.templateId.name}
										value={selectedTemplateId}
										onValueChange={value => {
											const templateId = value === '__none__' ? undefined : value
											setSelectedTemplateId(templateId)
											updateSuggestedName(templateId, selectedParticipantTypeId)
										}}
									>
										<SelectTrigger id={fields.templateId.id}>
											<SelectValue placeholder="Select a template" />
										</SelectTrigger>
										<SelectContent>
											<SelectItem value="__none__">Start from scratch</SelectItem>
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
							)}

							<Field>
								<Label htmlFor={fields.participantTypeId.id}>
									Participant Type
								</Label>
								<Select
									name={fields.participantTypeId.name}
									value={selectedParticipantTypeId}
									onValueChange={value => {
										setSelectedParticipantTypeId(value)
										updateSuggestedName(selectedTemplateId, value)
									}}
								>
									<SelectTrigger id={fields.participantTypeId.id}>
										<SelectValue placeholder="Select Participant Type" />
									</SelectTrigger>
									<SelectContent>
										{participantTypes.map(participantType => (
											<SelectItem
												key={participantType.id}
												value={participantType.id}
											>
												{participantType.name}
											</SelectItem>
										))}
									</SelectContent>
								</Select>
								{fields.participantTypeId.errors && (
									<FieldError>{fields.participantTypeId.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.name.id}>Name</Label>
								<Input
									id={fields.name.id}
									name={fields.name.name}
									type="text"
									autoComplete="off"
									value={suggestedName}
									onChange={e => setSuggestedName(e.target.value)}
								/>
								{fields.name.errors && (
									<FieldError>{fields.name.errors}</FieldError>
								)}
							</Field>
						</div>
					)}

					{isDelete && (
						<div className="py-4">
							<p className="text-sm text-muted-foreground">
								This will permanently delete this workflow and all its steps.
								This action cannot be undone.
							</p>
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
