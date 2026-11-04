import { LoaderFunctionArgs } from '@remix-run/node'
import { requireUserId } from '~/utils/auth.server'
import { prisma } from '~/utils/db.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const currentUserId = await requireUserId(request)
	const { imageId } = params

	if (!imageId) {
		throw new Response('Image ID required', { status: 400 })
	}

	const image = await prisma.userImage.findUnique({
		where: { id: imageId },
		select: {
			blob: true,
			contentType: true,
			userId: true,
		},
	})

	if (!image) {
		throw new Response('Image not found', { status: 404 })
	}

	// Check if current user can access this image
	// Users can view their own image, or admins can view images of users in their tenant
	if (image.userId !== currentUserId) {
		const currentUser = await prisma.user.findUnique({
			where: { id: currentUserId },
			select: {
				tenantId: true,
				roles: { select: { name: true, scope: true } },
			},
		})

		const isGlobalAdmin = currentUser?.roles.some(r => r.scope === 'GLOBAL')
		const isAdmin = currentUser?.roles.some(r =>
			['admin', 'tenant'].includes(r.name),
		)

		if (!isAdmin && !isGlobalAdmin) {
			throw new Response('Forbidden', { status: 403 })
		}

		// For tenant admins, verify the image owner belongs to their tenant
		if (!isGlobalAdmin && isAdmin) {
			const imageOwner = await prisma.user.findUnique({
				where: { id: image.userId },
				select: { tenantId: true },
			})

			if (imageOwner?.tenantId !== currentUser?.tenantId) {
				throw new Response('Forbidden', { status: 403 })
			}
		}
	}

	return new Response(image.blob, {
		headers: {
			'Content-Type': image.contentType,
			'Content-Length': Buffer.byteLength(image.blob).toString(),
			'Cache-Control': 'public, max-age=31536000, immutable',
		},
	})
}
