import {
	json,
	redirect,
	type ActionFunctionArgs,
	type LoaderFunctionArgs,
} from '@remix-run/node'
import {
	Link,
	useFetcher,
	useLoaderData,
	useNavigate,
	useSearchParams,
} from '@remix-run/react'
import { ArrowLeft, Info } from 'lucide-react'
import { useCallback, useEffect, useState } from 'react'
import {
	StepDataSource,
	StepFields,
	StepFilters,
	StepOutput,
	StepPreview,
} from '~/components/custom-reports'
import { Alert, AlertDescription, AlertTitle } from '~/components/ui/alert'
import { Button } from '~/components/ui/button'
import { WizardContainer, WizardNavigation } from '~/components/wizard'
import { getTenantFilter, requireAdminAccess } from '~/utils/auth.server'
import {
	executeCustomReport,
	getReportPreview,
} from '~/utils/custom-report-query.server'
import type {
	CustomReportConfig,
	DataSourceType,
	ReportResult,
	WizardState,
} from '~/utils/custom-report-types'
import {
	canProceedToStep,
	DEFAULT_WIZARD_STATE,
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

export async function loader({ request }: LoaderFunctionArgs) {
	const user = await requireAdminAccess(request)

	// For global admins, fetch all tenants so they can select one
	const tenants = !user.tenantId
		? await prisma.tenant.findMany({
				select: { id: true, name: true },
				orderBy: { name: 'asc' },
			})
		: []

	return json({
		isGlobalAdmin: !user.tenantId,
		userTenantId: user.tenantId,
		tenants,
	})
}

export async function action({ request }: ActionFunctionArgs) {
	const user = await requireAdminAccess(request)
	const tenantFilter = getTenantFilter(user)
	const formData = await request.formData()
	const intent = formData.get('intent')

	if (intent === 'preview') {
		// Generate preview data
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
		// Save the report
		const name = formData.get('name')
		const description = formData.get('description')
		const isPublic = formData.get('isPublic') === 'true'
		const configJson = formData.get('config')
		const selectedTenantId = formData.get('tenantId')

		if (!name || typeof name !== 'string') {
			return json({ error: 'Report name is required' }, { status: 400 })
		}

		if (!configJson || typeof configJson !== 'string') {
			return json({ error: 'Invalid configuration' }, { status: 400 })
		}

		// Determine tenantId - use user's tenant or the selected one for global admins
		const tenantId = user.tenantId || (selectedTenantId as string)

		if (!tenantId) {
			return json(
				{ error: 'Please select a tenant for this report' },
				{ status: 400 },
			)
		}

		try {
			const config = JSON.parse(configJson) as CustomReportConfig

			// Check for duplicate name
			const existing = await prisma.customReport.findFirst({
				where: {
					tenantId,
					name,
				},
			})

			if (existing) {
				return json(
					{ error: 'A report with this name already exists' },
					{ status: 400 },
				)
			}

			const report = await prisma.customReport.create({
				data: {
					name,
					description: description as string | undefined,
					dataSource: config.dataSource,
					config: JSON.parse(JSON.stringify(config)) as Prisma.InputJsonValue,
					isPublic,
					tenantId,
					createdById: user.id,
				},
			})

			return redirect(`/admin/reports/custom/${report.id}`)
		} catch (error) {
			return json(
				{ error: error instanceof Error ? error.message : 'Save failed' },
				{ status: 400 },
			)
		}
	}

	return json({ error: 'Invalid action' }, { status: 400 })
}

export default function NewCustomReportRoute() {
	const { isGlobalAdmin, tenants } = useLoaderData<typeof loader>()
	const navigate = useNavigate()
	const [searchParams, setSearchParams] = useSearchParams()
	const fetcher = useFetcher<{ preview?: ReportResult; error?: string }>()

	// Get current step from URL or default to 1
	const currentStep = parseInt(searchParams.get('step') || '1', 10)

	// Wizard state (stored in React state, could use sessionStorage for persistence)
	const [wizardState, setWizardState] = useState<WizardState>({
		...DEFAULT_WIZARD_STATE,
		step: currentStep,
	})

	// For global admins, track selected tenant
	const [selectedTenantId, setSelectedTenantId] = useState<string>(
		tenants.length > 0 ? tenants[0].id : '',
	)

	// Preview data
	const previewData = fetcher.data?.preview
	const previewError = fetcher.data?.error
	const isLoadingPreview = fetcher.state !== 'idle'

	// Update URL when step changes
	const setStep = useCallback(
		(step: number) => {
			if (canProceedToStep(wizardState, step)) {
				setSearchParams({ step: step.toString() })
				setWizardState((prev) => ({ ...prev, step }))
			}
		},
		[wizardState, setSearchParams],
	)

	// Fetch preview when reaching step 5
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
	}, [currentStep, wizardState.dataSource])

	// Handlers
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
		navigate('/admin/reports/custom')
	}

	const handleSave = () => {
		if (!isStep5Complete(wizardState)) return

		// For global admins, ensure a tenant is selected
		if (isGlobalAdmin && !selectedTenantId) {
			return
		}

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
				...(isGlobalAdmin && { tenantId: selectedTenantId }),
			},
			{ method: 'POST' },
		)
	}

	// Determine if user can proceed
	const canProceed = (() => {
		switch (currentStep) {
			case 1:
				return isStep1Complete(wizardState)
			case 2:
				return isStep2Complete(wizardState)
			case 3:
				return true // Filters are optional
			case 4:
				return true // Sorting is optional
			case 5:
				return isStep5Complete(wizardState)
			default:
				return false
		}
	})()

	return (
		<div className="space-y-6">
			<Alert variant="muted">
				<Info className="h-4 w-4" />
				<div className="flex items-start justify-between">
					<div>
						<AlertTitle className="text-lg">Create Custom Report</AlertTitle>
						<AlertDescription>
							Build a custom report by selecting a data source, choosing fields,
							adding filters, and configuring the output. Use the wizard to
							create reports tailored to your specific needs.
						</AlertDescription>
					</div>
					<div className="flex items-center gap-2">
						<Button asChild variant="outline" size="sm">
							<Link to="/admin/reports/custom">
								<ArrowLeft className="mr-2 h-4 w-4" />
								Back
							</Link>
						</Button>
					</div>
				</div>
			</Alert>

			<WizardContainer steps={WIZARD_STEPS} currentStep={currentStep}>
				{currentStep === 1 && (
					<StepDataSource
						selectedDataSource={wizardState.dataSource}
						onSelect={(dataSource) =>
							setWizardState((prev) => ({
								...prev,
								dataSource,
								// Reset dependent fields when data source changes
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
						isGlobalAdmin={isGlobalAdmin}
						tenants={tenants}
						selectedTenantId={selectedTenantId}
						onTenantChange={setSelectedTenantId}
					/>
				)}

				<WizardNavigation
					currentStep={currentStep}
					totalSteps={5}
					canProceed={canProceed}
					onBack={handleBack}
					onNext={handleNext}
					onSave={handleSave}
					isSubmitting={fetcher.state !== 'idle'}
				/>
			</WizardContainer>
		</div>
	)
}
