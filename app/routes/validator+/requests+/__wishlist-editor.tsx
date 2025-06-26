import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { MeetingType, Participant, ParticipantType } from '@prisma/client'
import { SerializeFrom } from '@remix-run/node'
import { useActionData, useOutletContext } from '@remix-run/react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { CheckboxGroupField } from '~/components/conform/CheckboxGroupField'
import { InputField } from '~/components/conform/InputField'
import { SelectField } from '~/components/conform/SelectField'
import { FormCard } from '~/components/form-card'
import { Field } from '~/components/forms'
import { Label } from '~/components/ui/label'
import { useIsPending } from '~/utils/misc'
import { type action } from './$participantId_.edit'

export const WishlistEditorSchema = z.object({
	id: z.string().optional(),
	participantTypeId: z.string({
		required_error: 'Please select a participant type',
	}),
	meetings: z.array(z.string()).optional(),
})

export function WishlistEditor({
	participant,
	participantTypes,
}: {
	participant?: SerializeFrom<
		Pick<Participant, 'id' | 'attendClosedSession' | 'participantTypeId'> & {
			meetings: Array<string>
		}
	>
	participantTypes: SerializeFrom<Pick<ParticipantType, 'id' | 'name'>[]>
}) {
	const { meetingTypes } = useOutletContext<{
		meetingTypes: MeetingType[]
	}>()

	const actionData = useActionData<typeof action>()
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
					to: `/validator/requests/${participant?.id}`,
					type: 'link',
				},
			]}
		>
			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.id} type="hidden" />

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
