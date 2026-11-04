import {
	Document,
	Image,
	Page,
	PDFViewer,
	StyleSheet,
	Text,
	View,
} from '@react-pdf/renderer'
import QRCode from 'qrcode'
import { useEffect, useState } from 'react'
import {
	BadgeElement,
	BadgeTemplateConfig,
	DynamicField,
	DynamicTextElement,
	TextElement,
} from './types'

// Participant data interface
export interface ParticipantBadgeData {
	badgeId: string
	firstName: string
	familyName: string
	fullName: string
	title?: string
	organization?: string
	jobTitle?: string
	country?: string
	nationality?: string
	email?: string
	participantType?: string
	eventName?: string
	closedSession?: boolean
	executiveCouncilClosedSession?: boolean
	profileUrl: string
	photoUrl: string
	// Reprint indicator
	isReprint?: boolean
	reprintCount?: number
}

interface DynamicBadgeProps {
	template: BadgeTemplateConfig
	participant: ParticipantBadgeData
	frontBackgroundUrl?: string
	backBackgroundUrl?: string
	height?: string
}

// Helper to get participant field value
function getParticipantValue(
	participant: ParticipantBadgeData,
	field: DynamicField,
): string {
	switch (field) {
		case 'badgeId':
			return participant.badgeId
		case 'firstName':
			return participant.firstName
		case 'familyName':
			return participant.familyName
		case 'fullName':
			return participant.fullName
		case 'title':
			return participant.title ?? ''
		case 'organization':
			return participant.organization ?? ''
		case 'jobTitle':
			return participant.jobTitle ?? ''
		case 'country':
			return participant.country ?? ''
		case 'nationality':
			return participant.nationality ?? ''
		case 'email':
			return participant.email ?? ''
		case 'participantType':
			return participant.participantType ?? ''
		case 'eventName':
			return participant.eventName ?? ''
		case 'closedSession':
			return participant.closedSession ? 'C' : participant.executiveCouncilClosedSession ? 'CX' : ''
		default:
			return ''
	}
}

// Render a single element
function ElementRenderer({
	element,
	participant,
	qrCodeDataURL,
}: {
	element: BadgeElement
	participant: ParticipantBadgeData
	qrCodeDataURL: string
}) {
	const baseStyle = {
		position: 'absolute' as const,
		left: element.x,
		top: element.y,
		width: element.width,
		height: element.height,
	}

	// Map fontWeight to @react-pdf/renderer font family
	// react-pdf requires using actual font family names for bold/italic
	const getFontFamily = (weight?: string, style?: string): string => {
		const isBold = weight === 'bold' || weight === 'ultrabold'
		const isItalic = style === 'italic'

		if (isBold && isItalic) return 'Helvetica-BoldOblique'
		if (isBold) return 'Helvetica-Bold'
		if (isItalic) return 'Helvetica-Oblique'
		return 'Helvetica'
	}

	// Helper to calculate border radius for PDF (doesn't support %)
	const getPdfBorderRadius = (
		radius: number | 'full' | undefined,
		width: number,
		height: number,
	): number | undefined => {
		if (radius === 'full') return Math.min(width, height) / 2
		if (typeof radius === 'number') return radius
		return undefined
	}

	switch (element.type) {
		case 'PHOTO':
			return (
				<View
					style={{
						...baseStyle,
						borderRadius: getPdfBorderRadius(element.borderRadius, element.width, element.height),
						borderWidth: element.borderWidth ?? 0,
						borderColor: element.borderColor ?? '#000000',
						borderStyle: element.borderWidth ? 'solid' : undefined,
						overflow: 'hidden',
					}}
				>
					<Image
						src={participant.photoUrl}
						style={{
							width: '100%',
							height: '100%',
						}}
					/>
				</View>
			)

		case 'QR_CODE':
			if (!qrCodeDataURL) return null
			return (
				<View
					style={{
						...baseStyle,
						borderRadius: getPdfBorderRadius(element.borderRadius, element.width, element.height),
						borderWidth: element.borderWidth ?? 0,
						borderColor: element.borderColor ?? '#000000',
						borderStyle: element.borderWidth ? 'solid' : undefined,
						overflow: 'hidden',
					}}
				>
					<Image
						src={qrCodeDataURL}
						style={{
							width: '100%',
							height: '100%',
						}}
					/>
				</View>
			)

		case 'TEXT': {
			const textEl = element as TextElement
			return (
				<Text
					style={{
						...baseStyle,
						fontFamily: getFontFamily(textEl.style?.fontWeight, textEl.style?.fontStyle),
						fontSize: textEl.style?.fontSize ?? 10,
						color: textEl.style?.color ?? '#000000',
						textAlign: textEl.style?.textAlign ?? 'left',
						backgroundColor: textEl.style?.backgroundColor,
						padding: textEl.style?.padding,
					}}
				>
					{textEl.content}
				</Text>
			)
		}

		case 'DYNAMIC_TEXT': {
			const dynEl = element as DynamicTextElement
			const value = getParticipantValue(participant, dynEl.field)
			const displayText = `${dynEl.prefix ?? ''}${value}${dynEl.suffix ?? ''}`
			return (
				<Text
					style={{
						...baseStyle,
						fontFamily: getFontFamily(dynEl.style?.fontWeight, dynEl.style?.fontStyle),
						fontSize: dynEl.style?.fontSize ?? 10,
						color: dynEl.style?.color ?? '#000000',
						textAlign: dynEl.style?.textAlign ?? 'left',
						backgroundColor: dynEl.style?.backgroundColor,
						padding: dynEl.style?.padding,
					}}
				>
					{displayText}
				</Text>
			)
		}

		case 'IMAGE':
			if (!element.src) return null
			return <Image src={element.src} style={baseStyle} />

		case 'SHAPE':
			return (
				<View
					style={{
						...baseStyle,
						backgroundColor: element.backgroundColor,
						borderRadius:
							element.shapeType === 'circle' ? '50%' : element.borderRadius,
						opacity: element.opacity ?? 1,
					}}
				/>
			)

		default:
			return null
	}
}

// Main badge document component
function BadgeDocument({
	template,
	participant,
	qrCodeDataURL,
	frontBackgroundUrl,
	backBackgroundUrl,
}: {
	template: BadgeTemplateConfig
	participant: ParticipantBadgeData
	qrCodeDataURL: string
	frontBackgroundUrl?: string
	backBackgroundUrl?: string
}) {
	const frontElements = template.elements.filter(el => el.page === 'front')
	const backElements = template.elements.filter(el => el.page === 'back')

	const styles = StyleSheet.create({
		page: {
			flexDirection: 'column',
			backgroundColor: '#ffffff',
			position: 'relative',
			overflow: 'hidden',
			borderRadius: template.borderRadius > 0 ? template.borderRadius : 0,
		},
		background: {
			position: 'absolute',
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
		},
		borderOverlay: {
			position: 'absolute',
			top: 0,
			left: 0,
			right: 0,
			bottom: 0,
			borderWidth: template.borderWidth > 0 ? template.borderWidth : 0,
			borderColor: template.borderColor,
			borderRadius: template.borderRadius > 0 ? template.borderRadius : 0,
			borderStyle: 'solid',
			pointerEvents: 'none',
		},
	})

	return (
		<Document title={`Badge - ${participant.fullName}`}>
			{/* Front Page */}
			<Page size={[template.width, template.height]} style={styles.page}>
				{frontBackgroundUrl && (
					<Image src={frontBackgroundUrl} style={styles.background} />
				)}
				{frontElements.map(element => (
					<ElementRenderer
						key={element.id}
						element={element}
						participant={participant}
						qrCodeDataURL={qrCodeDataURL}
					/>
				))}
				{template.borderWidth > 0 && <View style={styles.borderOverlay} />}
				</Page>

			{/* Back Page */}
			<Page size={[template.width, template.height]} style={styles.page}>
				{backBackgroundUrl && (
					<Image src={backBackgroundUrl} style={styles.background} />
				)}
				{backElements.map(element => (
					<ElementRenderer
						key={element.id}
						element={element}
						participant={participant}
						qrCodeDataURL={qrCodeDataURL}
					/>
				))}
				{template.borderWidth > 0 && <View style={styles.borderOverlay} />}
			</Page>
		</Document>
	)
}

// Exported component with PDF viewer
export function DynamicBadge({
	template,
	participant,
	frontBackgroundUrl,
	backBackgroundUrl,
	height = '600px',
}: DynamicBadgeProps) {
	const [isClient, setIsClient] = useState(false)
	const [qrCodeDataURL, setQrCodeDataURL] = useState('')

	useEffect(() => {
		setIsClient(true)

		// Generate QR code based on template elements
		const qrElement = template.elements.find(el => el.type === 'QR_CODE') as
			| (BadgeElement & { type: 'QR_CODE' })
			| undefined

		let qrData = participant.profileUrl
		if (qrElement?.dataField === 'badgeId') {
			qrData = participant.badgeId
		} else if (qrElement?.dataField === 'email') {
			qrData = participant.email ?? participant.profileUrl
		}

		QRCode.toDataURL(qrData, { width: 128, margin: 0 })
			.then(setQrCodeDataURL)
			.catch(console.error)
	}, [template.elements, participant])

	if (!isClient) {
		return null
	}

	return (
		<div className="flex h-full flex-col gap-4">
			<PDFViewer width="100%" height={height}>
				<BadgeDocument
					template={template}
					participant={participant}
					qrCodeDataURL={qrCodeDataURL}
					frontBackgroundUrl={frontBackgroundUrl}
					backBackgroundUrl={backBackgroundUrl}
				/>
			</PDFViewer>
		</div>
	)
}

// Helper function to convert DB template to BadgeTemplateConfig
export function dbTemplateToConfig(
	dbTemplate: {
		width: number
		height: number
		borderWidth?: number
		borderColor?: string
		borderRadius?: number
		badgeIdPrefix: string
		elements: unknown
	},
): BadgeTemplateConfig {
	return {
		width: dbTemplate.width,
		height: dbTemplate.height,
		borderWidth: dbTemplate.borderWidth ?? 0,
		borderColor: dbTemplate.borderColor ?? '#000000',
		borderRadius: dbTemplate.borderRadius ?? 0,
		badgeIdPrefix: dbTemplate.badgeIdPrefix,
		elements: (dbTemplate.elements as BadgeElement[]) ?? [],
	}
}
