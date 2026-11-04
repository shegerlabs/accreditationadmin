import { getFormProps, useForm } from '@conform-to/react'
import { getZodConstraint, parseWithZod } from '@conform-to/zod'
import { AuditAction, AuditEntityType } from '@prisma/client'
import {
	ActionFunctionArgs,
	json,
	LoaderFunctionArgs,
	unstable_createMemoryUploadHandler as createMemoryUploadHandler,
	unstable_parseMultipartFormData as parseMultipartFormData,
} from '@remix-run/node'
import { Form, Link, useActionData, useLoaderData } from '@remix-run/react'
import { Camera, X } from 'lucide-react'
import { useRef, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import { InputField } from '~/components/conform/InputField'
import { ErrorList, Field, FieldError } from '~/components/forms'
import { Avatar, AvatarFallback, AvatarImage } from '~/components/ui/avatar'
import { Button } from '~/components/ui/button'
import {
	Card,
	CardContent,
	CardDescription,
	CardFooter,
	CardHeader,
	CardTitle,
} from '~/components/ui/card'
import { Label } from '~/components/ui/label'
import { StatusButton } from '~/components/ui/status-button'
import { auditRequest } from '~/utils/audit.server'
import { requireUserId } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import { getSetting, SettingKeys } from '~/utils/settings.server'
import { redirectWithToast } from '~/utils/toast.server'

function createEditProfileSchema(maxImageSizeBytes: number, allowedImageTypes: string[]) {
	return z.object({
		name: z
			.string()
			.min(2, 'Name must be at least 2 characters')
			.max(100, 'Name must be less than 100 characters')
			.optional()
			.or(z.literal('')),
		photo: z
			.instanceof(File)
			.optional()
			.refine(
				file => !file || file.size === 0 || file.size <= maxImageSizeBytes,
				`Image must be less than ${Math.round(maxImageSizeBytes / (1024 * 1024))}MB`,
			)
			.refine(
				file => !file || file.size === 0 || allowedImageTypes.includes(file.type),
				'Only .jpg, .jpeg, .png, and .webp formats are supported',
			),
		deletePhoto: z.string().optional(),
	})
}

export async function loader({ request }: LoaderFunctionArgs) {
	const userId = await requireUserId(request)

	const [user, maxImageSizeMB, allowedImageTypes] = await Promise.all([
		prisma.user.findUnique({
			where: { id: userId },
			select: {
				id: true,
				name: true,
				username: true,
				image: {
					select: { id: true },
				},
			},
		}),
		getSetting<number>(SettingKeys.UPLOAD_MAX_IMAGE_SIZE_MB),
		getSetting<string[]>(SettingKeys.UPLOAD_ALLOWED_IMAGE_TYPES),
	])

	invariantResponse(user, 'User not found', { status: 404 })

	return json({ user, maxImageSizeMB, allowedImageTypes })
}

export async function action({ request }: ActionFunctionArgs) {
	const userId = await requireUserId(request)

	// Get upload settings
	const [maxImageSizeMB, allowedImageTypes] = await Promise.all([
		getSetting<number>(SettingKeys.UPLOAD_MAX_IMAGE_SIZE_MB),
		getSetting<string[]>(SettingKeys.UPLOAD_ALLOWED_IMAGE_TYPES),
	])
	const maxImageSizeBytes = maxImageSizeMB * 1024 * 1024

	const uploadHandler = createMemoryUploadHandler({
		maxPartSize: maxImageSizeBytes,
	})

	const formData = await parseMultipartFormData(request, uploadHandler)

	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const EditProfileSchema = createEditProfileSchema(maxImageSizeBytes, allowedImageTypes)
	const submission = parseWithZod(formData, {
		schema: EditProfileSchema,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { name, photo, deletePhoto } = submission.value

	// Get current user for audit log
	const currentUser = await prisma.user.findUnique({
		where: { id: userId },
		select: { id: true, name: true, username: true, email: true, tenantId: true, image: { select: { id: true } } },
	})

	// Prepare update data
	const updateData: { name?: string | null } = {}
	const changes: string[] = []

	// Update name if provided
	if (name !== undefined) {
		const newName = name.trim() || null
		if (newName !== currentUser?.name) {
			updateData.name = newName
			changes.push(`name changed from "${currentUser?.name ?? 'none'}" to "${newName ?? 'none'}"`)
		}
	}

	// Handle photo deletion
	if (deletePhoto === 'true' && currentUser?.image?.id) {
		await prisma.userImage.delete({
			where: { id: currentUser.image.id },
		})
		changes.push('profile photo removed')
	}

	// Handle photo upload
	if (photo && photo.size > 0) {
		const photoBuffer = Buffer.from(await photo.arrayBuffer())

		if (currentUser?.image?.id) {
			// Update existing image
			await prisma.userImage.update({
				where: { id: currentUser.image.id },
				data: {
					blob: photoBuffer,
					contentType: photo.type,
					altText: `${currentUser.username}'s profile photo`,
				},
			})
		} else {
			// Create new image
			await prisma.userImage.create({
				data: {
					userId,
					blob: photoBuffer,
					contentType: photo.type,
					altText: `${currentUser?.username}'s profile photo`,
				},
			})
		}
		changes.push('profile photo updated')
	}

	// Update user if there are name changes
	if (Object.keys(updateData).length > 0) {
		await prisma.user.update({
			where: { id: userId },
			data: updateData,
		})
	}

	// Log the changes if any
	if (changes.length > 0) {
		await auditRequest({
			request,
			action: AuditAction.UPDATE,
			entityType: AuditEntityType.USER,
			entityId: userId,
			description: `Profile updated for ${currentUser?.username}: ${changes.join(', ')}`,
			userId,
			tenantId: currentUser?.tenantId,
			metadata: {
				user: { id: currentUser?.id, username: currentUser?.username, email: currentUser?.email },
				changes,
			},
		})
	}

	return redirectWithToast('/settings/profile', {
		type: 'success',
		title: 'Profile Updated',
		description: changes.length > 0 ? 'Your profile has been updated successfully.' : 'No changes were made.',
	})
}

function getInitials(name: string | null, username: string): string {
	if (name) {
		const parts = name.trim().split(/\s+/)
		if (parts.length >= 2) {
			return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase()
		}
		return name.slice(0, 2).toUpperCase()
	}
	return username.slice(0, 2).toUpperCase()
}

export default function EditProfileRoute() {
	const { user, maxImageSizeMB, allowedImageTypes } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const isPending = useIsPending()
	const fileInputRef = useRef<HTMLInputElement>(null)
	const [previewUrl, setPreviewUrl] = useState<string | null>(null)
	const [deletePhoto, setDeletePhoto] = useState(false)

	const maxImageSizeBytes = maxImageSizeMB * 1024 * 1024
	const EditProfileSchema = createEditProfileSchema(maxImageSizeBytes, allowedImageTypes)

	const [form, fields] = useForm({
		id: 'edit-profile-form',
		constraint: getZodConstraint(EditProfileSchema),
		lastResult: actionData?.result,
		onValidate({ formData }) {
			return parseWithZod(formData, { schema: EditProfileSchema })
		},
		defaultValue: {
			name: user.name ?? '',
		},
		shouldRevalidate: 'onBlur',
	})

	const initials = getInitials(user.name, user.username)
	const currentImageUrl = user.image?.id ? `/resources/user-images/${user.image.id}` : null
	const displayImageUrl = deletePhoto ? null : (previewUrl ?? currentImageUrl)

	const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
		const file = e.target.files?.[0]
		if (file) {
			setDeletePhoto(false)
			const url = URL.createObjectURL(file)
			setPreviewUrl(url)
		}
	}

	const handleRemovePhoto = () => {
		setPreviewUrl(null)
		setDeletePhoto(true)
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}

	const handleCancelPreview = () => {
		setPreviewUrl(null)
		setDeletePhoto(false)
		if (fileInputRef.current) {
			fileInputRef.current.value = ''
		}
	}

	return (
		<Card className="mx-auto max-w-lg">
			<CardHeader>
				<CardTitle className="text-2xl font-bold">Edit Profile</CardTitle>
				<CardDescription>
					Update your profile information and photo
				</CardDescription>
			</CardHeader>
			<CardContent>
				<Form
					className="space-y-6"
					method="POST"
					encType="multipart/form-data"
					{...getFormProps(form)}
				>
					<AuthenticityTokenInput />
					<HoneypotInputs />
					<input type="hidden" name="deletePhoto" value={deletePhoto ? 'true' : 'false'} />

					{/* Photo Upload */}
					<div className="flex flex-col items-center space-y-4">
						<div className="relative">
							<Avatar className="h-32 w-32">
								{displayImageUrl ? (
									<AvatarImage src={displayImageUrl} alt={user.name ?? user.username} />
								) : null}
								<AvatarFallback className="text-3xl font-semibold">
									{initials}
								</AvatarFallback>
							</Avatar>
							<button
								type="button"
								onClick={() => fileInputRef.current?.click()}
								className="absolute bottom-0 right-0 flex h-10 w-10 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg hover:bg-primary/90 transition-colors"
							>
								<Camera className="h-5 w-5" />
							</button>
						</div>

						<input
							ref={fileInputRef}
							type="file"
							name="photo"
							accept={allowedImageTypes.join(',')}
							onChange={handleFileChange}
							className="hidden"
						/>

						<div className="flex items-center gap-2">
							{previewUrl && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleCancelPreview}
								>
									<X className="mr-2 h-4 w-4" />
									Cancel
								</Button>
							)}
							{(currentImageUrl && !deletePhoto && !previewUrl) && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleRemovePhoto}
								>
									<X className="mr-2 h-4 w-4" />
									Remove Photo
								</Button>
							)}
							{deletePhoto && (
								<Button
									type="button"
									variant="outline"
									size="sm"
									onClick={handleCancelPreview}
								>
									Undo Remove
								</Button>
							)}
						</div>

						<p className="text-xs text-muted-foreground">
							JPG, PNG, or WebP. Max {maxImageSizeMB}MB.
						</p>

						{fields.photo.errors && (
							<FieldError>{fields.photo.errors}</FieldError>
						)}
					</div>

					{/* Name Field */}
					<Field>
						<Label htmlFor={fields.name.id}>Display Name</Label>
						<InputField
							meta={fields.name}
							type="text"
							placeholder="Enter your name"
						/>
						{fields.name.errors && (
							<FieldError>{fields.name.errors}</FieldError>
						)}
						<p className="text-sm text-muted-foreground">
							This is how your name will appear across the application.
						</p>
					</Field>

					<ErrorList errors={form.errors} id={form.errorId} />

					<div className="flex gap-4">
						<Link to="/settings/profile" className="flex-1">
							<Button type="button" variant="outline" className="w-full">
								Cancel
							</Button>
						</Link>
						<StatusButton
							className="flex-1"
							status={isPending ? 'pending' : (form.status ?? 'idle')}
							type="submit"
							disabled={isPending}
						>
							{isPending ? 'Saving...' : 'Save Changes'}
						</StatusButton>
					</div>
				</Form>
			</CardContent>
			<CardFooter>
				<p className="text-sm text-muted-foreground">
					Your username cannot be changed. Contact support if you need assistance.
				</p>
			</CardFooter>
		</Card>
	)
}
