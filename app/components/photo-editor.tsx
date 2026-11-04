import { useCallback, useState } from 'react'
import Cropper, { Area, Point } from 'react-easy-crop'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import {
	RotateCcw,
	RotateCw,
	ZoomIn,
	ZoomOut,
	FlipHorizontal,
	FlipVertical,
	Minus,
	Plus,
	Crop,
} from 'lucide-react'

// Aspect ratio presets
const ASPECT_RATIOS = {
	PASSPORT_7x9: { value: 7 / 9, label: '7:9', description: 'Passport' },
	PHOTO_3x4: { value: 3 / 4, label: '3:4', description: 'Standard' },
	SQUARE: { value: 1, label: '1:1', description: 'Square' },
} as const

type AspectRatioKey = keyof typeof ASPECT_RATIOS

interface PhotoEditorProps {
	imageUrl: string
	open: boolean
	onClose: () => void
	onSave: (croppedImageBlob: Blob) => void
	aspectRatio?: number
	title?: string
}

// Create the cropped image from canvas
async function getCroppedImg(
	imageSrc: string,
	pixelCrop: Area,
	rotation = 0,
	flipHorizontal = false,
	flipVertical = false,
): Promise<Blob> {
	const image = await createImage(imageSrc)
	const canvas = document.createElement('canvas')
	const ctx = canvas.getContext('2d')

	if (!ctx) {
		throw new Error('No 2d context')
	}

	const rotRad = getRadianAngle(rotation)

	// Calculate bounding box of the rotated image
	const { width: bBoxWidth, height: bBoxHeight } = rotateSize(
		image.width,
		image.height,
		rotation,
	)

	// Set canvas size to match the bounding box
	canvas.width = bBoxWidth
	canvas.height = bBoxHeight

	// Translate canvas context to center before rotating
	ctx.translate(bBoxWidth / 2, bBoxHeight / 2)
	ctx.rotate(rotRad)
	ctx.scale(flipHorizontal ? -1 : 1, flipVertical ? -1 : 1)
	ctx.translate(-image.width / 2, -image.height / 2)

	// Draw rotated image
	ctx.drawImage(image, 0, 0)

	// Create a new canvas for the cropped area
	const croppedCanvas = document.createElement('canvas')
	const croppedCtx = croppedCanvas.getContext('2d')

	if (!croppedCtx) {
		throw new Error('No 2d context')
	}

	// Set the size of the cropped canvas
	croppedCanvas.width = pixelCrop.width
	croppedCanvas.height = pixelCrop.height

	// Draw the cropped image
	croppedCtx.drawImage(
		canvas,
		pixelCrop.x,
		pixelCrop.y,
		pixelCrop.width,
		pixelCrop.height,
		0,
		0,
		pixelCrop.width,
		pixelCrop.height,
	)

	// Return as blob
	return new Promise((resolve, reject) => {
		croppedCanvas.toBlob(
			blob => {
				if (blob) {
					resolve(blob)
				} else {
					reject(new Error('Canvas is empty'))
				}
			},
			'image/jpeg',
			0.95,
		)
	})
}

function createImage(url: string): Promise<HTMLImageElement> {
	return new Promise((resolve, reject) => {
		const image = new Image()
		image.addEventListener('load', () => resolve(image))
		image.addEventListener('error', error => reject(error))
		image.crossOrigin = 'anonymous'
		image.src = url
	})
}

function getRadianAngle(degreeValue: number): number {
	return (degreeValue * Math.PI) / 180
}

function rotateSize(
	width: number,
	height: number,
	rotation: number,
): { width: number; height: number } {
	const rotRad = getRadianAngle(rotation)
	return {
		width:
			Math.abs(Math.cos(rotRad) * width) + Math.abs(Math.sin(rotRad) * height),
		height:
			Math.abs(Math.sin(rotRad) * width) + Math.abs(Math.cos(rotRad) * height),
	}
}

export function PhotoEditor({
	imageUrl,
	open,
	onClose,
	onSave,
	aspectRatio: initialAspectRatio = 3 / 4, // Default aspect ratio
	title = 'Edit Photo',
}: PhotoEditorProps) {
	const [crop, setCrop] = useState<Point>({ x: 0, y: 0 })
	const [zoom, setZoom] = useState(1)
	const [rotation, setRotation] = useState(0)
	const [flipHorizontal, setFlipHorizontal] = useState(false)
	const [flipVertical, setFlipVertical] = useState(false)
	const [croppedAreaPixels, setCroppedAreaPixels] = useState<Area | null>(null)
	const [isSaving, setIsSaving] = useState(false)
	const [currentAspectRatio, setCurrentAspectRatio] = useState(initialAspectRatio)
	const [selectedPreset, setSelectedPreset] = useState<AspectRatioKey | null>(
		// Find matching preset or null
		(Object.keys(ASPECT_RATIOS) as AspectRatioKey[]).find(
			key => Math.abs(ASPECT_RATIOS[key].value - initialAspectRatio) < 0.01
		) ?? null
	)

	const handleAspectRatioChange = (preset: AspectRatioKey) => {
		setSelectedPreset(preset)
		setCurrentAspectRatio(ASPECT_RATIOS[preset].value)
		// Reset crop position when changing aspect ratio
		setCrop({ x: 0, y: 0 })
	}

	const onCropComplete = useCallback((_: Area, croppedAreaPixels: Area) => {
		setCroppedAreaPixels(croppedAreaPixels)
	}, [])

	const handleZoomIn = () => {
		setZoom(prev => Math.min(prev + 0.1, 3))
	}

	const handleZoomOut = () => {
		setZoom(prev => Math.max(prev - 0.1, 1))
	}

	const handleRotateLeft = () => {
		setRotation(prev => prev - 90)
	}

	const handleRotateRight = () => {
		setRotation(prev => prev + 90)
	}

	const handleRotateFineLeft = () => {
		setRotation(prev => prev - 5)
	}

	const handleRotateFineRight = () => {
		setRotation(prev => prev + 5)
	}

	const handleFlipHorizontal = () => {
		setFlipHorizontal(prev => !prev)
	}

	const handleFlipVertical = () => {
		setFlipVertical(prev => !prev)
	}

	const handleReset = () => {
		setCrop({ x: 0, y: 0 })
		setZoom(1)
		setRotation(0)
		setFlipHorizontal(false)
		setFlipVertical(false)
		setCurrentAspectRatio(initialAspectRatio)
		setSelectedPreset(
			(Object.keys(ASPECT_RATIOS) as AspectRatioKey[]).find(
				key => Math.abs(ASPECT_RATIOS[key].value - initialAspectRatio) < 0.01
			) ?? null
		)
	}

	const handleSave = async () => {
		if (!croppedAreaPixels) return

		setIsSaving(true)
		try {
			const croppedImage = await getCroppedImg(
				imageUrl,
				croppedAreaPixels,
				rotation,
				flipHorizontal,
				flipVertical,
			)
			onSave(croppedImage)
		} catch (error) {
			console.error('Error cropping image:', error)
		} finally {
			setIsSaving(false)
		}
	}

	const handleClose = () => {
		handleReset()
		onClose()
	}

	return (
		<Dialog open={open} onOpenChange={handleClose}>
			<DialogContent className="max-w-3xl">
				<DialogHeader>
					<DialogTitle>{title}</DialogTitle>
					<DialogDescription>
						Crop, rotate, and adjust the photo to meet the required standards.
					</DialogDescription>
				</DialogHeader>

				<div className="relative h-[400px] w-full rounded-lg bg-slate-900 overflow-hidden">
					<Cropper
						image={imageUrl}
						crop={crop}
						zoom={zoom}
						rotation={rotation}
						aspect={currentAspectRatio}
						onCropChange={setCrop}
						onCropComplete={onCropComplete}
						onZoomChange={setZoom}
						transform={[
							`translate(${crop.x}px, ${crop.y}px)`,
							`rotateZ(${rotation}deg)`,
							`scale(${zoom})`,
							`scaleX(${flipHorizontal ? -1 : 1})`,
							`scaleY(${flipVertical ? -1 : 1})`,
						].join(' ')}
					/>
				</div>

				{/* Controls */}
				<div className="space-y-4">
					{/* Aspect Ratio Presets */}
					<div className="flex items-center justify-center gap-2">
						<Crop className="h-4 w-4 text-muted-foreground" />
						<span className="text-sm text-muted-foreground mr-2">Crop Size:</span>
						{(Object.keys(ASPECT_RATIOS) as AspectRatioKey[]).map(key => (
							<Button
								key={key}
								type="button"
								variant={selectedPreset === key ? 'default' : 'outline'}
								size="sm"
								onClick={() => handleAspectRatioChange(key)}
								title={ASPECT_RATIOS[key].description}
							>
								{ASPECT_RATIOS[key].label}
							</Button>
						))}
					</div>

					{/* Zoom Control */}
					<div className="flex items-center justify-center gap-2">
						<span className="w-12 text-sm text-muted-foreground">Zoom</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleZoomOut}
							disabled={zoom <= 1}
							title="Zoom Out"
						>
							<ZoomOut className="h-4 w-4" />
						</Button>
						<span className="w-16 text-center text-sm font-medium">
							{Math.round(zoom * 100)}%
						</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleZoomIn}
							disabled={zoom >= 3}
							title="Zoom In"
						>
							<ZoomIn className="h-4 w-4" />
						</Button>
					</div>

					{/* Rotation and Flip Controls */}
					<div className="flex items-center justify-center gap-2 flex-wrap">
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleRotateLeft}
							title="Rotate Left 90°"
						>
							<RotateCcw className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleRotateFineLeft}
							title="Rotate Left 5°"
						>
							<Minus className="h-4 w-4" />
						</Button>
						<span className="w-16 text-center text-sm font-medium">
							{rotation}°
						</span>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleRotateFineRight}
							title="Rotate Right 5°"
						>
							<Plus className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant="outline"
							size="sm"
							onClick={handleRotateRight}
							title="Rotate Right 90°"
						>
							<RotateCw className="h-4 w-4" />
						</Button>
						<div className="mx-2 h-6 w-px bg-border" />
						<Button
							type="button"
							variant={flipHorizontal ? 'default' : 'outline'}
							size="sm"
							onClick={handleFlipHorizontal}
							title="Flip Horizontal"
						>
							<FlipHorizontal className="h-4 w-4" />
						</Button>
						<Button
							type="button"
							variant={flipVertical ? 'default' : 'outline'}
							size="sm"
							onClick={handleFlipVertical}
							title="Flip Vertical"
						>
							<FlipVertical className="h-4 w-4" />
						</Button>
						<div className="mx-2 h-6 w-px bg-border" />
						<Button
							type="button"
							variant="ghost"
							size="sm"
							onClick={handleReset}
						>
							Reset
						</Button>
					</div>
				</div>

				<DialogFooter>
					<Button type="button" variant="outline" onClick={handleClose}>
						Cancel
					</Button>
					<Button type="button" onClick={handleSave} disabled={isSaving}>
						{isSaving ? 'Saving...' : 'Save Changes'}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	)
}
