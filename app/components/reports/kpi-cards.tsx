import { LucideIcon } from 'lucide-react'
import { Card, CardContent, CardHeader, CardTitle } from '~/components/ui/card'

export type KpiCardData = {
	title: string
	value: string | number
	description?: string
	icon?: LucideIcon
	trend?: {
		value: number
		isPositive: boolean
	}
}

export function KpiCard({ data }: { data: KpiCardData }) {
	const Icon = data.icon

	return (
		<Card>
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-sm font-medium">{data.title}</CardTitle>
				{Icon && <Icon className="h-4 w-4 text-muted-foreground" />}
			</CardHeader>
			<CardContent>
				<div className="text-2xl font-bold">{data.value}</div>
				{data.description && (
					<p className="text-xs text-muted-foreground">{data.description}</p>
				)}
				{data.trend && (
					<p
						className={`text-xs ${data.trend.isPositive ? 'text-green-600' : 'text-red-600'}`}
					>
						{data.trend.isPositive ? '+' : ''}
						{data.trend.value}% from previous period
					</p>
				)}
			</CardContent>
		</Card>
	)
}

export function KpiCards({ cards }: { cards: KpiCardData[] }) {
	return (
		<div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
			{cards.map((card, index) => (
				<KpiCard key={index} data={card} />
			))}
		</div>
	)
}
