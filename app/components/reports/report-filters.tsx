import { Form, useSearchParams, useSubmit } from '@remix-run/react'
import { Filter } from 'lucide-react'
import { useId } from 'react'
import { Button } from '~/components/ui/button'
import { Input } from '~/components/ui/input'
import { Label } from '~/components/ui/label'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'

type FilterOption = {
	value: string
	label: string
}

type FilterField = {
	name: string
	label: string
	type: 'select' | 'date'
	options?: FilterOption[]
	placeholder?: string
}

type ReportFiltersProps = {
	fields: FilterField[]
	action: string
}

export function ReportFilters({ fields, action }: ReportFiltersProps) {
	const id = useId()
	const [searchParams] = useSearchParams()
	const submit = useSubmit()

	const handleChange = (e: React.FormEvent<HTMLFormElement>) => {
		submit(e.currentTarget, { method: 'GET', action })
	}

	const handleClear = () => {
		submit(new FormData(), { method: 'GET', action })
	}

	const hasFilters = fields.some(field => {
		const value = searchParams.get(field.name)
		return value && value !== 'all'
	})

	return (
		<Form
			method="GET"
			action={action}
			onChange={handleChange}
			className="flex flex-wrap items-end gap-4"
		>
			{fields.map(field => {
				const defaultValue = searchParams.get(field.name) ?? ''

				return (
					<div key={field.name} className="min-w-[180px]">
						<Label
							htmlFor={`${id}-${field.name}`}
							className="mb-1.5 block text-sm font-medium"
						>
							{field.label}
						</Label>
						{field.type === 'select' ? (
							<Select name={field.name} defaultValue={defaultValue || 'all'}>
								<SelectTrigger id={`${id}-${field.name}`}>
									<SelectValue placeholder={field.placeholder ?? field.label} />
								</SelectTrigger>
								<SelectContent>
									<SelectItem value="all">All</SelectItem>
									{field.options?.map(option => (
										<SelectItem key={option.value} value={option.value}>
											{option.label}
										</SelectItem>
									))}
								</SelectContent>
							</Select>
						) : (
							<Input
								type="date"
								name={field.name}
								id={`${id}-${field.name}`}
								defaultValue={defaultValue}
								className="w-full"
							/>
						)}
					</div>
				)
			})}
			<div className="flex gap-2">
				<Button type="submit" size="sm">
					<Filter className="mr-2 h-4 w-4" />
					Apply
				</Button>
				{hasFilters && (
					<Button type="button" variant="outline" size="sm" onClick={handleClear}>
						Clear
					</Button>
				)}
			</div>
		</Form>
	)
}
