import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
	unstable_parseMultipartFormData as parseMultipartFormData,
} from '@remix-run/node'
import {
	Form,
	useLoaderData,
	useNavigate,
	useNavigation,
} from '@remix-run/react'
import * as React from 'react'
import { useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { safeRedirect } from 'remix-utils/safe-redirect'
import { PhotoEditor } from '~/components/photo-editor'
import { ErrorDisplay, GeneralErrorBoundary } from '~/components/error-boundary'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { createId } from '@paralleldrive/cuid2'
import { Action, AuditAction, AuditEntityType } from '@prisma/client'
import { auditRequest } from '~/utils/audit.server'
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
import { ISSUED_STATUSES } from '~/utils/badge-status'

/**
 * Where to go after saving or cancelling: back to the page that sent the
 * printer here (e.g. a box), if it's a printer page, else the participant.
 */
function returnTo(
	raw: FormDataEntryValue | string | null,
	participantId: string,
) {
	const fallback = `/printer/requests/${participantId}`
	const to = typeof raw === 'string' ? safeRedirect(raw, fallback) : fallback
	return to.startsWith('/printer/') ? to : fallback
}

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
					status: { in: [...ISSUED_STATUSES] },
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

	// No photo yet: the printer can add one.
	const photo = participant.documents[0] ?? null

	return json({
		redirectTo: returnTo(
			new URL(request.url).searchParams.get('redirectTo'),
			participant.id,
		),
		participant: {
			id: participant.id,
			firstName: participant.firstName,
			familyName: participant.familyName,
		},
		photo: photo && {
			id: photo.id,
			fileName: photo.fileName,
			extension: photo.extension,
			url: getParticipantDocumentFileSrc(photo.id),
		},
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireUserWithRoles(request, ['printer'])

	const { participantId } = params
	invariantResponse(participantId, 'Participant ID required')

	// Get upload settings
	const maxImageSizeMB = await getSetting<number>(
		SettingKeys.UPLOAD_MAX_IMAGE_SIZE_MB,
	)
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
					status: { in: [...ISSUED_STATUSES] },
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

	const existingPhoto = participant.documents[0]
	const redirectTo = returnTo(formData.get('redirectTo'), participantId)

	// Path structure: accreditation/participants/{participantId}/{fileName}.{extension}
	const arrayBuffer = await photoFile.arrayBuffer()
	const buffer = Buffer.from(arrayBuffer)

	if (!existingPhoto) {
		// The editor always saves a JPEG.
		const fileName = `photo-${createId()}`
		await uploadFile({
			containerName: 'accreditation',
			directory: `participants/${participantId}`,
			fileName,
			extension: 'jpg',
			blob: buffer,
		})
		await prisma.participantDocument.create({
			data: {
				participantId,
				documentType: 'PHOTO',
				contentType: 'image/jpeg',
				fileName,
				extension: 'jpg',
				altText: `${participant.firstName} ${participant.familyName}`,
			},
		})
		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.PARTICIPANT,
			entityId: participantId,
			description: `Added a photo for ${participant.firstName} ${participant.familyName}`,
			userId: user.id,
			tenantId: participant.tenantId,
		})
		return redirectWithToast(redirectTo, {
			type: 'success',
			title: 'Photo added',
			description: `${participant.firstName} ${participant.familyName}’s badge can be printed with a photo now.`,
		})
	}

	// Upload the new photo to the same path as the original
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

	return redirectWithToast(redirectTo, {
		type: 'success',
		title: 'Photo Updated',
		description: 'The participant photo has been updated successfully.',
	})
}

export default function EditPhotoDialog() {
	const { participant, photo, redirectTo } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const navigation = useNavigation()

	const isSubmitting = navigation.state === 'submitting'

	// Adding a photo: the file the printer picked, until it's cropped.
	const [picked, setPicked] = useState<string | null>(null)
	React.useEffect(
		() => () => {
			if (picked) URL.revokeObjectURL(picked)
		},
		[picked],
	)
	const imageUrl = photo?.url ?? picked
	const [isEditorOpen, setIsEditorOpen] = useState(true)
	const [editedPhotoBlob, setEditedPhotoBlob] = useState<Blob | null>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)

	const handleCancel = () => {
		navigate(redirectTo)
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
			{!imageUrl && (
				<Dialog open={true} onOpenChange={handleCancel}>
					<DialogContent className="sm:max-w-md">
						<DialogHeader>
							<DialogTitle className="text-center">
								Add a photo for {participant.firstName} {participant.familyName}
							</DialogTitle>
							<DialogDescription className="text-center">
								There’s no photo yet. Choose one, then crop it for the badge.
							</DialogDescription>
						</DialogHeader>
						<Label htmlFor="new-photo" className="sr-only">
							Photo
						</Label>
						<Input
							id="new-photo"
							type="file"
							accept="image/jpeg,image/png"
							onChange={e => {
								const file = e.currentTarget.files?.[0]
								if (file) setPicked(URL.createObjectURL(file))
							}}
						/>
						<DialogFooter>
							<Button type="button" variant="outline" onClick={handleCancel}>
								Cancel
							</Button>
						</DialogFooter>
					</DialogContent>
				</Dialog>
			)}

			{/* Photo Editor Dialog */}
			{imageUrl && (
				<PhotoEditor
					imageUrl={imageUrl}
					open={isEditorOpen}
					onClose={handleCancel}
					onSave={handleEditorSave}
					aspectRatio={3 / 4}
					title={`${photo ? 'Edit' : 'Add'} Photo - ${participant.firstName} ${participant.familyName}`}
				/>
			)}

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
							<input type="hidden" name="redirectTo" value={redirectTo} />
							<input type="hidden" name="photo" value="" />
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
									onClick={e => {
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
