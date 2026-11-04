import { useNavigate, useSearchParams } from '@remix-run/react'
import * as React from 'react'
import {
	Pagination,
	PaginationContent,
	PaginationEllipsis,
	PaginationItem,
	PaginationLink,
} from '~/components/ui/pagination'
import {
	Select,
	SelectContent,
	SelectItem,
	SelectTrigger,
	SelectValue,
} from '~/components/ui/select'
import { Icon } from './ui/icon'

type PaginationProps = {
	totalPages: number
	currentPage: number
	defaultPageSize?: number
	pageSizeOptions?: number[]
}

export function setSearchParamsString(
	searchParams: URLSearchParams,
	changes: Record<string, string | number | undefined>,
) {
	const newSearchParams = new URLSearchParams(searchParams)

	for (const [key, value] of Object.entries(changes)) {
		if (value === undefined) {
			newSearchParams.delete(key)
			continue
		}

		newSearchParams.set(key, String(value))
	}

	return newSearchParams.toString()
}

export const Paginator: React.FC<PaginationProps> = ({
	totalPages,
	currentPage,
	defaultPageSize = 10,
	pageSizeOptions = [10, 20, 50, 100],
}) => {
	const navigate = useNavigate()
	const [searchParams] = useSearchParams()
	const pageNumbers = new Set<number>()

	// Ensure default page size is included in options
	const allOptions = [...new Set([...pageSizeOptions, defaultPageSize])].sort((a, b) => a - b)
	const currentPageSize = searchParams.get('pageSize') || String(defaultPageSize)

	// Always include the first page
	pageNumbers.add(1)

	// Range around the current page
	const startPage = Math.max(2, currentPage - 2)
	const endPage = Math.min(currentPage + 2, totalPages - 1)
	for (let i = startPage; i <= endPage; i++) {
		pageNumbers.add(i)
	}

	// Always include the last page
	pageNumbers.add(totalPages)

	const pagesArray = Array.from(pageNumbers).sort((a, b) => a - b) // Sort the pages for correct display order

	return (
		<Pagination className="justify-end">
			<PaginationContent className="flex-wrap">
				<PaginationItem>
					<Select
						defaultValue={currentPageSize}
						onValueChange={value => {
							navigate({
								search: setSearchParamsString(searchParams, {
									page: 1,
									pageSize: value,
								}),
							})
						}}
					>
						<SelectTrigger className="w-[100px]">
							<SelectValue placeholder={currentPageSize} />
						</SelectTrigger>
						<SelectContent>
							{allOptions.map(size => (
								<SelectItem key={size} value={String(size)}>
									{size}
								</SelectItem>
							))}
							<SelectItem value="All">All</SelectItem>
						</SelectContent>
					</Select>
				</PaginationItem>
				<PaginationItem>
					<PaginationLink
						to={{
							search: setSearchParamsString(searchParams, {
								page: 1,
							}),
						}}
						isActive={currentPage === 1}
						isDisabled={currentPage === 1}
					>
						<Icon name="double-arrow-left" />
					</PaginationLink>
				</PaginationItem>
				<PaginationItem>
					<PaginationLink
						to={{
							search: setSearchParamsString(searchParams, {
								page: currentPage - 1,
							}),
						}}
						isDisabled={currentPage === 1}
					>
						<Icon name="chevron-left" />
					</PaginationLink>
				</PaginationItem>

				{pagesArray.map((page, i, array) => (
					<React.Fragment key={page}>
						{/* Render an ellipsis if there's a gap in the sequence */}
						{i > 0 && page - array[i - 1] > 1 && (
							<PaginationItem className="hidden sm:flex">
								<PaginationEllipsis />
							</PaginationItem>
						)}
						<PaginationItem className="hidden sm:flex">
							<PaginationLink
								to={{
									search: setSearchParamsString(searchParams, {
										page,
									}),
								}}
								isActive={currentPage === page}
							>
								{page}
							</PaginationLink>
						</PaginationItem>
					</React.Fragment>
				))}

				<PaginationItem>
					<PaginationLink
						to={{
							search: setSearchParamsString(searchParams, {
								page: currentPage + 1,
							}),
						}}
						isDisabled={currentPage === totalPages}
					>
						<Icon name="chevron-right" />
					</PaginationLink>
				</PaginationItem>
				<PaginationItem>
					<PaginationLink
						to={{
							search: setSearchParamsString(searchParams, {
								page: totalPages,
							}),
						}}
						isActive={currentPage === totalPages}
						isDisabled={currentPage === totalPages}
					>
						<Icon name="double-arrow-right" />
					</PaginationLink>
				</PaginationItem>
			</PaginationContent>
		</Pagination>
	)
}
