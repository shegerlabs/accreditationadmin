import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	useFetcher,
	useLoaderData,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import { useCallback, useEffect, useState } from 'react'
import {
	StepDataSource,
	StepFields,
	StepFilters,
	StepOutput,
	StepPreview,
} from '~/components/custom-reports'
import { WizardContainer, WizardNavigation } from '~/components/wizard'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import { getReportPreview } from '~/utils/custom-report-query.server'
import type {
	CustomReportConfig,
	ReportResult,
	WizardState,
} from '~/utils/custom-report-types'
import {
	canProceedToStep,
	isStep1Complete,
	isStep2Complete,
	isStep5Complete,
} from '~/utils/custom-report-types'
import { prisma } from '~/utils/db.server'
import type { Prisma } from '@prisma/client'

const WIZARD_STEPS = [
	{ id: 1, title: 'Data Source', description: 'Choose model' },
	{ id: 2, title: 'Fields', description: 'Select columns' },
	{ id: 3, title: 'Filters', description: 'Add conditions' },
	{ id: 4, title: 'Output', description: 'Sort & group' },
	{ id: 5, title: 'Preview', description: 'Review & save' },
]

export async function loader({ request, params }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	const { reportId } = params

	if (!reportId) {
		throw new Response('Report ID required', { status: 400 })
	}

	const report = await prisma.customReport.findFirst({
		where: {
			id: reportId,
			...tenantFilter,
			createdById: user.id, // Only owner can edit
		},
	})

	if (!report) {
		throw new Response('Report not found or access denied', { status: 404 })
	}

	const config = report.config as unknown as CustomReportConfig

	return json({
		report: {
			id: report.id,
			name: report.name,
			description: report.description,
			isPublic: report.isPublic,
		},
		initialState: {
			step: 1,
			dataSource: config.dataSource,
			fields: config.fields,
			computedFields: config.computedFields || [],
			fieldOrder: config.fieldOrder || [],
			filters: config.filters,
			groupBy: config.groupBy || [],
			aggregations: config.aggregations || [],
			sorting: config.sorting,
			limit: config.limit,
			name: report.name,
			description: report.description || undefined,
			isPublic: report.isPublic,
		} as WizardState,
	})
}

export async function action({ request, params }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	const { reportId } = params

	if (!reportId) {
		return json({ error: 'Report ID required' }, { status: 400 })
	}

	const report = await prisma.customReport.findFirst({
		where: {
			id: reportId,
			...tenantFilter,
			createdById: user.id,
		},
	})

	if (!report) {
		return json({ error: 'Report not found' }, { status: 404 })
	}

	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'preview') {
		const configJson = formData.get('config')
		if (!configJson || typeof configJson !== 'string') {
			return json({ error: 'Invalid configuration' }, { status: 400 })
		}

		try {
			const config = JSON.parse(configJson) as CustomReportConfig
			const preview = await getReportPreview(config, tenantFilter, 10)
			return json({ preview })
		} catch (error) {
			return json(
				{
					error: error instanceof Error ? error.message : 'Preview failed',
				},
				{ status: 400 },
			)
		}
	}

	if (intent === 'save') {
		const name = formData.get('name')
		const description = formData.get('description')
		const isPublic = formData.get('isPublic') === 'true'
		const configJson = formData.get('config')

		if (!name || typeof name !== 'string') {
			return json({ error: 'Report name is required' }, { status: 400 })
		}

		if (!configJson || typeof configJson !== 'string') {
			return json({ error: 'Invalid configuration' }, { status: 400 })
		}

		try {
			const config = JSON.parse(configJson) as CustomReportConfig

			// Check for duplicate name (excluding current report)
			const existing = await prisma.customReport.findFirst({
				where: {
					...tenantFilter,
					name,
					id: { not: reportId },
				},
			})

			if (existing) {
				return json(
					{ error: 'A report with this name already exists' },
					{ status: 400 },
				)
			}

			await prisma.customReport.update({
				where: { id: reportId },
				data: {
					name,
					description: description as string | undefined,
					dataSource: config.dataSource,
					config: JSON.parse(JSON.stringify(config)) as Prisma.InputJsonValue,
					isPublic,
				},
			})

			return redirect(`/admin/reports/custom/${reportId}`)
		} catch (error) {
			return json(
				{ error: error instanceof Error ? error.message : 'Save failed' },
				{ status: 400 },
			)
		}
	}

	return json({ error: 'Invalid action' }, { status: 400 })
}

export default function EditCustomReportRoute() {
	const { report, initialState } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const [searchParams, setSearchParams] = useSearchParams()
	const fetcher = useFetcher<{ preview?: ReportResult; error?: string }>()

	const currentStep = parseInt(searchParams.get('step') || '1', 10)

	// Convert loader data to proper WizardState with explicit typing
	const [wizardState, setWizardState] = useState<WizardState>(() => ({
		step: initialState.step,
		dataSource: initialState.dataSource,
		fields: initialState.fields.map(f => ({ path: f.path, alias: f.alias })),
		computedFields: initialState.computedFields.map(cf => ({
			id: cf.id,
			name: cf.name,
			fields: cf.fields,
			separator: cf.separator,
		})),
		fieldOrder: initialState.fieldOrder,
		filters: initialState.filters.map(f => ({
			field: f.field,
			operator: f.operator,
			value: f.value ?? '',
		})),
		groupBy: initialState.groupBy,
		aggregations: initialState.aggregations.map(a => ({
			field: a.field,
			type: a.type,
			alias: a.alias,
		})),
		sorting: initialState.sorting.map(s => ({
			field: s.field,
			direction: s.direction,
		})),
		limit: initialState.limit,
		name: initialState.name,
		description: initialState.description,
		isPublic: initialState.isPublic,
	}))

	const previewData = fetcher.data?.preview
	const previewError = fetcher.data?.error
	const isLoadingPreview = fetcher.state !== 'idle'

	const setStep = useCallback(
		(step: number) => {
			if (canProceedToStep(wizardState, step)) {
				setSearchParams({ step: step.toString() })
				setWizardState((prev) => ({ ...prev, step }))
			}
		},
		[wizardState, setSearchParams],
	)

	useEffect(() => {
		if (
			currentStep === 5 &&
			wizardState.dataSource &&
			wizardState.fields.length > 0
		) {
			const config: CustomReportConfig = {
				dataSource: wizardState.dataSource,
				fields: wizardState.fields,
				computedFields:
					wizardState.computedFields.length > 0
						? wizardState.computedFields
						: undefined,
				fieldOrder:
					wizardState.fieldOrder.length > 0
						? wizardState.fieldOrder
						: undefined,
				filters: wizardState.filters,
				groupBy: wizardState.groupBy.length > 0 ? wizardState.groupBy : undefined,
				aggregations:
					wizardState.aggregations.length > 0
						? wizardState.aggregations
						: undefined,
				sorting: wizardState.sorting,
				limit: wizardState.limit,
			}

			fetcher.submit(
				{ intent: 'preview', config: JSON.stringify(config) },
				{ method: 'POST' },
			)
		}
	}, [currentStep])

	const handleBack = () => {
		if (currentStep > 1) {
			setStep(currentStep - 1)
		}
	}

	const handleNext = () => {
		if (currentStep < 5) {
			setStep(currentStep + 1)
		}
	}

	const handleCancel = () => {
		navigate(`/admin/reports/custom/${report.id}`)
	}

	const handleSave = () => {
		if (!isStep5Complete(wizardState)) return

		const config: CustomReportConfig = {
			dataSource: wizardState.dataSource!,
			fields: wizardState.fields,
			computedFields:
				wizardState.computedFields.length > 0
					? wizardState.computedFields
					: undefined,
			fieldOrder:
				wizardState.fieldOrder.length > 0
					? wizardState.fieldOrder
					: undefined,
			filters: wizardState.filters,
			groupBy: wizardState.groupBy.length > 0 ? wizardState.groupBy : undefined,
			aggregations:
				wizardState.aggregations.length > 0
					? wizardState.aggregations
					: undefined,
			sorting: wizardState.sorting,
			limit: wizardState.limit,
		}

		fetcher.submit(
			{
				intent: 'save',
				name: wizardState.name!,
				description: wizardState.description || '',
				isPublic: wizardState.isPublic ? 'true' : 'false',
				config: JSON.stringify(config),
			},
			{ method: 'POST' },
		)
	}

	const canProceed = (() => {
		switch (currentStep) {
			case 1:
				return isStep1Complete(wizardState)
			case 2:
				return isStep2Complete(wizardState)
			case 3:
				return true
			case 4:
				return true
			case 5:
				return isStep5Complete(wizardState)
			default:
				return false
		}
	})()

	return (
		<div className="space-y-6">
			<div>
				<h1 className="text-2xl font-bold">Edit Report: {report.name}</h1>
				<p className="text-muted-foreground">
					Modify your report configuration.
				</p>
			</div>

			<WizardContainer steps={WIZARD_STEPS} currentStep={currentStep}>
				{currentStep === 1 && (
					<StepDataSource
						selectedDataSource={wizardState.dataSource}
						onSelect={(dataSource) =>
							setWizardState((prev) => ({
								...prev,
								dataSource,
								fields: [],
								computedFields: [],
								fieldOrder: [],
								filters: [],
								groupBy: [],
								aggregations: [],
								sorting: [],
							}))
						}
					/>
				)}

				{currentStep === 2 && wizardState.dataSource && (
					<StepFields
						dataSource={wizardState.dataSource}
						selectedFields={wizardState.fields}
						onFieldsChange={(fields) =>
							setWizardState((prev) => ({ ...prev, fields }))
						}
						computedFields={wizardState.computedFields}
						onComputedFieldsChange={(computedFields) =>
							setWizardState((prev) => ({ ...prev, computedFields }))
						}
						fieldOrder={wizardState.fieldOrder}
						onFieldOrderChange={(fieldOrder) =>
							setWizardState((prev) => ({ ...prev, fieldOrder }))
						}
					/>
				)}

				{currentStep === 3 && wizardState.dataSource && (
					<StepFilters
						dataSource={wizardState.dataSource}
						filters={wizardState.filters}
						onFiltersChange={(filters) =>
							setWizardState((prev) => ({ ...prev, filters }))
						}
					/>
				)}

				{currentStep === 4 && wizardState.dataSource && (
					<StepOutput
						dataSource={wizardState.dataSource}
						selectedFields={wizardState.fields}
						groupBy={wizardState.groupBy}
						aggregations={wizardState.aggregations}
						sorting={wizardState.sorting}
						limit={wizardState.limit}
						onGroupByChange={(groupBy) =>
							setWizardState((prev) => ({ ...prev, groupBy }))
						}
						onAggregationsChange={(aggregations) =>
							setWizardState((prev) => ({ ...prev, aggregations }))
						}
						onSortingChange={(sorting) =>
							setWizardState((prev) => ({ ...prev, sorting }))
						}
						onLimitChange={(limit) =>
							setWizardState((prev) => ({ ...prev, limit }))
						}
					/>
				)}

				{currentStep === 5 && (
					<StepPreview
						wizardState={wizardState}
						previewData={previewData}
						isLoading={isLoadingPreview}
						error={previewError}
						onNameChange={(name) =>
							setWizardState((prev) => ({ ...prev, name }))
						}
						onDescriptionChange={(description) =>
							setWizardState((prev) => ({ ...prev, description }))
						}
						onIsPublicChange={(isPublic) =>
							setWizardState((prev) => ({ ...prev, isPublic }))
						}
					/>
				)}

				<WizardNavigation
					currentStep={currentStep}
					totalSteps={5}
					canProceed={canProceed}
					onBack={handleBack}
					onNext={handleNext}
					onCancel={handleCancel}
					onSave={handleSave}
					isSubmitting={fetcher.state !== 'idle'}
					saveLabel="Update Report"
				/>
			</WizardContainer>
		</div>
	)
}
