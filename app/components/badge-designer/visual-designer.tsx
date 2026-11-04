import { useCallback, useEffect, useRef, useState } from 'react'
import {
	Camera,
	Image,
	QrCode,
	Square,
	Type,
	Variable,
	ZoomIn,
	ZoomOut,
	Grid3X3,
	Trash2,
	Copy,
	AlignVerticalJustifyStart,
	AlignVerticalJustifyEnd,
	AlignHorizontalJustifyStart,
	AlignHorizontalJustifyEnd,
	AlignVerticalSpaceAround,
	AlignHorizontalSpaceAround,
} from 'lucide-react'
import { Button } from '~/components/ui/button'
import { StatusButton } from '~/components/ui/status-button'
import { cn } from '~/utils/misc'
import {
	BadgeElement,
	BadgeElementType,
	SAMPLE_PARTICIPANT,
	SampleParticipant,
	createDefaultElement,
} from './types'

const ELEMENT_ICONS: Record<BadgeElementType, React.ComponentType<{ className?: string }>> = {
	PHOTO: Camera,
	QR_CODE: QrCode,
	TEXT: Type,
	DYNAMIC_TEXT: Variable,
	IMAGE: Image,
	SHAPE: Square,
}

interface VisualDesignerProps {
	width: number
	height: number
	borderWidth?: number
	borderColor?: string
	borderRadius?: number
	elements: BadgeElement[]
	onChange: (elements: BadgeElement[]) => void
	badgeIdPrefix: string
	selectedElementIds: string[]
	onSelectElements: (ids: string[]) => void
	formId?: string
	isSaving?: boolean
	saveStatus?: 'idle' | 'pending' | 'success' | 'error'
}

export function VisualDesigner({
	width,
	height,
	borderWidth = 0,
	borderColor = '#000000',
	borderRadius = 0,
	elements,
	onChange,
	badgeIdPrefix,
	selectedElementIds,
	onSelectElements,
	formId,
	isSaving,
	saveStatus = 'idle',
}: VisualDesignerProps) {
	const [page, setPage] = useState<'front' | 'back'>('front')
	const [scale, setScale] = useState(2)
	const [showGrid, setShowGrid] = useState(true)
	const [dragState, setDragState] = useState<{
		isDragging: boolean
		elementId: string | null
		startX: number
		startY: number
		startPositions: Map<string, { x: number; y: number }>
	} | null>(null)
	const [resizeState, setResizeState] = useState<{
		isResizing: boolean
		elementId: string | null
		handle: string
		startX: number
		startY: number
		startWidth: number
		startHeight: number
		startElementX: number
		startElementY: number
	} | null>(null)

	const canvasRef = useRef<HTMLDivElement>(null)
	const participant = {
		...SAMPLE_PARTICIPANT,
		badgeId: `${badgeIdPrefix}-001`,
	}

	const pageElements = elements.filter(el => el.page === page)
	const selectedElements = elements.filter(el => selectedElementIds.includes(el.id))
	const selectedElement = selectedElements.length === 1 ? selectedElements[0] : null

	// Update element helper
	const updateElement = useCallback(
		(id: string, updates: Partial<BadgeElement>) => {
			onChange(
				elements.map(el =>
					el.id === id ? ({ ...el, ...updates } as BadgeElement) : el,
				),
			)
		},
		[elements, onChange],
	)

	// Add new element
	const addElement = useCallback(
		(type: BadgeElementType) => {
			const id = `element-${Date.now()}`
			const newElement = {
				...createDefaultElement(type, id),
				page,
				x: 20,
				y: 20,
			} as BadgeElement
			onChange([...elements, newElement])
			onSelectElements([id])
		},
		[elements, onChange, onSelectElements, page],
	)

	// Delete selected elements
	const deleteElements = useCallback(() => {
		if (selectedElementIds.length === 0) return
		onChange(elements.filter(el => !selectedElementIds.includes(el.id)))
		onSelectElements([])
	}, [elements, onChange, selectedElementIds, onSelectElements])

	// Duplicate selected elements
	const duplicateElements = useCallback(() => {
		if (selectedElements.length === 0) return
		const newElements: BadgeElement[] = []
		const newIds: string[] = []
		selectedElements.forEach((el, index) => {
			const id = `element-${Date.now()}-${index}`
			newElements.push({
				...el,
				id,
				x: el.x + 10,
				y: el.y + 10,
			} as BadgeElement)
			newIds.push(id)
		})
		onChange([...elements, ...newElements])
		onSelectElements(newIds)
	}, [elements, onChange, selectedElements, onSelectElements])

	// Alignment functions for multiple selected elements
	const alignElements = useCallback(
		(alignment: 'left' | 'right' | 'top' | 'bottom' | 'centerH' | 'centerV') => {
			if (selectedElements.length < 2) return

			let referenceValue: number
			switch (alignment) {
				case 'left':
					referenceValue = Math.min(...selectedElements.map(el => el.x))
					onChange(elements.map(el =>
						selectedElementIds.includes(el.id) ? { ...el, x: referenceValue } as BadgeElement : el
					))
					break
				case 'right':
					referenceValue = Math.max(...selectedElements.map(el => el.x + el.width))
					onChange(elements.map(el =>
						selectedElementIds.includes(el.id) ? { ...el, x: referenceValue - el.width } as BadgeElement : el
					))
					break
				case 'top':
					referenceValue = Math.min(...selectedElements.map(el => el.y))
					onChange(elements.map(el =>
						selectedElementIds.includes(el.id) ? { ...el, y: referenceValue } as BadgeElement : el
					))
					break
				case 'bottom':
					referenceValue = Math.max(...selectedElements.map(el => el.y + el.height))
					onChange(elements.map(el =>
						selectedElementIds.includes(el.id) ? { ...el, y: referenceValue - el.height } as BadgeElement : el
					))
					break
				case 'centerH': {
					const minX = Math.min(...selectedElements.map(el => el.x))
					const maxX = Math.max(...selectedElements.map(el => el.x + el.width))
					const centerX = (minX + maxX) / 2
					onChange(elements.map(el =>
						selectedElementIds.includes(el.id) ? { ...el, x: centerX - el.width / 2 } as BadgeElement : el
					))
					break
				}
				case 'centerV': {
					const minY = Math.min(...selectedElements.map(el => el.y))
					const maxY = Math.max(...selectedElements.map(el => el.y + el.height))
					const centerY = (minY + maxY) / 2
					onChange(elements.map(el =>
						selectedElementIds.includes(el.id) ? { ...el, y: centerY - el.height / 2 } as BadgeElement : el
					))
					break
				}
			}
		},
		[elements, onChange, selectedElements, selectedElementIds],
	)

	// Make selected elements equal size
	const equalizeSize = useCallback(
		(dimension: 'width' | 'height') => {
			if (selectedElements.length < 2) return
			// Use the first selected element as reference
			const reference = selectedElements[0]
			onChange(elements.map(el =>
				selectedElementIds.includes(el.id)
					? { ...el, [dimension]: reference[dimension] } as BadgeElement
					: el
			))
		},
		[elements, onChange, selectedElements, selectedElementIds],
	)

	// Move selected elements with keyboard
	const moveElements = useCallback(
		(dx: number, dy: number) => {
			if (selectedElements.length === 0) return

			onChange(elements.map(el => {
				if (!selectedElementIds.includes(el.id)) return el
				let newX = el.x + dx
				let newY = el.y + dy
				// Clamp to canvas bounds
				newX = Math.max(0, Math.min(width - el.width, newX))
				newY = Math.max(0, Math.min(height - el.height, newY))
				return { ...el, x: newX, y: newY } as BadgeElement
			}))
		},
		[elements, onChange, selectedElements, selectedElementIds, width, height],
	)

	// Resize selected elements with keyboard
	const resizeElements = useCallback(
		(dw: number, dh: number) => {
			if (selectedElements.length === 0) return

			onChange(elements.map(el => {
				if (!selectedElementIds.includes(el.id)) return el
				let newWidth = el.width + dw
				let newHeight = el.height + dh
				// Minimum size of 10px, max to canvas bounds
				newWidth = Math.max(10, Math.min(width - el.x, newWidth))
				newHeight = Math.max(10, Math.min(height - el.y, newHeight))
				return { ...el, width: newWidth, height: newHeight } as BadgeElement
			}))
		},
		[elements, onChange, selectedElements, selectedElementIds, width, height],
	)

	// Keyboard event handler
	useEffect(() => {
		const handleKeyDown = (e: KeyboardEvent) => {
			// Don't handle if user is typing in an input
			if (
				e.target instanceof HTMLInputElement ||
				e.target instanceof HTMLTextAreaElement ||
				e.target instanceof HTMLSelectElement
			) {
				return
			}

			// Select all (Ctrl/Cmd + A)
			if ((e.ctrlKey || e.metaKey) && e.key === 'a') {
				e.preventDefault()
				onSelectElements(pageElements.map(el => el.id))
				return
			}

			// Only handle other shortcuts when elements are selected
			if (selectedElementIds.length === 0) return

			const step = e.shiftKey ? 4 : 2 // Shift for larger steps

			// Alt + Arrow keys for resizing
			if (e.altKey) {
				switch (e.key) {
					case 'ArrowUp':
						e.preventDefault()
						resizeElements(0, -step) // Shrink height
						break
					case 'ArrowDown':
						e.preventDefault()
						resizeElements(0, step) // Expand height
						break
					case 'ArrowLeft':
						e.preventDefault()
						resizeElements(-step, 0) // Shrink width
						break
					case 'ArrowRight':
						e.preventDefault()
						resizeElements(step, 0) // Expand width
						break
				}
				return
			}

			// Regular arrow keys for moving
			switch (e.key) {
				case 'ArrowUp':
					e.preventDefault()
					moveElements(0, -step)
					break
				case 'ArrowDown':
					e.preventDefault()
					moveElements(0, step)
					break
				case 'ArrowLeft':
					e.preventDefault()
					moveElements(-step, 0)
					break
				case 'ArrowRight':
					e.preventDefault()
					moveElements(step, 0)
					break
				case 'Delete':
				case 'Backspace':
					e.preventDefault()
					deleteElements()
					break
				case 'd':
					// Ctrl/Cmd + D to duplicate
					if (e.ctrlKey || e.metaKey) {
						e.preventDefault()
						duplicateElements()
					}
					break
				case 'Escape':
					e.preventDefault()
					onSelectElements([])
					break
			}
		}

		window.addEventListener('keydown', handleKeyDown)
		return () => window.removeEventListener('keydown', handleKeyDown)
	}, [
		selectedElementIds,
		pageElements,
		moveElements,
		resizeElements,
		deleteElements,
		duplicateElements,
		onSelectElements,
	])

	// Auto-focus canvas when elements are selected for keyboard navigation
	useEffect(() => {
		if (selectedElementIds.length > 0 && canvasRef.current) {
			canvasRef.current.focus()
		}
	}, [selectedElementIds])

	// Mouse down on element - start drag (with multi-select support)
	const handleElementMouseDown = useCallback(
		(e: React.MouseEvent, elementId: string) => {
			e.stopPropagation()
			const element = elements.find(el => el.id === elementId)
			if (!element) return

			// Multi-select with Shift or Ctrl/Cmd
			if (e.shiftKey || e.ctrlKey || e.metaKey) {
				if (selectedElementIds.includes(elementId)) {
					// Remove from selection
					onSelectElements(selectedElementIds.filter(id => id !== elementId))
				} else {
					// Add to selection
					onSelectElements([...selectedElementIds, elementId])
				}
				return
			}

			// Single select (unless already in multi-selection)
			if (!selectedElementIds.includes(elementId)) {
				onSelectElements([elementId])
			}

			// Store starting positions for all selected elements
			const startPositions = new Map<string, { x: number; y: number }>()
			const idsToMove = selectedElementIds.includes(elementId) ? selectedElementIds : [elementId]
			idsToMove.forEach(id => {
				const el = elements.find(e => e.id === id)
				if (el) startPositions.set(id, { x: el.x, y: el.y })
			})

			setDragState({
				isDragging: true,
				elementId,
				startX: e.clientX,
				startY: e.clientY,
				startPositions,
			})
		},
		[elements, selectedElementIds, onSelectElements],
	)

	// Mouse down on resize handle
	const handleResizeMouseDown = useCallback(
		(e: React.MouseEvent, elementId: string, handle: string) => {
			e.stopPropagation()
			const element = elements.find(el => el.id === elementId)
			if (!element) return

			setResizeState({
				isResizing: true,
				elementId,
				handle,
				startX: e.clientX,
				startY: e.clientY,
				startWidth: element.width,
				startHeight: element.height,
				startElementX: element.x,
				startElementY: element.y,
			})
		},
		[elements],
	)

	// Mouse move - handle drag or resize
	const handleMouseMove = useCallback(
		(e: React.MouseEvent) => {
			if (dragState?.isDragging && dragState.startPositions.size > 0) {
				const deltaX = (e.clientX - dragState.startX) / scale
				const deltaY = (e.clientY - dragState.startY) / scale

				// Snap delta to grid
				let snappedDeltaX = deltaX
				let snappedDeltaY = deltaY
				if (showGrid) {
					snappedDeltaX = Math.round(deltaX / 5) * 5
					snappedDeltaY = Math.round(deltaY / 5) * 5
				}

				// Move all selected elements
				onChange(elements.map(el => {
					const startPos = dragState.startPositions.get(el.id)
					if (!startPos) return el

					let newX = Math.round(startPos.x + snappedDeltaX)
					let newY = Math.round(startPos.y + snappedDeltaY)

					// Clamp to canvas bounds
					newX = Math.max(0, Math.min(width - el.width, newX))
					newY = Math.max(0, Math.min(height - el.height, newY))

					return { ...el, x: newX, y: newY } as BadgeElement
				}))
			}

			if (resizeState?.isResizing && resizeState.elementId) {
				const deltaX = (e.clientX - resizeState.startX) / scale
				const deltaY = (e.clientY - resizeState.startY) / scale

				let newWidth = resizeState.startWidth
				let newHeight = resizeState.startHeight
				let newX = resizeState.startElementX
				let newY = resizeState.startElementY

				const handle = resizeState.handle

				// Handle resize based on which handle is being dragged
				if (handle.includes('e')) {
					newWidth = Math.max(10, resizeState.startWidth + deltaX)
				}
				if (handle.includes('w')) {
					const widthDelta = Math.min(deltaX, resizeState.startWidth - 10)
					newWidth = resizeState.startWidth - widthDelta
					newX = resizeState.startElementX + widthDelta
				}
				if (handle.includes('s')) {
					newHeight = Math.max(10, resizeState.startHeight + deltaY)
				}
				if (handle.includes('n')) {
					const heightDelta = Math.min(deltaY, resizeState.startHeight - 10)
					newHeight = resizeState.startHeight - heightDelta
					newY = resizeState.startElementY + heightDelta
				}

				// Snap to grid
				if (showGrid) {
					newWidth = Math.round(newWidth / 5) * 5
					newHeight = Math.round(newHeight / 5) * 5
					newX = Math.round(newX / 5) * 5
					newY = Math.round(newY / 5) * 5
				}

				updateElement(resizeState.elementId, {
					width: Math.round(newWidth),
					height: Math.round(newHeight),
					x: Math.round(newX),
					y: Math.round(newY),
				})
			}
		},
		[dragState, resizeState, scale, showGrid, width, height, elements, onChange, updateElement],
	)

	// Mouse up - end drag or resize
	const handleMouseUp = useCallback(() => {
		setDragState(null)
		setResizeState(null)
	}, [])

	// Mouse down on canvas background - deselect (only if clicking directly on canvas)
	const handleCanvasMouseDown = useCallback(
		(e: React.MouseEvent) => {
			// Only deselect if clicking directly on the canvas, not on an element
			if (e.target === e.currentTarget) {
				onSelectElements([])
			}
		},
		[onSelectElements],
	)

	return (
		<div className="flex flex-col gap-4">
			{/* Toolbar */}
			<div className="flex flex-wrap items-center gap-2 rounded-lg border bg-muted/30 p-2">
				{/* Page Toggle */}
				<div className="flex gap-1">
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

				<div className="h-6 w-px bg-border" />

				{/* Add Element Buttons */}
				{(Object.keys(ELEMENT_ICONS) as BadgeElementType[]).map(type => {
					const Icon = ELEMENT_ICONS[type]
					return (
						<Button
							key={type}
							type="button"
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={() => addElement(type)}
							title={`Add ${type.replace('_', ' ')}`}
						>
							<Icon className="h-4 w-4" />
						</Button>
					)
				})}

				<div className="h-6 w-px bg-border" />

				{/* Element Actions */}
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={duplicateElements}
					disabled={selectedElementIds.length === 0}
					title="Duplicate (Ctrl+D)"
				>
					<Copy className="h-4 w-4" />
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-8 w-8 text-destructive"
					onClick={deleteElements}
					disabled={selectedElementIds.length === 0}
					title="Delete (Del/Backspace)"
				>
					<Trash2 className="h-4 w-4" />
				</Button>

				{/* Alignment Tools (visible when 2+ elements selected) */}
				{selectedElementIds.length >= 2 && (
					<>
						<div className="h-6 w-px bg-border" />
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={() => alignElements('left')}
							title="Align Left"
						>
							<AlignHorizontalJustifyStart className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={() => alignElements('right')}
							title="Align Right"
						>
							<AlignHorizontalJustifyEnd className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={() => alignElements('top')}
							title="Align Top"
						>
							<AlignVerticalJustifyStart className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={() => alignElements('bottom')}
							title="Align Bottom"
						>
							<AlignVerticalJustifyEnd className="h-4 w-4" />
						</Button>
						<div className="h-6 w-px bg-border" />
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={() => equalizeSize('width')}
							title="Equal Width"
						>
							<AlignHorizontalSpaceAround className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="icon"
							className="h-8 w-8"
							onClick={() => equalizeSize('height')}
							title="Equal Height"
						>
							<AlignVerticalSpaceAround className="h-4 w-4" />
						</Button>
					</>
				)}

				<div className="flex-1" />

				{/* View Controls */}
				<Button
					type="button"
					variant={showGrid ? 'default' : 'outline'}
					size="icon"
					className="h-8 w-8"
					onClick={() => setShowGrid(!showGrid)}
					title="Toggle Grid"
				>
					<Grid3X3 className="h-4 w-4" />
				</Button>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={() => setScale(Math.max(1, scale - 0.5))}
					title="Zoom Out"
				>
					<ZoomOut className="h-4 w-4" />
				</Button>
				<span className="min-w-[3rem] text-center text-sm">{scale}x</span>
				<Button
					type="button"
					variant="outline"
					size="icon"
					className="h-8 w-8"
					onClick={() => setScale(Math.min(4, scale + 0.5))}
					title="Zoom In"
				>
					<ZoomIn className="h-4 w-4" />
				</Button>

				{formId && (
					<>
						<div className="h-6 w-px bg-border" />
						<StatusButton
							type="submit"
							form={formId}
							disabled={isSaving}
							status={saveStatus}
							className="h-8"
						>
							Save
						</StatusButton>
					</>
				)}
			</div>

			{/* Canvas */}
			<div className="overflow-auto rounded-lg border bg-gray-100 p-4">
				<div
					ref={canvasRef}
					tabIndex={0}
					className="relative mx-auto bg-white shadow-lg outline-none focus:ring-2 focus:ring-primary/50 focus:ring-offset-2"
					style={{
						width: width * scale,
						height: height * scale,
						cursor: dragState?.isDragging ? 'grabbing' : 'default',
						borderRadius: borderRadius > 0 ? borderRadius * scale : undefined,
						overflow: 'hidden',
					}}
					onMouseDown={handleCanvasMouseDown}
					onMouseMove={handleMouseMove}
					onMouseUp={handleMouseUp}
					onMouseLeave={handleMouseUp}
				>
					{/* Grid Overlay */}
					{showGrid && (
						<div
							className="absolute inset-0 pointer-events-none opacity-20"
							style={{
								backgroundImage: `
									linear-gradient(to right, #666 1px, transparent 1px),
									linear-gradient(to bottom, #666 1px, transparent 1px)
								`,
								backgroundSize: `${5 * scale}px ${5 * scale}px`,
							}}
						/>
					)}

					{/* Elements */}
					{pageElements.map(element => (
						<DesignerElement
							key={element.id}
							element={element}
							scale={scale}
							participant={participant}
							isSelected={selectedElementIds.includes(element.id)}
							onMouseDown={e => handleElementMouseDown(e, element.id)}
							onResizeStart={(e, handle) =>
								handleResizeMouseDown(e, element.id, handle)
							}
						/>
					))}

					{/* Empty State */}
					{pageElements.length === 0 && (
						<div className="absolute inset-0 flex items-center justify-center text-muted-foreground pointer-events-none">
							<span className="text-sm">
								Click the toolbar buttons to add elements
							</span>
						</div>
					)}

					{/* Border Overlay */}
					{borderWidth > 0 && (
						<div
							className="absolute inset-0 pointer-events-none"
							style={{
								border: `${borderWidth * scale}px solid ${borderColor}`,
								borderRadius: borderRadius > 0 ? borderRadius * scale : undefined,
							}}
						/>
					)}
				</div>
			</div>
		</div>
	)
}

// Individual element renderer with selection and resize handles
interface DesignerElementProps {
	element: BadgeElement
	scale: number
	participant: SampleParticipant
	isSelected: boolean
	onMouseDown: (e: React.MouseEvent) => void
	onResizeStart: (e: React.MouseEvent, handle: string) => void
}

function DesignerElement({
	element,
	scale,
	participant,
	isSelected,
	onMouseDown,
	onResizeStart,
}: DesignerElementProps) {
	const Icon = ELEMENT_ICONS[element.type]

	const baseStyle: React.CSSProperties = {
		position: 'absolute',
		left: element.x * scale,
		top: element.y * scale,
		width: element.width * scale,
		height: element.height * scale,
		cursor: 'move',
	}

	const renderContent = () => {
		// Helper to calculate border radius
		const getBorderRadius = (radius: number | 'full' | undefined, width: number, height: number) => {
			if (radius === 'full') return '50%'
			if (radius) return radius * scale
			return undefined
		}

		switch (element.type) {
			case 'PHOTO':
				return (
					<div
						className="flex h-full w-full items-center justify-center bg-gray-200"
						style={{
							borderWidth: element.borderWidth ? element.borderWidth * scale : undefined,
							borderColor: element.borderColor ?? '#000000',
							borderStyle: element.borderWidth ? 'solid' : undefined,
							borderRadius: getBorderRadius(element.borderRadius, element.width, element.height),
							boxSizing: 'border-box',
						}}
					>
						<Camera className="h-8 w-8 text-gray-400" />
					</div>
				)

			case 'QR_CODE':
				return (
					<div
						className="flex h-full w-full items-center justify-center bg-white"
						style={{
							borderWidth: element.borderWidth ? element.borderWidth * scale : 1,
							borderColor: element.borderColor ?? '#d1d5db',
							borderStyle: 'solid',
							borderRadius: getBorderRadius(element.borderRadius, element.width, element.height),
							boxSizing: 'border-box',
						}}
					>
						<QrCode className="h-8 w-8 text-gray-600" />
					</div>
				)

			case 'TEXT':
				return (
					<div
						className="flex h-full w-full items-center overflow-hidden"
						style={{
							fontSize: (element.style?.fontSize ?? 10) * scale,
							fontWeight:
								element.style?.fontWeight === 'ultrabold'
									? 900
									: element.style?.fontWeight === 'bold'
										? 700
										: 400,
							fontStyle: element.style?.fontStyle === 'italic' ? 'italic' : 'normal',
							color: element.style?.color ?? '#000000',
							justifyContent:
								element.style?.textAlign === 'center'
									? 'center'
									: element.style?.textAlign === 'right'
										? 'flex-end'
										: 'flex-start',
							backgroundColor: element.style?.backgroundColor,
						}}
					>
						{element.content || 'Text'}
					</div>
				)

			case 'DYNAMIC_TEXT': {
				// Special handling for closedSession/executiveCouncilClosedSession fields
				const rawValue =
					participant[element.field as keyof SampleParticipant] ?? ''
				const value = element.field === 'closedSession'
					? (rawValue ? 'C' : participant.executiveCouncilClosedSession ? 'CX' : '')
					: rawValue
				const displayText = `${element.prefix ?? ''}${value}${element.suffix ?? ''}`
				return (
					<div
						className="flex h-full w-full items-center overflow-hidden"
						style={{
							fontSize: (element.style?.fontSize ?? 10) * scale,
							fontWeight:
								element.style?.fontWeight === 'ultrabold'
									? 900
									: element.style?.fontWeight === 'bold'
										? 700
										: 400,
							fontStyle: element.style?.fontStyle === 'italic' ? 'italic' : 'normal',
							color: element.style?.color ?? '#000000',
							justifyContent:
								element.style?.textAlign === 'center'
									? 'center'
									: element.style?.textAlign === 'right'
										? 'flex-end'
										: 'flex-start',
							backgroundColor: element.style?.backgroundColor,
						}}
					>
						{displayText || `[${element.field}]`}
					</div>
				)
			}

			case 'IMAGE':
				return element.src ? (
					<img
						src={element.src}
						alt="Badge element"
						className="h-full w-full object-contain"
						draggable={false}
					/>
				) : (
					<div className="flex h-full w-full items-center justify-center bg-gray-100 border border-dashed border-gray-300">
						<Image className="h-8 w-8 text-gray-400" />
					</div>
				)

			case 'SHAPE':
				return (
					<div
						className="h-full w-full"
						style={{
							backgroundColor: element.backgroundColor ?? '#e5e7eb',
							borderRadius:
								element.shapeType === 'circle'
									? '50%'
									: element.borderRadius
										? element.borderRadius * scale
										: undefined,
							opacity: element.opacity ?? 1,
						}}
					/>
				)

			default:
				return null
		}
	}

	return (
		<div
			style={baseStyle}
			className={cn(
				'group',
				isSelected && 'ring-2 ring-primary ring-offset-1',
			)}
			onMouseDown={onMouseDown}
		>
			{renderContent()}

			{/* Element Type Badge */}
			<div className="absolute -top-5 left-0 flex items-center gap-1 rounded bg-black/70 px-1.5 py-0.5 text-[10px] text-white opacity-0 group-hover:opacity-100 transition-opacity">
				<Icon className="h-3 w-3" />
				{element.type.replace('_', ' ')}
			</div>

			{/* Resize Handles (only when selected) */}
			{isSelected && (
				<>
					{/* Corner handles */}
					<ResizeHandle position="nw" onMouseDown={e => onResizeStart(e, 'nw')} />
					<ResizeHandle position="ne" onMouseDown={e => onResizeStart(e, 'ne')} />
					<ResizeHandle position="sw" onMouseDown={e => onResizeStart(e, 'sw')} />
					<ResizeHandle position="se" onMouseDown={e => onResizeStart(e, 'se')} />
					{/* Edge handles */}
					<ResizeHandle position="n" onMouseDown={e => onResizeStart(e, 'n')} />
					<ResizeHandle position="s" onMouseDown={e => onResizeStart(e, 's')} />
					<ResizeHandle position="e" onMouseDown={e => onResizeStart(e, 'e')} />
					<ResizeHandle position="w" onMouseDown={e => onResizeStart(e, 'w')} />
				</>
			)}
		</div>
	)
}

// Resize handle component
function ResizeHandle({
	position,
	onMouseDown,
}: {
	position: string
	onMouseDown: (e: React.MouseEvent) => void
}) {
	const positionStyles: Record<string, React.CSSProperties> = {
		nw: { top: -4, left: -4, cursor: 'nw-resize' },
		ne: { top: -4, right: -4, cursor: 'ne-resize' },
		sw: { bottom: -4, left: -4, cursor: 'sw-resize' },
		se: { bottom: -4, right: -4, cursor: 'se-resize' },
		n: { top: -4, left: '50%', transform: 'translateX(-50%)', cursor: 'n-resize' },
		s: { bottom: -4, left: '50%', transform: 'translateX(-50%)', cursor: 's-resize' },
		e: { right: -4, top: '50%', transform: 'translateY(-50%)', cursor: 'e-resize' },
		w: { left: -4, top: '50%', transform: 'translateY(-50%)', cursor: 'w-resize' },
	}

	return (
		<div
			className="absolute h-2 w-2 rounded-sm bg-primary border border-white shadow-sm"
			style={positionStyles[position]}
			onMouseDown={onMouseDown}
		/>
	)
}
