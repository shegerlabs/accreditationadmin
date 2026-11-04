import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { MeetingType, Participant, ParticipantType } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext, useSearchParams } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { Field } from '~/components/forms'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Label } from '~/components/ui/label'
import { useIsPending } from '~/utils/misc'
import { type QuotaUsageInfo } from '~/utils/quota.server'
import { type action } from './$participantId_.edit'

export const WishlistEditorSchema = z.object({
	id: z.string().optional(),
	participantTypeId: z.string({
		required_error: 'Please select a participant type',
	}),
	meetings: z.array(z.string()).optional(),
	attendClosedSession: z.string().optional(),
})

export function WishlistEditor({
	participant,
	participantTypes,
	quotaUsage,
}: {
	participant?: SerializeFrom<
		Pick<Participant, 'id' | 'attendClosedSession' | 'participantTypeId'> & {
			meetings: Array<string>
		}
	>
	participantTypes: SerializeFrom<Pick<ParticipantType, 'id' | 'name'>[]>
	quotaUsage?: QuotaUsageInfo | null
}) {
	const { meetingTypes } = useOutletContext<{
		meetingTypes: MeetingType[]
	}>()

	const actionData = useActionData<typeof action>()
	const [searchParams] = useSearchParams()
	const paramsSuffix = searchParams.size ? '?' + searchParams.toString() : ''
	const schema = WishlistEditorSchema
	const isPending = useIsPending()
	const [form, fields] = useForm({
		id: 'wishlist-editor',
		constraint: getZodConstraint(schema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			...participant,
			meetings: participant?.meetings.map(meeting => meeting),
			attendClosedSession: participant?.attendClosedSession ? 'on' : '',
		},
	})

	return (
		<FormCard
			formId={form.id}
			onSubmit={form.onSubmit}
			buttons={[
				{
					label: 'Update',
					intent: 'wishlist',
					variant: 'default',
					disabled: isPending,
					status: actionData?.result.status,
					type: 'submit',
				},
				{
					label: 'Cancel',
					to: `/validator/requests/${participant?.id}${paramsSuffix}`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

			{quotaUsage && (() => {
				const hasConstraints = quotaUsage.constraints.length > 0
				const hasMaxQuota = quotaUsage.maximumQuota && quotaUsage.maximumQuota > 0
				if (!hasConstraints && !hasMaxQuota) return null
				const isAtLimit = quotaUsage.constraints.some(
					c => c.quota > 0 && c.used >= c.quota,
				) || (hasMaxQuota && quotaUsage.totalUsed >= quotaUsage.maximumQuota!)
				return (
					<Alert variant={isAtLimit ? 'warning' : 'muted'}>
						<AlertTitle>Quota Usage</AlertTitle>
						<AlertDescription>
							<ul className="mt-1 space-y-0.5 text-xs">
								{quotaUsage.constraints.map((c, i) => (
									<li key={i}>
										{c.participantType} ({c.accessLevel}): {c.used} / {c.quota === 0 ? 'unlimited' : c.quota}
									</li>
								))}
								{hasMaxQuota && (
									<li>Overall: {quotaUsage.totalUsed} / {quotaUsage.maximumQuota}</li>
								)}
							</ul>
						</AlertDescription>
					</Alert>
				)
			})()}

			<Field>
				<Label htmlFor={fields.participantTypeId.id}>Participant Type</Label>
				<SelectField
					meta={fields.participantTypeId}
					items={participantTypes
						.filter(pt => pt.name !== 'All')
						.map(pt => {
							return {
								name: pt.name,
								value: pt.id,
							}
						})}
					placeholder="Select"
				/>
			</Field>

			<Field>
				<fieldset>
					<legend className="mb-2 text-sm font-medium leading-none peer-disabled:cursor-not-allowed peer-disabled:opacity-70">
						Meetings Wishlist
					</legend>
					<CheckboxGroupField
						meta={fields.meetings}
						items={meetingTypes.map(meetingType => ({
							name: meetingType.name,
							value: meetingType.id,
						}))}
					/>
				</fieldset>
			</Field>
		</FormCard>
	)
}
