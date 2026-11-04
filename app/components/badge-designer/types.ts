// Badge element types (matches Prisma enum)
export type BadgeElementType =
	| 'PHOTO'
	| 'QR_CODE'
	| 'TEXT'
	| 'DYNAMIC_TEXT'
	| 'IMAGE'
	| 'SHAPE'

// Available dynamic fields from participant data
export const DYNAMIC_FIELDS = [
	{ value: 'badgeId', label: 'Badge ID' },
	{ value: 'firstName', label: 'First Name' },
	{ value: 'familyName', label: 'Family Name' },
	{ value: 'fullName', label: 'Full Name' },
	{ value: 'title', label: 'Title' },
	{ value: 'organization', label: 'Organization' },
	{ value: 'jobTitle', label: 'Job Title' },
	{ value: 'country', label: 'Country' },
	{ value: 'nationality', label: 'Nationality' },
	{ value: 'email', label: 'Email' },
	{ value: 'participantType', label: 'Participant Type' },
	{ value: 'eventName', label: 'Event Name' },
	{ value: 'closedSession', label: 'Closed Session (C/CX)' },
] as const

export type DynamicField = (typeof DYNAMIC_FIELDS)[number]['value']

// Base element properties shared by all element types
export interface BaseElement {
	id: string
	type: BadgeElementType
	page: 'front' | 'back'
	x: number // X position in points
	y: number // Y position in points
	width: number // Width in points
	height: number // Height in points
}

// Style properties for text elements
export interface TextStyle {
	fontSize?: number
	fontWeight?: 'normal' | 'bold' | 'ultrabold'
	fontStyle?: 'normal' | 'italic'
	color?: string
	textAlign?: 'left' | 'center' | 'right'
	backgroundColor?: string
	padding?: number
}

// Photo element - displays participant photo
export interface PhotoElement extends BaseElement {
	type: 'PHOTO'
	borderRadius?: number | 'full'
	borderWidth?: number
	borderColor?: string
}

// QR Code element - generates QR code from profile URL or custom data
export interface QRCodeElement extends BaseElement {
	type: 'QR_CODE'
	dataField?: 'profileUrl' | 'badgeId' | 'email' // Which field to encode
	borderRadius?: number | 'full'
	borderWidth?: number
	borderColor?: string
}

// Static text element
export interface TextElement extends BaseElement {
	type: 'TEXT'
	content: string
	style?: TextStyle
}

// Dynamic text element - pulls from participant data
export interface DynamicTextElement extends BaseElement {
	type: 'DYNAMIC_TEXT'
	field: DynamicField
	prefix?: string // Text before the value (e.g., "Name: ")
	suffix?: string // Text after the value
	style?: TextStyle
}

// Static image element (logos, icons, etc.)
export interface ImageElement extends BaseElement {
	type: 'IMAGE'
	src: string // URL or attachment ID
	objectFit?: 'contain' | 'cover' | 'fill'
}

// Shape element for backgrounds, borders, etc.
export interface ShapeElement extends BaseElement {
	type: 'SHAPE'
	shapeType: 'rectangle' | 'circle' | 'line'
	backgroundColor?: string
	borderWidth?: number
	borderColor?: string
	borderRadius?: number
	opacity?: number
}

// Union type for all badge elements
export type BadgeElement =
	| PhotoElement
	| QRCodeElement
	| TextElement
	| DynamicTextElement
	| ImageElement
	| ShapeElement

// Helper function to create a default element of each type
export function createDefaultElement(
	type: BadgeElementType,
	id: string,
): BadgeElement {
	const base: BaseElement = {
		id,
		type,
		page: 'front',
		x: 10,
		y: 10,
		width: 50,
		height: 50,
	}

	switch (type) {
		case 'PHOTO':
			return { ...base, type: 'PHOTO' }
		case 'QR_CODE':
			return { ...base, type: 'QR_CODE', dataField: 'profileUrl' }
		case 'TEXT':
			return {
				...base,
				type: 'TEXT',
				content: 'Text',
				width: 100,
				height: 20,
				style: { fontSize: 10 },
			}
		case 'DYNAMIC_TEXT':
			return {
				...base,
				type: 'DYNAMIC_TEXT',
				field: 'fullName',
				width: 100,
				height: 20,
				style: { fontSize: 10 },
			}
		case 'IMAGE':
			return { ...base, type: 'IMAGE', src: '' }
		case 'SHAPE':
			return {
				...base,
				type: 'SHAPE',
				shapeType: 'rectangle',
				backgroundColor: '#e5e7eb',
			}
		default:
			throw new Error(`Unknown element type: ${type}`)
	}
}

// Badge template with elements (backgrounds are handled separately via Template attachments)
export interface BadgeTemplateConfig {
	width: number
	height: number
	borderWidth: number
	borderColor: string
	borderRadius: number
	badgeIdPrefix: string
	elements: BadgeElement[]
}

// Sample participant data for preview
export const SAMPLE_PARTICIPANT = {
	badgeId: 'AU2025-001',
	firstName: 'John',
	familyName: 'Doe',
	fullName: 'John Doe',
	title: 'Mr.',
	organization: 'African Union',
	jobTitle: 'Director',
	country: 'Ethiopia',
	nationality: 'Ethiopian',
	email: 'john.doe@example.com',
	participantType: 'Delegate',
	eventName: 'AU Summit 2025',
	closedSession: true,
	executiveCouncilClosedSession: false,
	profileUrl: 'https://example.com/profile/123',
	photoUrl: '/placeholder-avatar.jpg',
}

export type SampleParticipant = typeof SAMPLE_PARTICIPANT
