import {
	getFormProps,
	getInputProps,
	getTextareaProps,
	useForm,
} from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import { Form, useActionData, useLoaderData, useNavigate, useNavigation } from '@remix-run/react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { SwitchField } from '~/components/conform/SwitchField'
import { ErrorList, Field, FieldError } from '~/components/forms'
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
import { Textarea } from '~/components/ui/textarea'
import { auditRequest } from '~/utils/audit.server'
import { requireAdminAccess } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse } from '~/utils/misc'
import {
	buildEmailHtml,
	EMAIL_PLACEHOLDERS,
	EMAIL_TEMPLATE_DEFAULTS,
	EMAIL_TRIGGERS,
	findUnknownPlaceholders,
	renderTemplate,
	SAMPLE_EMAIL_VARIABLES,
	type EmailTrigger,
} from '~/utils/participant-email'
import { getEffectiveTemplate, sendTestEmail } from '~/utils/participant-email.server'
import { redirectWithToast } from '~/utils/toast.server'

const withKnownPlaceholders = (value: string, ctx: z.RefinementCtx) => {
	const unknown = findUnknownPlaceholders(value)
	if (unknown.length > 0) {
		ctx.addIssue({
			code: z.ZodIssueCode.custom,
			message: `Unknown placeholder: ${unknown.map(key => `{${key}}`).join(', ')}`,
		})
	}
}

const EmailTemplateSchema = z.object({
	enabled: z.boolean().default(false),
	subject: z
		.string({ required_error: 'Subject is required' })
		.max(200, 'Subject must be 200 characters or fewer')
		.superRefine(withKnownPlaceholders),
	body: z
		.string({ required_error: 'Body is required' })
		.max(10000, 'Body must be 10,000 characters or fewer')
		.superRefine(withKnownPlaceholders),
})

async function requireEventAndTrigger(
	request: Request,
	params: LoaderFunctionArgs['params'],
) {
	const event = await prisma.event.findUnique({
		where: { id: params.eventId },
		select: { id: true, name: true, tenantId: true },
	})
	invariantResponse(event, 'Not Found', { status: 404 })
	const user = await requireAdminAccess(request, event.tenantId)
	const trigger = params.trigger as EmailTrigger
	invariantResponse(EMAIL_TRIGGERS.includes(trigger), 'Not Found', { status: 404 })
	return { event, user, trigger }
}

export async function loader({ request, params }: LoaderFunctionArgs) {
	const { event, trigger } = await requireEventAndTrigger(request, params)
	const template = await getEffectiveTemplate(event.id, trigger)
	return json({ event, trigger, template })
}

export async function action({ request, params }: ActionFunctionArgs) {
	const { event, user, trigger } = await requireEventAndTrigger(request, params)

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const intent = formData.get('intent')
	const listUrl = `/admin/events/${event.id}/emails`
	const label = EMAIL_TEMPLATE_DEFAULTS[trigger].label

	if (intent === 'reset') {
		await prisma.emailTemplate.deleteMany({ where: { eventId: event.id, trigger } })
		await auditRequest({
			request,
			action: AuditAction.DELETE,
			entityType: AuditEntityType.EMAIL_TEMPLATE,
			description: `Reset the "${label}" email for event "${event.name}" to the default wording`,
			userId: user.id,
			tenantId: event.tenantId,
			metadata: { eventId: event.id, trigger },
		})
		return redirectWithToast(listUrl, {
			type: 'success',
			title: 'Email reset',
			description: `"${label}" now uses the default wording.`,
		})
	}

	const submission = parseWithZod(formData, { schema: EmailTemplateSchema })
	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply(), testResult: null },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}
	const { enabled, subject, body } = submission.value

	if (intent === 'test') {
		const result = await sendTestEmail(
			user.email,
			`[Test] ${renderTemplate(subject, SAMPLE_EMAIL_VARIABLES)}`,
			renderTemplate(body, SAMPLE_EMAIL_VARIABLES),
		)
		return json({
			result: submission.reply(),
			testResult:
				result.status === 'success'
					? { ok: true, message: `Test email sent to ${user.email}.` }
					: { ok: false, message: `The test email to ${user.email} could not be sent.` },
		})
	}

	const template = await prisma.emailTemplate.upsert({
		where: { eventId_trigger: { eventId: event.id, trigger } },
		create: { eventId: event.id, trigger, enabled, subject, body, updatedById: user.id },
		update: { enabled, subject, body, updatedById: user.id },
		select: { id: true },
	})
	await auditRequest({
		request,
		action: AuditAction.UPDATE,
		entityType: AuditEntityType.EMAIL_TEMPLATE,
		entityId: template.id,
		description: `Updated the "${label}" email for event "${event.name}"`,
		userId: user.id,
		tenantId: event.tenantId,
		metadata: { eventId: event.id, trigger, enabled, subject },
	})
	return redirectWithToast(listUrl, {
		type: 'success',
		title: 'Email saved',
		description: `"${label}" was updated.`,
	})
}

export default function EditEmailTemplateRoute() {
	const { event, trigger, template } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const navigate = useNavigate()
	const definition = EMAIL_TEMPLATE_DEFAULTS[trigger]

	const [subject, setSubject] = useState(template.subject)
	const [body, setBody] = useState(template.body)

	const [form, fields] = useForm({
		id: `email-template-${trigger}`,
		constraint: getZodConstraint(EmailTemplateSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: EmailTemplateSchema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			enabled: template.enabled ? 'on' : '',
			subject: template.subject,
			body: template.body,
		},
	})

	const submittingIntent =
		navigation.state === 'submitting' ? navigation.formData?.get('intent') : null
	const isBusy = navigation.state !== 'idle'
	const handleClose = () => navigate(`/admin/events/${event.id}/emails`)

	return (
		<Dialog open={true} onOpenChange={handleClose}>
			<DialogContent
				className="max-h-[95dvh] overflow-y-auto sm:max-w-5xl"
				onInteractOutside={e => e.preventDefault()}
			>
				<DialogHeader>
					<DialogTitle>{definition.label}</DialogTitle>
					<DialogDescription>{definition.description}</DialogDescription>
				</DialogHeader>

				<Form method="POST" {...getFormProps(form)}>
					<AuthenticityTokenInput />
					<HoneypotInputs />

					<div className="grid gap-6 py-2 lg:grid-cols-2">
						<div className="grid content-start gap-4">
							<Field>
								<div className="flex items-center gap-3">
									<SwitchField meta={fields.enabled} />
									<Label htmlFor={fields.enabled.id}>Send this email</Label>
								</div>
							</Field>

							<Field>
								<Label htmlFor={fields.subject.id}>Subject</Label>
								<Input
									{...getInputProps(fields.subject, { type: 'text' })}
									key={fields.subject.key}
									onChange={e => setSubject(e.currentTarget.value)}
								/>
								{fields.subject.errors && (
									<FieldError>{fields.subject.errors}</FieldError>
								)}
							</Field>

							<Field>
								<Label htmlFor={fields.body.id}>Body</Label>
								<Textarea
									{...getTextareaProps(fields.body)}
									key={fields.body.key}
									rows={14}
									className="font-mono text-sm md:text-sm"
									onChange={e => setBody(e.currentTarget.value)}
								/>
								{fields.body.errors && <FieldError>{fields.body.errors}</FieldError>}
								<p className="text-xs text-muted-foreground">
									Leave a blank line between paragraphs. Links are made clickable.
								</p>
							</Field>

							<div>
								<p className="mb-2 text-sm font-medium">Placeholders</p>
								<dl className="grid grid-cols-1 gap-x-4 gap-y-1 text-xs sm:grid-cols-2">
									{Object.entries(EMAIL_PLACEHOLDERS).map(([key, description]) => (
										<div key={key} className="flex gap-2">
											<dt>
												<code className="rounded bg-muted px-1">{`{${key}}`}</code>
											</dt>
											<dd className="text-muted-foreground">{description}</dd>
										</div>
									))}
								</dl>
							</div>

							<ErrorList errors={form.errors} id={form.errorId} />
							{actionData?.testResult && (
								<p
									role="status"
									className={
										actionData.testResult.ok
											? 'text-sm text-green-700'
											: 'text-sm text-destructive'
									}
								>
									{actionData.testResult.message}
								</p>
							)}
						</div>

						<div className="grid content-start gap-2">
							<p className="text-sm font-medium">Preview with sample data</p>
							<p className="truncate rounded-md border bg-muted/50 px-3 py-2 text-sm">
								<span className="text-muted-foreground">Subject: </span>
								{renderTemplate(subject, SAMPLE_EMAIL_VARIABLES)}
							</p>
							<iframe
								title="Email preview"
								sandbox=""
								className="h-[480px] w-full rounded-md border"
								srcDoc={buildEmailHtml(
									renderTemplate(subject, SAMPLE_EMAIL_VARIABLES),
									renderTemplate(body, SAMPLE_EMAIL_VARIABLES),
								)}
							/>
						</div>
					</div>

					<DialogFooter className="mt-4 flex-col-reverse gap-2 sm:flex-row sm:justify-between sm:gap-0">
						<div className="flex flex-col gap-2 sm:flex-row">
							{template.isCustom && (
								<Button
									type="submit"
									name="intent"
									value="reset"
									variant="outline"
									formNoValidate
									disabled={isBusy}
								>
									{submittingIntent === 'reset' ? 'Resetting...' : 'Reset to default'}
								</Button>
							)}
							<Button
								type="submit"
								name="intent"
								value="test"
								variant="outline"
								disabled={isBusy}
							>
								{submittingIntent === 'test' ? 'Sending test...' : 'Send test to me'}
							</Button>
						</div>
						<div className="flex flex-col gap-2 sm:flex-row">
							<Button type="button" variant="outline" onClick={handleClose}>
								Cancel
							</Button>
							<Button type="submit" name="intent" value="save" disabled={isBusy}>
								{submittingIntent === 'save' ? 'Saving...' : 'Save'}
							</Button>
						</div>
					</DialogFooter>
				</Form>
			</DialogContent>
		</Dialog>
	)
}
