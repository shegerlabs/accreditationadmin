import { useEffect, useState } from 'react'

interface QrScannerClientProps {
	onScan: (data: string) => void
	paused?: boolean
}

function ScannerInner({
	onScan,
	paused,
	ScannerComponent,
	useDevicesHook,
}: QrScannerClientProps & { ScannerComponent: any; useDevicesHook: () => MediaDeviceInfo[] }) {
	const devices = useDevicesHook()
	const [selectedDeviceId, setSelectedDeviceId] = useState<string>('')

	// Pick default device once devices are available
	useEffect(() => {
		if (devices.length > 0 && !selectedDeviceId) {
			setSelectedDeviceId(devices[devices.length - 1].deviceId)
		}
	}, [devices, selectedDeviceId])

	return (
		<div className="space-y-2">
			{devices.length > 1 && (
				<select
					value={selectedDeviceId}
					onChange={e => setSelectedDeviceId(e.target.value)}
					className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm ring-offset-background focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2"
				>
					{devices.map((device, index) => (
						<option key={device.deviceId} value={device.deviceId}>
							{device.label || `Camera ${index + 1}`}
						</option>
					))}
				</select>
			)}
			<ScannerComponent
				key={selectedDeviceId}
				onScan={(result: Array<{ rawValue: string }>) => {
					if (result?.[0]?.rawValue) {
						onScan(result[0].rawValue)
					}
				}}
				onError={(error: unknown) => {
					console.error('QR Scanner error:', error)
				}}
				formats={['qr_code']}
				paused={paused}
				constraints={
					selectedDeviceId
						? { deviceId: { exact: selectedDeviceId } }
						: undefined
				}
				styles={{
					container: { borderRadius: '0.5rem', overflow: 'hidden' },
				}}
				allowMultiple={true}
				scanDelay={1500}
				sound={false}
			/>
		</div>
	)
}

export function QrScannerClient({ onScan, paused = false }: QrScannerClientProps) {
	const [isClient, setIsClient] = useState(false)
	const [mod, setMod] = useState<{ Scanner: any; useDevices: () => MediaDeviceInfo[] } | null>(null)

	useEffect(() => {
		setIsClient(true)
		Promise.all([
			import('@yudiel/react-qr-scanner'),
			import('barcode-detector'),
		]).then(([scanner, barcodeDetector]) => {
			// Point ZXing WASM to self-hosted file so it doesn't hit CDN (blocked by CSP)
			barcodeDetector.setZXingModuleOverrides({
				locateFile: () => '/zxing_reader.wasm',
			})
			setMod({ Scanner: scanner.Scanner, useDevices: scanner.useDevices })
		})
	}, [])

	if (!isClient || !mod) {
		return (
			<div className="flex h-64 items-center justify-center rounded-lg border bg-muted">
				<p className="text-sm text-muted-foreground">Loading scanner...</p>
			</div>
		)
	}

	return (
		<ScannerInner
			onScan={onScan}
			paused={paused}
			ScannerComponent={mod.Scanner}
			useDevicesHook={mod.useDevices}
		/>
	)
}
