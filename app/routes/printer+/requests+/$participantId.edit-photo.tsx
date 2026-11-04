import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
	unstable_parseMultipartFormData as parseMultipartFormData,
} from '@remix-run/node'
import { Form, useLoaderData, useNavigate, useNavigation, useParams } from '@remix-run/react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { PhotoEditor } from '~/components/photo-editor'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Button } from '~/components/ui/button'
import { StatusButton } from '~/components/ui/status-button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { Action, RequestStatus } from '@prisma/client'
import {
	getUserAccessibleStepIds,
	requireUserWithRoles,
} from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { getParticipantDocumentFileSrc, invariantResponse } from '~/utils/misc'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { uploadFile } from '~/utils/storage.server'
import { redirectWithToast } from '~/utils/toast.server'

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])

	const { participantId } = params

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['printer'])

	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			deletedAt: null,
			OR: [
				{ stepId: { in: accessibleStepIds } },
				{
					status: RequestStatus.PRINTED,
					approvals: {
						some: { action: Action.PRINT, stepId: { in: accessibleStepIds } },
					},
				},
			],
		},
		select: {
			id: true,
			firstName: true,
			familyName: true,
			documents: {
				where: { documentType: 'PHOTO' },
				select: {
					id: true,
					fileName: true,
					extension: true,
					contentType: true,
				},
			},
		},
	})

	invariantResponse(participant, 'Access denied', { status: 403 })
	invariantResponse(participant.documents[0], 'No photo to edit', {
		status: 404,
	})

	const photo = participant.documents[0]
	const photoUrl = getParticipantDocumentFileSrc(photo.id)

	return json({
		participant: {
			id: participant.id,
			firstName: participant.firstName,
			familyName: participant.familyName,
		},
		photo: {
			id: photo.id,
			fileName: photo.fileName,
			extension: photo.extension,
			url: photoUrl,
		},
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])

	const { participantId } = params
	invariantResponse(participantId, 'Participant ID required')

	// Get upload settings
	const maxImageSizeMB = await getSetting<number>(SettingKeys.UPLOAD_MAX_IMAGE_SIZE_MB)
	const maxImageSizeBytes = maxImageSizeMB * 1024 * 1024

	const uploadHandler = createMemoryUploadHandler({
		maxPartSize: maxImageSizeBytes,
	})

	const formData = await parseMultipartFormData(request, uploadHandler)

	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	// Get step IDs the user has access to via UserEventAccess
	const accessibleStepIds = await getUserAccessibleStepIds(user.id, ['printer'])

	const participant = await prisma.participant.findFirst({
		where: {
			id: participantId,
			deletedAt: null,
			OR: [
				{ stepId: { in: accessibleStepIds } },
				{
					status: RequestStatus.PRINTED,
					approvals: {
						some: { action: Action.PRINT, stepId: { in: accessibleStepIds } },
					},
				},
			],
		},
		include: {
			documents: {
				where: { documentType: 'PHOTO' },
			},
		},
	})

	invariantResponse(participant, 'Access denied', { status: 403 })

	const photoFile = formData.get('photo') as File | null
	invariantResponse(photoFile && photoFile.size > 0, 'Photo file required')

	// Get the existing photo document
	const existingPhoto = participant.documents[0]
	invariantResponse(existingPhoto, 'No existing photo to update')

	// Upload the new photo to the same path as the original
	// Path structure: accreditation/participants/{participantId}/{fileName}.{extension}
	const arrayBuffer = await photoFile.arrayBuffer()
	const buffer = Buffer.from(arrayBuffer)

	await uploadFile({
		containerName: 'accreditation',
		directory: `participants/${participantId}`,
		fileName: existingPhoto.fileName,
		extension: existingPhoto.extension,
		blob: buffer,
	})

	// Update the timestamp to invalidate caches
	await prisma.participantDocument.update({
		where: { id: existingPhoto.id },
		data: {
			updatedAt: new Date(),
		},
	})

	return redirectWithToast(`/printer/requests/${participantId}`, {
		type: 'success',
		title: 'Photo Updated',
		description: 'The participant photo has been updated successfully.',
	})
}

export default function EditPhotoDialog() {
	const { participant, photo } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const navigation = useNavigation()
	const params = useParams()

	const isSubmitting = navigation.state === 'submitting'

	const [isEditorOpen, setIsEditorOpen] = useState(true)
	const [editedPhotoBlob, setEditedPhotoBlob] = useState<Blob | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)

	const handleCancel = () => {
		navigate(`/printer/requests/${params.participantId}`)
	}

	const handleEditorSave = (blob: Blob) => {
		setEditedPhotoBlob(blob)
		setPreviewUrl(URL.createObjectURL(blob))
		setIsEditorOpen(false)
	}

	const handleReopen = () => {
		setIsEditorOpen(true)
	}

	return (
		<>
			{/* Photo Editor Dialog */}
			<PhotoEditor
				imageUrl={photo.url}
				open={isEditorOpen}
				onClose={handleCancel}
				onSave={handleEditorSave}
				aspectRatio={3 / 4}
				title={`Edit Photo - ${participant.firstName} ${participant.familyName}`}
			/>

			{/* Confirmation Dialog after editing */}
			{editedPhotoBlob && !isEditorOpen && (
				<Dialog open={true} onOpenChange={handleCancel}>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle className="text-center">
								Confirm Photo Update
							</DialogTitle>
							<DialogDescription className="text-center">
								Review the edited photo and confirm to save changes.
							</DialogDescription>
						</DialogHeader>

						{/* Preview */}
						<div className="flex justify-center">
							<div className="relative h-48 w-36 overflow-hidden rounded-lg border bg-slate-100">
								{previewUrl && (
									<img
										src={previewUrl}
										alt="Edited preview"
										className="h-full w-full object-cover"
									/>
								)}
							</div>
						</div>

						<Form method="POST" encType="multipart/form-data">
							<AuthenticityTokenInput />
							<HoneypotInputs />
							<input
								type="hidden"
								name="photo"
								value=""
							/>
							<DialogFooter className="gap-2 sm:gap-0">
								<Button
									type="button"
									variant="outline"
									onClick={handleCancel}
									disabled={isSubmitting}
								>
									Cancel
								</Button>
								<Button
									type="button"
									variant="secondary"
									onClick={handleReopen}
									disabled={isSubmitting}
								>
									Edit Again
								</Button>
								<StatusButton
									type="submit"
									status={isSubmitting ? 'pending' : 'idle'}
									disabled={isSubmitting}
									onClick={(e) => {
										// Replace the hidden input with the actual file
										const form = e.currentTarget.closest('form')
										if (form && editedPhotoBlob) {
											const dataTransfer = new DataTransfer()
											const file = new File([editedPhotoBlob], 'photo.jpg', {
												type: 'image/jpeg',
											})
											dataTransfer.items.add(file)

											// Find or create file input
											let fileInput = form.querySelector(
												'input[name="photo"][type="file"]',
											) as HTMLInputElement | null
											if (!fileInput) {
												fileInput = document.createElement('input')
												fileInput.type = 'file'
												fileInput.name = 'photo'
												fileInput.style.display = 'none'
												form.appendChild(fileInput)
											}
											fileInput.files = dataTransfer.files

											// Remove the hidden input
											const hiddenInput = form.querySelector(
												'input[name="photo"][type="hidden"]',
											)
											if (hiddenInput) {
												hiddenInput.remove()
											}
										}
									}}
								>
									Save Photo
								</StatusButton>
							</DialogFooter>
						</Form>
					</DialogContent>
				</Dialog>
			)}
		</>
	)
}

export function ErrorBoundary() {
	return (
		<GeneralErrorBoundary
			statusHandlers={{
				403: () => (
					<ErrorDisplay
						title="Access Denied"
						message="You are not authorized to edit this photo."
						redirectUrl="/printer/requests"
						errorCode={403}
					/>
				),
				404: () => (
					<ErrorDisplay
						title="Photo Not Found"
						message="No photo exists for this participant."
						redirectUrl="/printer/requests"
						errorCode={404}
					/>
				),
			}}
		/>
	)
}
