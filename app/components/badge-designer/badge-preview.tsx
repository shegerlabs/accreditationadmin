import { useState } from 'react'
import { Button } from '~/components/ui/button'
import { cn } from '~/utils/misc'
import { BadgeElement, SAMPLE_PARTICIPANT, SampleParticipant } from './types'

interface BadgePreviewProps {
	width: number
	height: number
	elements: BadgeElement[]
	frontBackgroundUrl?: string
	backBackgroundUrl?: string
	badgeIdPrefix: string
	participant?: SampleParticipant
	scale?: number
}

export function BadgePreview({
	width,
	height,
	elements,
	frontBackgroundUrl,
	backBackgroundUrl,
	badgeIdPrefix,
	participant = SAMPLE_PARTICIPANT,
	scale = 2,
}: BadgePreviewProps) {
	const [page, setPage] = useState<'front' | 'back'>('front')

	const backgroundUrl = page === 'front' ? frontBackgroundUrl : backBackgroundUrl
	const pageElements = elements.filter(el => el.page === page)

	// Merge participant with generated badge ID
	const participantData = {
		...participant,
		badgeId: `${badgeIdPrefix}-${participant.badgeId.split('-')[1] ?? '001'}`,
	}

	return (
		<div className="flex flex-col items-center gap-4">
			{/* Page Toggle */}
			<div className="flex gap-2">
				<Button
					type="button"
					variant={page === 'front' ? 'default' : 'outline'}
					size="sm"
					onClick={() => setPage('front')}
				>
					Front
				</Button>
				<Button
					type="button"
					variant={page === 'back' ? 'default' : 'outline'}
					size="sm"
					onClick={() => setPage('back')}
				>
					Back
				</Button>
			</div>

			{/* Badge Preview */}
			<div
				className="relative overflow-hidden rounded-lg border-2 border-dashed border-muted-foreground/30 bg-white shadow-lg"
				style={{
					width: width * scale,
					height: height * scale,
				}}
			>
				{/* Background Image */}
				{backgroundUrl && (
					<img
						src={backgroundUrl}
						alt={`${page} background`}
						className="absolute inset-0 h-full w-full object-cover"
					/>
				)}

				{/* Grid Overlay (for positioning reference) */}
				<div
					className="absolute inset-0 pointer-events-none opacity-10"
					style={{
						backgroundImage: `
							linear-gradient(to right, #888 1px, transparent 1px),
							linear-gradient(to bottom, #888 1px, transparent 1px)
						`,
						backgroundSize: `${10 * scale}px ${10 * scale}px`,
					}}
				/>

				{/* Elements */}
				{pageElements.map(element => (
					<ElementRenderer
						key={element.id}
						element={element}
						scale={scale}
						participant={participantData}
					/>
				))}

				{/* Empty State */}
				{pageElements.length === 0 && (
					<div className="absolute inset-0 flex items-center justify-center text-muted-foreground">
						<span className="text-sm">No elements on {page} page</span>
					</div>
				)}
			</div>

			{/* Dimensions Info */}
			<p className="text-xs text-muted-foreground">
				{width} x {height} points ({Math.round(width / 2.83)}mm x{' '}
				{Math.round(height / 2.83)}mm) - Scale: {scale}x
			</p>
		</div>
	)
}

interface ElementRendererProps {
	element: BadgeElement
	scale: number
	participant: SampleParticipant
}

function ElementRenderer({ element, scale, participant }: ElementRendererProps) {
	const baseStyle: React.CSSProperties = {
		position: 'absolute',
		left: element.x * scale,
		top: element.y * scale,
		width: element.width * scale,
		height: element.height * scale,
	}

	// Helper to calculate border radius
	const getBorderRadius = (
		radius: number | 'full' | undefined,
		width: number,
		height: number,
	): string | number | undefined => {
		if (radius === 'full') return '50%'
		if (typeof radius === 'number') return radius * scale
		return undefined
	}

	switch (element.type) {
		case 'PHOTO':
			return (
				<div
					style={{
						...baseStyle,
						borderRadius: getBorderRadius(element.borderRadius, element.width, element.height),
						borderWidth: element.borderWidth
							? element.borderWidth * scale
							: undefined,
						borderColor: element.borderColor,
						borderStyle: element.borderWidth ? 'solid' : undefined,
						overflow: 'hidden',
					}}
				>
					<img
						src={participant.photoUrl}
						alt="Participant"
						className="h-full w-full object-cover"
						style={{
							borderRadius: getBorderRadius(element.borderRadius, element.width, element.height),
						}}
					/>
				</div>
			)

		case 'QR_CODE':
			return (
				<div
					style={{
						...baseStyle,
						borderRadius: getBorderRadius(element.borderRadius, element.width, element.height),
						borderWidth: element.borderWidth
							? element.borderWidth * scale
							: undefined,
						borderColor: element.borderColor,
						borderStyle: element.borderWidth ? 'solid' : undefined,
						overflow: 'hidden',
					}}
					className="flex items-center justify-center bg-white"
				>
					{/* Placeholder QR code - actual QR generation would happen in PDF */}
					<div
						className="flex items-center justify-center border-2 border-dashed border-gray-300"
						style={{ width: '100%', height: '100%' }}
					>
						<span className="text-xs text-gray-500">QR</span>
					</div>
				</div>
			)

		case 'TEXT':
			return (
				<div
					style={{
						...baseStyle,
						fontSize: (element.style?.fontSize ?? 10) * scale,
						fontWeight:
							element.style?.fontWeight === 'ultrabold'
								? 900
								: element.style?.fontWeight === 'bold'
									? 700
									: 400,
						fontStyle: element.style?.fontStyle,
						color: element.style?.color ?? '#000000',
						textAlign: element.style?.textAlign ?? 'left',
						backgroundColor: element.style?.backgroundColor,
						padding: element.style?.padding
							? element.style.padding * scale
							: undefined,
						display: 'flex',
						alignItems: 'center',
						overflow: 'hidden',
					}}
				>
					{element.content}
				</div>
			)

		case 'DYNAMIC_TEXT': {
			// Special handling for closedSession/executiveCouncilClosedSession fields
			const rawValue = participant[element.field as keyof SampleParticipant] ?? ''
			const value = element.field === 'closedSession'
				? (rawValue ? 'C' : participant.executiveCouncilClosedSession ? 'CX' : '')
				: rawValue
			const displayText = `${element.prefix ?? ''}${value}${element.suffix ?? ''}`
			return (
				<div
					style={{
						...baseStyle,
						fontSize: (element.style?.fontSize ?? 10) * scale,
						fontWeight:
							element.style?.fontWeight === 'ultrabold'
								? 900
								: element.style?.fontWeight === 'bold'
									? 700
									: 400,
						fontStyle: element.style?.fontStyle,
						color: element.style?.color ?? '#000000',
						textAlign: element.style?.textAlign ?? 'left',
						backgroundColor: element.style?.backgroundColor,
						padding: element.style?.padding
							? element.style.padding * scale
							: undefined,
						display: 'flex',
						alignItems: 'center',
						overflow: 'hidden',
					}}
				>
					{displayText}
				</div>
			)
		}

		case 'IMAGE':
			return (
				<div style={baseStyle}>
					{element.src ? (
						<img
							src={element.src}
							alt="Badge element"
							className={cn(
								'h-full w-full',
								element.objectFit === 'contain' && 'object-contain',
								element.objectFit === 'cover' && 'object-cover',
								element.objectFit === 'fill' && 'object-fill',
							)}
						/>
					) : (
						<div className="flex h-full w-full items-center justify-center border-2 border-dashed border-gray-300 bg-gray-100">
							<span className="text-xs text-gray-500">Image</span>
						</div>
					)}
				</div>
			)

		case 'SHAPE':
			return (
				<div
					style={{
						...baseStyle,
						backgroundColor: element.backgroundColor,
						borderRadius:
							element.shapeType === 'circle'
								? '50%'
								: element.borderRadius
									? element.borderRadius * scale
									: undefined,
						borderWidth: element.borderWidth
							? element.borderWidth * scale
							: undefined,
						borderColor: element.borderColor,
						borderStyle: element.borderWidth ? 'solid' : undefined,
						opacity: element.opacity ?? 1,
					}}
				/>
			)

		default:
			return null
	}
}
