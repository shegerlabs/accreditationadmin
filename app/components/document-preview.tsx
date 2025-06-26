import { Download, Eye, FileIcon, RotateCw } from 'lucide-react'
import * as React from 'react'
import { Button } from '~/components/ui/button'
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from '~/components/ui/dialog'
import { cn } from '~/utils/misc'

interface DocumentPreviewProps {
	title: string
	documentUrl: string
	contentType: string
	onDownload: () => void
	type: string
}

export function DocumentPreview({
	title,
	documentUrl,
	contentType,
	onDownload,
	type,
}: DocumentPreviewProps) {
	const [isOpen, setIsOpen] = React.useState(false)
	const [key, setKey] = React.useState(0)

	const isImage = contentType.startsWith('image/')
	const isPDF = contentType === 'application/pdf'

	const previewUrl = `${documentUrl}${documentUrl.includes('?') ? '&' : '?'}mode=preview`

	const handleReload = () => {
		setKey(prev => prev + 1)
	}

	return (
		<div className="group relative flex items-center justify-between rounded-lg border-2 border-green-100 bg-green-50/50 p-4 shadow-sm transition-all hover:border-green-200 hover:bg-green-50">
			<div className="flex items-center gap-3">
				<div className="flex h-10 w-10 items-center justify-center rounded-full bg-green-100 text-green-600">
					<FileIcon className="h-5 w-5" />
				</div>
				<div>
					<h3 className="font-medium text-green-900">
						{type.charAt(0).toUpperCase() + type.slice(1).toLowerCase()}
					</h3>
				</div>
			</div>
			<div className="flex items-center gap-2">
				<Button
					variant="ghost"
					size="sm"
					className="flex items-center gap-2 text-green-600 hover:bg-green-100 hover:text-green-700"
					onClick={() => setIsOpen(true)}
					type="button"
				>
					<Eye className="h-4 w-4" />
				</Button>
				<Button
					variant="ghost"
					size="sm"
					className="flex items-center gap-2 text-green-600 hover:bg-green-100 hover:text-green-700"
					onClick={onDownload}
					type="button"
				>
					<Download className="h-4 w-4" />
				</Button>
			</div>

			<Dialog open={isOpen} onOpenChange={setIsOpen}>
				<DialogContent
					className={cn(
						'flex h-[90vh] max-h-[90vh] max-w-5xl flex-col gap-0 rounded-lg p-0',
					)}
				>
					<DialogHeader className="relative border-b px-6 py-4">
						<DialogTitle className="text-xl">{title}</DialogTitle>
						<div className="flex items-center justify-between">
							<DialogDescription className="text-sm text-gray-500">
								Preview of {type.toLowerCase()} document
							</DialogDescription>
							<Button
								variant="ghost"
								size="icon"
								className="h-6 w-6 rounded-full hover:bg-gray-100"
								onClick={handleReload}
							>
								<RotateCw className="h-4 w-4" />
								<span className="sr-only">Reload</span>
							</Button>
						</div>
					</DialogHeader>
					<div className="relative flex-1 overflow-hidden bg-gray-50/50 p-6">
						{isImage ? (
							<div className="flex h-full items-center justify-center overflow-auto rounded-lg bg-white/50 p-4 shadow-sm">
								<img
									key={key}
									src={previewUrl}
									alt={title}
									className="max-h-full max-w-full rounded-lg object-contain"
								/>
							</div>
						) : isPDF ? (
							<div className="h-full overflow-hidden rounded-lg bg-white shadow-sm">
								<iframe
									key={key}
									src={previewUrl}
									title={title}
									className="h-full w-full border-0"
									style={{ minHeight: 0 }}
								/>
							</div>
						) : (
							<div className="flex h-full items-center justify-center rounded-lg bg-white p-4 text-gray-500 shadow-sm">
								Unsupported file type
							</div>
						)}
					</div>
				</DialogContent>
			</Dialog>
		</div>
	)
}
