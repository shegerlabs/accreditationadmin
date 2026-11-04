import {
	Calendar,
	CheckCircle2,
	Clock,
	FileText,
	GitBranch,
	Globe,
	ListChecks,
	Mail,
	MapPin,
	Shield,
	Tag,
	User,
	Users,
} from 'lucide-react'
import { Card, CardDescription, CardHeader, CardTitle } from '~/components/ui/card'
import { WizardStepContent } from '~/components/wizard'
import type { DataSourceType } from '~/utils/custom-report-types'
import { DATA_SOURCES } from '~/utils/custom-report-schema'
import { cn } from '~/utils/misc'

// Icon mapping
const ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
	Users,
	CheckCircle2,
	Mail,
	Calendar,
	FileText,
	User,
	GitBranch,
	ListChecks,
	Tag,
	Clock,
	MapPin,
	Globe,
	Shield,
}

interface StepDataSourceProps {
	selectedDataSource?: DataSourceType
	onSelect: (dataSource: DataSourceType) => void
}

export function StepDataSource({
	selectedDataSource,
	onSelect,
}: StepDataSourceProps) {
	return (
		<WizardStepContent
			title="Select Data Source"
			description="Choose the primary data model for your report. This determines what fields are available."
		>
			<div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
				{DATA_SOURCES.map((source) => {
					const Icon = ICONS[source.icon] || FileText
					const isSelected = selectedDataSource === source.name

					return (
						<Card
							key={source.name}
							className={cn(
								'cursor-pointer transition-all hover:border-primary',
								isSelected && 'border-primary bg-primary/5 ring-1 ring-primary',
							)}
							onClick={() => onSelect(source.name)}
						>
							<CardHeader>
								<div className="flex items-center gap-3">
									<div
										className={cn(
											'rounded-lg p-2',
											isSelected
												? 'bg-primary text-primary-foreground'
												: 'bg-muted',
										)}
									>
										<Icon className="h-5 w-5" />
									</div>
									<div>
										<CardTitle className="text-base">{source.label}</CardTitle>
									</div>
								</div>
								<CardDescription className="mt-2 text-sm">
									{source.description}
								</CardDescription>
							</CardHeader>
						</Card>
					)
				})}
			</div>
		</WizardStepContent>
	)
}
