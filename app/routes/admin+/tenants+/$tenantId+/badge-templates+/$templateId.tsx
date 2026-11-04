import { getFormProps, useForm } from '@conform-to/react'
import { parseWithZod } from '@conform-to/zod'
import { ActionFunctionArgs, LoaderFunctionArgs, json } from '@remix-run/node'
import {
	Form,
	Link,
	useActionData,
	useLoaderData,
	useNavigation,
} from '@remix-run/react'
import { ArrowLeft, Eye, Pencil } from 'lucide-react'
import { useCallback, useState } from 'react'
import { AuthenticityTokenInput } from 'remix-utils/csrf/react'
import { HoneypotInputs } from 'remix-utils/honeypot/react'
import { z } from 'zod'
import {
	dbTemplateToConfig,
	DynamicBadge,
	ParticipantBadgeData,
} from '~/components/badge-designer'
import { PropertyPanel } from '~/components/badge-designer/property-panel'
import { BadgeElement, SAMPLE_PARTICIPANT } from '~/components/badge-designer/types'
import { VisualDesigner } from '~/components/badge-designer/visual-designer'
import { Button } from '~/components/ui/button'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '~/components/ui/tabs'
import { requireUserWithRoles } from '~/utils/auth.server'
import { validateCSRF } from '~/utils/csrf.server'
import { prisma } from '~/utils/db.server'
import { checkHoneypot } from '~/utils/honeypot.server'
import { invariantResponse, useIsPending } from '~/utils/misc'
import { redirectWithToast } from '~/utils/toast.server'

const UpdateElementsSchema = z.object({
	elements: z.string(),
})

export async function loader({ params, request }: LoaderFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { templateId } = params

	const template = await prisma.badgeTemplate.findUnique({
		where: { id: templateId },
		select: {
			id: true,
			name: true,
			description: true,
			width: true,
			height: true,
			borderWidth: true,
			borderColor: true,
			borderRadius: true,
			badgeIdPrefix: true,
			elements: true,
		},
	})

	invariantResponse(template, 'Not Found', { status: 404 })

	return json({ template })
}

export async function action({ request, params }: ActionFunctionArgs) {
	await requireUserWithRoles(request, ['admin', 'tenant'])

	const { tenantId, templateId } = params

	const formData = await request.formData()
	checkHoneypot(formData)
	await validateCSRF(formData, request.headers)

	const submission = await parseWithZod(formData, {
		schema: UpdateElementsSchema,
		async: true,
	})

	if (submission.status !== 'success') {
		return json(
			{ result: submission.reply() },
			{ status: submission.status === 'error' ? 400 : 200 },
		)
	}

	const { elements } = submission.value

	// Validate elements JSON
	let parsedElements: BadgeElement[]
	try {
		parsedElements = JSON.parse(elements)
	} catch {
		return json(
			{
				result: submission.reply({
					formErrors: ['Invalid elements JSON'],
				}),
			},
			{ status: 400 },
		)
	}

	await prisma.badgeTemplate.update({
		where: { id: templateId },
		data: {
			elements: parsedElements as unknown as any,
		},
	})

	return redirectWithToast(`/admin/tenants/${tenantId}/badge-templates`, {
		type: 'success',
		title: 'Template Updated',
		description: 'Badge template saved successfully.',
	})
}

export default function BadgeTemplateDesignerRoute() {
	const { template } = useLoaderData<typeof loader>()
	const actionData = useActionData<typeof action>()
	const navigation = useNavigation()
	const isPending = useIsPending()
	const isSubmitting = navigation.state === 'submitting'

	// Parse elements from JSON
	const initialElements =
		(template.elements as unknown as BadgeElement[]) || []
	const [elements, setElements] = useState<BadgeElement[]>(initialElements)
	const [selectedElementIds, setSelectedElementIds] = useState<string[]>([])

	// For property panel, only show when single element selected
	const selectedElement = selectedElementIds.length === 1
		? elements.find(el => el.id === selectedElementIds[0])
		: null

	const [form] = useForm({
		id: 'badge-template-elements',
		lastResult: actionData?.result,
	})

	// Update element helper (for property panel - single element)
	const updateElement = useCallback(
		(updates: Partial<BadgeElement>) => {
			if (selectedElementIds.length !== 1) return
			const selectedId = selectedElementIds[0]
			setElements(prev =>
				prev.map(el =>
					el.id === selectedId
						? ({ ...el, ...updates } as BadgeElement)
						: el,
				),
			)
		},
		[selectedElementIds],
	)

	return (
		<div className="flex h-[calc(100vh-10rem)] flex-col gap-2">
			{/* Hidden form - submit triggered from VisualDesigner */}
			<Form method="POST" {...getFormProps(form)} id="badge-elements-form" className="hidden">
				<AuthenticityTokenInput />
				<HoneypotInputs />
				<input
					type="hidden"
					name="elements"
					value={JSON.stringify(elements)}
				/>
			</Form>

			{/* Main Content */}
			<div className="flex flex-1 gap-2 overflow-hidden">
				{/* Canvas Area with Tabs */}
				<div className="flex-1 overflow-hidden rounded-lg border bg-card">
					<Tabs defaultValue="design" className="flex h-full flex-col">
						<div className="flex items-center justify-between border-b px-2">
							<TabsList className="h-9">
								<TabsTrigger value="design" className="gap-1.5 text-xs">
									<Pencil className="h-3 w-3" />
									Design
								</TabsTrigger>
								<TabsTrigger value="preview" className="gap-1.5 text-xs">
									<Eye className="h-3 w-3" />
									Preview
								</TabsTrigger>
							</TabsList>
							<div className="flex items-center gap-2">
								<h1 className="text-sm font-medium">
									{template.name}{' '}
									<span className="text-muted-foreground">
										({template.width} x {template.height} pt)
									</span>
								</h1>
								<Button
									type="button"
									variant="outline"
									size="sm"
									className="h-7 gap-1.5"
									asChild
								>
									<Link to="..">
										<ArrowLeft className="h-3 w-3" />
										Back
									</Link>
								</Button>
							</div>
						</div>
						<TabsContent value="design" className="flex-1 overflow-auto m-0">
							<VisualDesigner
								width={template.width}
								height={template.height}
								borderWidth={template.borderWidth}
								borderColor={template.borderColor}
								borderRadius={template.borderRadius}
								elements={elements}
								onChange={setElements}
								badgeIdPrefix={template.badgeIdPrefix}
								selectedElementIds={selectedElementIds}
								onSelectElements={setSelectedElementIds}
								formId="badge-elements-form"
								isSaving={isPending || isSubmitting}
								saveStatus={isPending ? 'pending' : form.status ?? 'idle'}
							/>
						</TabsContent>
						<TabsContent value="preview" className="flex-1 overflow-auto m-0 p-4">
							<DynamicBadge
								template={dbTemplateToConfig({
									width: template.width,
									height: template.height,
									borderWidth: template.borderWidth,
									borderColor: template.borderColor,
									borderRadius: template.borderRadius,
									badgeIdPrefix: template.badgeIdPrefix,
									elements: elements,
								})}
								participant={{
									...SAMPLE_PARTICIPANT,
									badgeId: `${template.badgeIdPrefix}-001`,
								} as ParticipantBadgeData}
							/>
						</TabsContent>
					</Tabs>
				</div>

				{/* Property Panel */}
				<div className="w-80 overflow-auto rounded-lg border bg-card">
					<PropertyPanel element={selectedElement ?? null} onChange={updateElement} />
				</div>
			</div>
		</div>
	)
}
