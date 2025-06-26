import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	redirect,
} from '@remix-run/node'
import { Form } from '@remix-run/react'
import { requireUserWithRoles } from '~/utils/auth.server'
import { registrationWizard } from '~/utils/registration.server'

import {
	AlertCircle,
	ArrowRight,
	FileImage,
	FileText,
	Mail,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

export async function loader({ request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['focal', 'admin'])
	const { save } = await registrationWizard.register(request)
	const generalInfo = {
		tenantId: '',
		eventId: '',
		participantTypeId: '',
		gender: '',
		title: '',
		firstName: '',
		familyName: '',
		dateOfBirth: '',
		nationalityId: '',
		passportNumber: '',
		passportExpiry: '',
	}

	save('general', generalInfo)

	return json({})
}

export async function action({ request }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['focal', 'admin'])
	const { save, getHeaders } = await registrationWizard.register(request)
	const generalInfo = {
		tenantId: '',
		eventId: '',
		participantTypeId: '',
		gender: '',
		title: '',
		firstName: '',
		familyName: '',
		dateOfBirth: '',
		nationalityId: '',
		passportNumber: '',
		passportExpiry: '',
	}

	save('general', generalInfo)
	const headers = await getHeaders()

	return redirect('/admin/participants/general', { headers })
}

function InfoSection({
	icon: Icon,
	title,
	children,
}: {
	icon: React.ElementType
	title: string
	children: React.ReactNode
}) {
	return (
		<div className="space-y-2">
			<h3 className="flex items-center font-medium text-gray-800">
				<Icon className="mr-2 h-5 w-5 text-primary" />
				{title}
			</h3>
			{children}
		</div>
	)
}

export default function NewParticipantRoute() {
	return (
		<Card className="mx-auto w-full max-w-3xl overflow-hidden">
			<CardHeader>
				<CardTitle className="flex items-center text-xl font-semibold text-gray-800">
					<AlertCircle className="mr-2 h-5 w-5 text-destructive" />
					Important Information
				</CardTitle>
			</CardHeader>
			<CardContent className="space-y-6">
				<p className="text-sm italic text-muted-foreground">
					All fields marked with an asterisk (*) are mandatory.
				</p>

				<InfoSection icon={FileImage} title="Photo and Passport Requirements">
					<ul className="list-inside list-disc space-y-1 pl-5 text-sm text-muted-foreground">
						<li>File size: Less than 2MB, Format: JPG or PNG</li>
						<li>
							Photo: 45x35mm, plain background, no accessories, visible ears
						</li>
						<li>Passport: Name, dates & photos must be clearly visible</li>
					</ul>
				</InfoSection>

				<InfoSection icon={FileText} title="Participation Letter Guidelines">
					<ul className="list-inside list-disc space-y-1 pl-5 text-sm text-muted-foreground">
						<li>File size: Less than 2MB, Format: PDF, PNG, or JPG</li>
						<li>Content: Clear stamps and delegate names</li>
						<li>Participant&apos;s name must be included in the letter</li>
					</ul>
				</InfoSection>

				<InfoSection icon={Mail} title="Confirmation and Support">
					<p className="text-sm text-muted-foreground">
						Check your email for the confirmation letter.
					</p>
					<p className="text-sm text-muted-foreground">
						For inquiries:{' '}
						<a
							href="mailto:accreditation@mfa.gov.et"
							className="text-primary hover:underline"
						>
							accreditation@mfa.gov.et
						</a>
					</p>
					<p className="text-sm text-muted-foreground">
						Help desk: +251 11 518 2744 / +251 11 518 2745 / +251 11 518 2746
					</p>
				</InfoSection>

				<Form method="post" className="w-full">
					<Button type="submit" name="intent" value="start" className="w-full">
						Start Registration Form
						<ArrowRight className="ml-2 h-4 w-4" />
					</Button>
				</Form>
			</CardContent>
		</Card>
	)
}
