import { useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { Event } from '@prisma/client'
import {
	Document,
	Page,
	PDFDownloadLink,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer'
import { SerializeFrom } from '@remix-run/node'
import { useActionData } from '@remix-run/react'
import { useEffect, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { FormCard } from '~/components/form-card'
import { Progress } from '~/components/ui/progress'
import { useIsPending } from '~/utils/misc'
import { type action } from './__invitation-editor.server'

export const SecretsEditorSchema = z.object({
	tenantId: z.string({ required_error: 'Tenant is required' }),
	eventId: z.string({ required_error: 'Event is required' }),
})

type SecretResult = {
	email: string
	password: string
	status: 'updated' | 'created'
	organizations: string
}[]

// Add PDF styles
const styles = StyleSheet.create({
	page: {
		padding: 30,
		fontSize: 10,
	},
	header: {
		marginBottom: 20,
	},
	title: {
		fontSize: 18,
		marginBottom: 8,
		textAlign: 'center',
		fontWeight: 'bold',
		color: '#111827',
	},
	subtitle: {
		fontSize: 10,
		textAlign: 'center',
		color: '#6B7280',
	},
	table: {
		width: '100%',
	},
	tableRow: {
		flexDirection: 'row',
		alignItems: 'center',
		paddingVertical: 8,
		borderBottomWidth: 1,
		borderBottomColor: '#E5E7EB',
		minHeight: 36,
	},
	tableHeader: {
		backgroundColor: '#F9FAFB',
		borderTopWidth: 1,
		borderTopColor: '#E5E7EB',
	},
	cell: {
		paddingHorizontal: 12,
	},
	indexCell: {
		width: '5%',
	},
	emailCell: {
		width: '35%',
	},
	orgCell: {
		width: '35%',
	},
	passwordCell: {
		width: '25%',
	},
	headerText: {
		fontSize: 10,
		fontWeight: 'bold',
		color: '#374151',
	},
	cellText: {
		fontSize: 9,
		color: '#111827',
	},
	footer: {
		position: 'absolute',
		bottom: 30,
		left: 0,
		right: 0,
		textAlign: 'center',
		color: '#6B7280',
		fontSize: 8,
	},
})

// Create PDF Document component
const CredentialsPDF = ({
	credentials,
	event,
}: {
	credentials: SecretResult
	event: SerializeFrom<Pick<Event, 'id' | 'name' | 'tenantId'>>
}) => (
	<Document>
		{chunk(credentials, 30).map((pageCredentials, pageIndex) => (
			<Page
				key={pageIndex}
				size="A4"
				orientation="landscape"
				style={styles.page}
			>
				<View style={styles.header}>
					<Text style={styles.title}>{event.name}</Text>
					<Text style={styles.subtitle}>Access Credentials</Text>
				</View>

				<View style={styles.table}>
					<View style={[styles.tableRow, styles.tableHeader]}>
						<Text style={[styles.cell, styles.indexCell, styles.headerText]}>
							#
						</Text>
						<Text style={[styles.cell, styles.emailCell, styles.headerText]}>
							Email Address
						</Text>
						<Text style={[styles.cell, styles.orgCell, styles.headerText]}>
							Organization
						</Text>
						<Text style={[styles.cell, styles.passwordCell, styles.headerText]}>
							Password
						</Text>
					</View>

					{pageCredentials.map((cred, index) => (
						<View key={index} style={styles.tableRow}>
							<Text style={[styles.cell, styles.indexCell, styles.cellText]}>
								{index + 1 + pageIndex * 30}
							</Text>
							<Text style={[styles.cell, styles.emailCell, styles.cellText]}>
								{cred.email}
							</Text>
							<Text style={[styles.cell, styles.orgCell, styles.cellText]}>
								{cred.organizations}
							</Text>
							<Text style={[styles.cell, styles.passwordCell, styles.cellText]}>
								{cred.password}
							</Text>
						</View>
					))}
				</View>

				<Text style={styles.footer}>
					Page {pageIndex + 1} of {Math.ceil(credentials.length / 30)}
				</Text>
			</Page>
		))}
	</Document>
)

// Helper function to chunk array for pagination
function chunk<T>(array: T[], size: number): T[][] {
	return Array.from({ length: Math.ceil(array.length / size) }, (_, index) =>
		array.slice(index * size, (index + 1) * size),
	)
}

export function SecretsEditor({
	event,
	title,
}: {
	event: SerializeFrom<Pick<Event, 'id' | 'name' | 'tenantId'>>
	title: string
}) {
	const actionData = useActionData<typeof action>()
	const [progress, setProgress] = useState(0)
	const isPending = useIsPending()

	const schema = SecretsEditorSchema
	const [form, fields] = useForm({
		id: 'register-secrets',
		constraint: getZodConstraint(schema),
		onValidate({ formData }) {
			return parseWithZod(formData, { schema })
		},
		shouldValidate: 'onBlur',
		shouldRevalidate: 'onInput',
		defaultValue: {
			eventId: event.id,
			tenantId: event.tenantId,
		},
	})

	useEffect(() => {
		if (isPending) {
			setProgress(0)
			const timer = setInterval(() => {
				setProgress(prev => {
					if (prev >= 90) {
						clearInterval(timer)
						return 90
					}
					return prev + 10
				})
			}, 500)
			return () => clearInterval(timer)
		} else {
			setProgress(100)
		}
	}, [isPending])

	return (
		<FormCard
			title={title}
			formId={form.id}
			onSubmit={form.onSubmit}
			buttons={[
				{
					label: 'Generate',
					intent: 'secrets',
					variant: 'default',
					type: 'submit',
					disabled: isPending,
					status: isPending ? 'pending' : (form.status ?? 'idle'),
				},
				{
					label: 'Cancel',
					to: `/admin/events/${event.id}/invitations`,
					type: 'link',
				},
			]}
		>
			{!isPending && !actionData?.result && (
				<div className="mb-6 rounded-md bg-green-50 p-4">
					<div className="flex">
						<div className="ml-3">
							<div className="mt-2 text-sm text-green-700">
								<p>
									This will generate secure passwords for all focal persons in
									this event. Each focal person will receive a unique password
									that can be used to access the system. Make sure to download
									and save the credentials after generation as they cannot be
									retrieved later.
								</p>
							</div>
						</div>
					</div>
				</div>
			)}

			<AuthenticityTokenInput />
			<HoneypotInputs />
			<InputField meta={fields.eventId} type="hidden" />
			<InputField meta={fields.tenantId} type="hidden" />

			<div className="flex flex-col gap-4">
				{isPending ? (
					<div className="flex flex-col gap-2">
						<Progress value={progress} className="w-full" />
						<p className="text-center text-sm text-muted-foreground">
							Generating secrets...
						</p>
					</div>
				) : actionData?.result ? (
					Array.isArray(actionData.result) &&
					actionData.result.length > 0 &&
					'email' in actionData.result[0] ? (
						<div className="flex flex-col gap-4">
							<div className="rounded-md bg-green-50 p-4">
								<div className="flex">
									<div className="flex-shrink-0">
										<svg
											className="h-5 w-5 text-green-400"
											viewBox="0 0 20 20"
											fill="currentColor"
										>
											<path
												fillRule="evenodd"
												d="M10 18a8 8 0 100-16 8 8 0 000 16zm3.857-9.809a.75.75 0 00-1.214-.882l-3.483 4.79-1.88-1.88a.75.75 0 10-1.06 1.061l2.5 2.5a.75.75 0 001.137-.089l4-5.5z"
												clipRule="evenodd"
											/>
										</svg>
									</div>
									<div className="ml-3 flex-grow">
										<h3 className="text-sm font-medium text-green-800">
											Credentials Generated Successfully
										</h3>
										<div className="mt-2 text-sm text-green-700">
											<p className="mb-4">
												Please download the PDF containing these credentials
												immediately. For security reasons, this is the only time
												you will be able to view these passwords.
											</p>
											<PDFDownloadLink
												document={
													<CredentialsPDF
														credentials={actionData.result as SecretResult}
														event={event}
													/>
												}
												fileName={`credentials-${event.name}.pdf`}
												className="inline-flex h-9 items-center justify-center rounded-md bg-green-100 px-4 py-2 text-sm font-medium text-green-800 ring-1 ring-inset ring-green-600/20 hover:bg-green-200"
											>
												Download Credentials PDF
											</PDFDownloadLink>
										</div>
									</div>
								</div>
							</div>

							<div className="overflow-x-auto">
								<table className="w-full text-sm">
									<thead>
										<tr className="border-b">
											<th className="px-4 py-2 text-left">#</th>
											<th className="px-4 py-2 text-left">Email</th>
											<th className="px-4 py-2 text-left">Organizations</th>
											<th className="px-4 py-2 text-left">Secret</th>
											<th className="px-4 py-2 text-left">Status</th>
										</tr>
									</thead>
									<tbody>
										{(actionData.result as SecretResult).map((cred, index) => (
											<tr key={index} className="border-b">
												<td className="px-4 py-2">{index + 1}</td>
												<td className="px-4 py-2">{cred.email}</td>
												<td className="px-4 py-2">{cred.organizations}</td>
												<td className="px-4 py-2">{cred.password}</td>
												<td className="px-4 py-2">{cred.status}</td>
											</tr>
										))}
									</tbody>
								</table>
							</div>
						</div>
					) : (
						<p className="text-sm text-muted-foreground">
							{Array.isArray(actionData.result)
								? actionData.result.join(', ')
								: 'No results'}
						</p>
					)
				) : null}
			</div>
		</FormCard>
	)
}
