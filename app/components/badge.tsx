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
import React, { useEffect, useState } from 'react'

const styles = StyleSheet.create({
	page: {
		flexDirection: 'column',
		backgroundColor: '#ffffff',
		alignItems: 'center',
	},
	header: {
		alignItems: 'center',
		marginTop: 15,
		width: '100%',
	},
	section: {
		flexGrow: 1,
		justifyContent: 'center',
		alignItems: 'center',
		marginVertical: 1,
		width: '95%',
	},
	background: {
		position: 'absolute',
		top: 0,
		left: 0,
		right: 0,
		bottom: 0,
	},
	row: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		alignItems: 'center',
		width: '100%',
		gap: 8,
		marginTop: 4,
	},
	qrCode: {
		width: '48%',
		height: '70pt',
	},
	photo: {
		width: '48%',
		height: '70pt',
	},
	nameContainer: {
		width: '100%',
		marginTop: 4,
		paddingHorizontal: 4,
	},
	name: {
		fontSize: 10,
		textAlign: 'left',
	},
	nameText: {
		textOverflow: 'ellipsis',
	},
	sessionIndicator: {
		fontSize: 32,
		fontWeight: 'ultrabold',
		color: 'red',
		textAlign: 'right',
		// marginBottom: 1,
	},
	organization: {
		fontSize: 10,
		textAlign: 'left',
		marginTop: 2,
	},
	closedSession: {
		fontSize: 24,
		textAlign: 'center',
		fontWeight: 'ultrabold',
		color: 'black',
	},
	bottomSection: {
		position: 'absolute',
		bottom: 14,
		width: '80%',
		textAlign: 'center',
	},
	africanUnionText: {
		fontSize: 12,
		textAlign: 'center',
		fontWeight: 'bold',
	},
})

interface BadgeProps {
	badgeInfo: {
		id: string
		name: string
		organization: string
		closedSession: boolean
	}
	photoUrl: string
	frontBackgroundUrl: string
	backBackgroundUrl: string
}

export const Badge: React.FC<BadgeProps> = ({
	badgeInfo,
	photoUrl,
	frontBackgroundUrl,
	backBackgroundUrl,
}) => {
	// Step 1: Declare a state variable to track if we are on the client
	const [isClient, setIsClient] = useState(false)
	const [qrCodeDataURL, setQrCodeDataURL] = useState('')

	// Step 2: Use useEffect to detect if we are on the client
	useEffect(() => {
		// When the component mounts, we set isClient to true
		setIsClient(true)
		generateQRCode(
			JSON.stringify({
				...badgeInfo,
				canAttendClosedSession: badgeInfo.closedSession ? 'Yes' : 'No',
			}),
		)
	}, [badgeInfo])

	// Step 3: Define the document (badge) content to reuse for both rendering and download
	const generateQRCode = async (data: string) => {
		try {
			const dataURL = await QRCode.toDataURL(data, { width: 128, margin: 0 })
			setQrCodeDataURL(dataURL)
		} catch (error) {
			console.error('Error generating QR code:', error)
		}
	}

	const badgeDocument = (
		<Document title={`${badgeInfo.name}`}>
			<Page size={[153, 243]} style={styles.page}>
				<Image src={frontBackgroundUrl} style={styles.background} />
				<View style={styles.section}>
					<Text style={styles.sessionIndicator}>
						{badgeInfo.closedSession ? 'C' : ''}
					</Text>
					<View style={styles.row}>
						{qrCodeDataURL && (
							<Image src={qrCodeDataURL} style={styles.qrCode} />
						)}
						<Image src={photoUrl} style={styles.photo} />
					</View>
					<View style={styles.nameContainer}>
						<Text style={styles.name}>Name: {badgeInfo.name}</Text>
						<Text style={styles.organization}>
							Org: {badgeInfo.organization}
						</Text>
					</View>
				</View>
				{/* <View style={styles.bottomSection}>
					<Text style={styles.africanUnionText}>African Union</Text>
				</View> */}
			</Page>
			{/* Back of the badge */}
			<Page size={[153, 243]} style={styles.page}>
				<Image src={backBackgroundUrl} style={styles.background} />
				<View style={styles.section}>
					{/* Add any additional information for the back of the badge here */}
				</View>
			</Page>
		</Document>
	)

	// Step 4: Conditionally render the inline PDF viewer only if we are on the client
	if (!isClient) {
		// During SSR, this will render nothing, avoiding the mismatch
		return null
	}

	return (
		<div className="flex flex-col gap-4">
			{/* Step 5: Render the PDF inline using PDFViewer */}
			<PDFViewer width="100%" height="600px">
				{badgeDocument}
			</PDFViewer>
		</div>
	)
}
