import { type LoaderFunctionArgs } from '@remix-run/node'
import createDOMPurify from 'dompurify'
import { JSDOM } from 'jsdom'
import { prisma } from '~/utils/db.server'
import { invariantResponse } from '~/utils/misc'
import { getFile } from '~/utils/storage.server'

export async function loader({ params, request }: LoaderFunctionArgs) {
	const { attachmentId } = params
	const url = new URL(request.url)
	const mode = url.searchParams.get('mode') || 'download'

	invariantResponse(attachmentId, 'Attachment ID is required', { status: 400 })

	const attachment = await prisma.participantDocument.findUnique({
		where: { id: attachmentId },
		include: {
			participant: true,
		},
	})

	invariantResponse(attachment, 'Attachment not found', { status: 404 })

	const safeContentTypes = [
		'application/pdf',
		'image/jpeg',
		'image/png',
		'image/gif',
		'image/svg+xml',
	]

	invariantResponse(
		safeContentTypes.includes(attachment.contentType),
		'Invalid file type',
		{ status: 400 },
	)

	const safeExtensions = ['pdf', 'jpg', 'jpeg', 'png', 'gif', 'svg']
	invariantResponse(
		safeExtensions.includes(attachment.extension.toLowerCase()),
		'Invalid file extension',
		{ status: 400 },
	)

	let blob = await getFile({
		containerName: `accreditation/participants/${attachment.participantId}`,
		fileName: `${attachment.fileName}.${attachment.extension}`,
	})

	// Check and sanitize potentially dangerous content
	const contentStr = blob.toString('utf-8')
	if (
		attachment.contentType === 'image/svg+xml' ||
		contentStr.includes('<!doctype html') ||
		contentStr.includes('<html') ||
		contentStr.includes('</html>') ||
		contentStr.includes('<body') ||
		contentStr.includes('<script')
	) {
		const window = new JSDOM('').window
		const DOMPurify = createDOMPurify(window)

		const cleanContent = DOMPurify.sanitize(contentStr, {
			USE_PROFILES: { html: true, svg: true, svgFilters: true },
			FORBID_TAGS: [
				'script',
				'iframe',
				'object',
				'embed',
				'link',
				'style',
				'xml',
				'meta',
				'head',
				'title',
				'body',
			],
			FORBID_ATTR: [
				'onerror',
				'onload',
				'onclick',
				'onmouseover',
				'onmouseout',
				'onmouseenter',
				'onmouseleave',
				'onmousemove',
				'href',
				'xlink:href',
				'src',
				'style',
				'id',
				'class',
			],
			ALLOW_DATA_ATTR: false,
			ADD_TAGS: [
				'svg',
				'path',
				'circle',
				'rect',
				'line',
				'polyline',
				'polygon',
				'text',
			],
			RETURN_DOM: false,
			WHOLE_DOCUMENT: false,
		})

		blob = Buffer.from(cleanContent, 'utf-8')
	}

	const sanitizedFilename =
		`${attachment.participant.firstName} ${attachment.participant.familyName} ${attachment.documentType}`
			.trim()
			.toLowerCase()
			.replace(/[^\w\s.-]/g, '')
			.replace(/\s+/g, '_')
			.replace(/_{2,}/g, '_')
			.replace(/^[.-]+|[.-]+$/g, '')

	const headers: Record<string, string> = {
		'content-type': attachment.contentType,
		'content-length': Buffer.byteLength(blob).toString(),
		'cache-control': 'no-store, no-cache, must-revalidate, proxy-revalidate',
		pragma: 'no-cache',
		expires: '0',
		'X-Content-Type-Options': 'nosniff',
		'X-XSS-Protection': '1; mode=block',
	}

	if (mode === 'download') {
		headers['content-disposition'] =
			`attachment; filename="${sanitizedFilename}.${attachment.extension}"`
	} else {
		headers['content-disposition'] =
			`inline; filename="${sanitizedFilename}.${attachment.extension}"`
	}

	return new Response(blob, { headers })
}
