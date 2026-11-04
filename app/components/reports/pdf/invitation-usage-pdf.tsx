import { StyleSheet, Text, View } from '@react-pdf/renderer'
import {
	PdfKpiGrid,
	PdfSection,
	PdfTable,
	ReportDocument,
} from './report-document'

const styles = StyleSheet.create({
	summaryRow: {
		flexDirection: 'row',
		justifyContent: 'space-between',
		paddingVertical: 4,
		borderBottomWidth: 1,
		borderBottomColor: '#f3f4f6',
	},
	summaryLabel: {
		fontSize: 9,
		color: '#374151',
	},
	summaryValue: {
		fontSize: 9,
		fontFamily: 'Helvetica-Bold',
	},
})

type InvitationUsageData = {
	summary: {
		totalInvitations: number
		totalQuota: number
		totalUsed: number
		totalRemaining: number
		overallUsagePercentage: number
		hasUnlimitedQuotas: boolean
	}
	invitations: Array<{
		id: string
		invitationId: string
		organization: string
		email: string
		event: string
		participantType: string
		accessLevel: string
		restriction: string
		quota: number
		used: number
		remaining: number
		usagePercentage: number
	}>
}

type InvitationUsagePdfProps = {
	data: InvitationUsageData
	filters?: {
		eventName?: string
	}
}

export function InvitationUsagePdf({ data, filters }: InvitationUsagePdfProps) {
	const filterDescription = filters?.eventName
		? `Event: ${filters.eventName}`
		: ''

	return (
		<ReportDocument
			title="Invitation Usage Report"
			subtitle={filterDescription}
		>
			<PdfKpiGrid
				cards={[
					{ label: 'Total Invitations', value: data.summary.totalInvitations.toString() },
					{
						label: 'Quota Used',
						value: data.summary.hasUnlimitedQuotas
							? `${data.summary.totalUsed} used`
							: `${data.summary.totalUsed} / ${data.summary.totalQuota}`,
					},
					{
						label: 'Usage Rate',
						value: data.summary.hasUnlimitedQuotas
							? 'N/A'
							: `${data.summary.overallUsagePercentage}%`,
					},
				]}
			/>

			<PdfSection title="Summary">
				<View style={styles.summaryRow}>
					<Text style={styles.summaryLabel}>Total Quota</Text>
					<Text style={styles.summaryValue}>
						{data.summary.hasUnlimitedQuotas
							? 'Includes Unlimited'
							: data.summary.totalQuota.toLocaleString()}
					</Text>
				</View>
				<View style={styles.summaryRow}>
					<Text style={styles.summaryLabel}>Total Used</Text>
					<Text style={styles.summaryValue}>
						{data.summary.totalUsed.toLocaleString()}
					</Text>
				</View>
				<View style={styles.summaryRow}>
					<Text style={styles.summaryLabel}>Remaining</Text>
					<Text style={styles.summaryValue}>
						{data.summary.hasUnlimitedQuotas
							? 'N/A'
							: data.summary.totalRemaining.toLocaleString()}
					</Text>
				</View>
			</PdfSection>

			<PdfSection title="Invitation Details">
				<PdfTable
					columns={[
						{ key: 'organization', header: 'Organization', width: '25%' },
						{ key: 'participantType', header: 'Type', width: '18%' },
						{ key: 'accessLevel', header: 'Access', width: '12%' },
						{ key: 'quota', header: 'Quota', width: '12%' },
						{ key: 'used', header: 'Used', width: '10%' },
						{ key: 'remaining', header: 'Left', width: '10%' },
						{ key: 'usagePercentage', header: 'Usage', width: '13%' },
					]}
					data={data.invitations.slice(0, 50).map((inv, index, arr) => {
						const isUnlimited = !inv.quota || inv.quota === 0
						const prevInv = index > 0 ? arr[index - 1] : null
						const showOrganization = !prevInv || prevInv.invitationId !== inv.invitationId
						return {
							...inv,
							organization: showOrganization ? inv.organization : '',
							quota: isUnlimited ? 'Unlimited' : inv.quota,
							remaining: isUnlimited ? '-' : inv.remaining,
							usagePercentage: isUnlimited ? '-' : `${inv.usagePercentage}%`,
						}
					})}
				/>
			</PdfSection>

		</ReportDocument>
	)
}
