import { useCallback, useEffect, useMemo } from 'react'
import {
	ReactFlow,
	Background,
	Controls,
	Connection,
	Edge,
	Node,
	BackgroundVariant,
	NodeTypes,
	MarkerType,
	useNodesState,
	useEdgesState,
} from '@xyflow/react'
import '@xyflow/react/dist/style.css'
import { Action } from '@prisma/client'
import { useFetcher, useNavigate, useParams } from '@remix-run/react'
import type { SerializeFrom } from '@remix-run/node'

import { StepNode } from './step-node'
import { StepPalette } from './step-palette'
import { getLayoutedElements } from './use-auto-layout'
import { StepData, WorkflowData } from './types'

const nodeTypes: NodeTypes = {
	step: StepNode,
}

interface Step {
	id: string
	name: string
	action: Action
	order: number
	roleId: string
	nextStepId: string | null
	isRejectionTarget: boolean
	isBypassTarget: boolean
	positionX: number | null
	positionY: number | null
	role: { id: string; name: string }
}

interface WorkflowCanvasProps {
	steps: SerializeFrom<Step>[]
	workflow: SerializeFrom<WorkflowData>
}

export function WorkflowCanvas({
	steps,
	workflow,
}: WorkflowCanvasProps) {
	const { eventId, workflowId, tenantId, templateId } = useParams()
	const navigate = useNavigate()
	const connectFetcher = useFetcher()
	const positionFetcher = useFetcher()

	// Determine base URL based on context (workflow vs template)
	const isTemplate = !workflow.eventId
	const baseUrl = isTemplate
		? `/admin/tenants/${tenantId}/workflow-templates/${templateId}/steps`
		: `/admin/events/${eventId}/workflows/${workflowId}/steps`

	// Back URL goes to the parent list
	const backUrl = isTemplate
		? `/admin/tenants/${tenantId}/workflow-templates`
		: `/admin/events/${eventId}/workflows`

	// Convert steps to React Flow nodes and edges
	const initialElements = useMemo(() => {
		// Calculate max width based on longest step name
		// Base width for padding, icon, badge, etc. + character width estimate
		const baseWidth = 160 // padding, icon, badge, margins
		const charWidth = 8 // approximate width per character
		const minWidth = 250

		const maxNameLength = Math.max(...steps.map(s => s.name.length), 0)
		const calculatedWidth = baseWidth + (maxNameLength * charWidth)
		const nodeWidth = Math.max(minWidth, calculatedWidth)

		const nodes: Node[] = steps.map(step => ({
			id: step.id,
			type: 'step',
			position: { x: 0, y: 0 }, // Will be set by auto-layout or saved position
			data: {
				id: step.id,
				name: step.name,
				action: step.action,
				order: step.order,
				roleId: step.roleId,
				roleName: step.role.name,
				nextStepId: step.nextStepId,
				workflowId: workflow.id,
				tenantId: workflow.tenantId,
				isRejectionTarget: step.isRejectionTarget,
				isBypassTarget: step.isBypassTarget,
				nodeWidth, // Pass calculated width to all nodes
				baseUrl, // Pass baseUrl for edit navigation
			} as StepData,
		}))

		// All edges come from nextStepId connections
		// REJECT/BYPASS nodes now have nextStepId set to their targets
		const edges: Edge[] = steps
			.filter(step => step.nextStepId)
			.map(step => {
				// Style rejection edges differently (red, dashed)
				const isRejectionEdge = step.action === 'REJECT'
				// Style bypass edges differently (yellow, dashed)
				const isBypassEdge = step.action === 'BYPASS'

				return {
					id: `${step.id}-${step.nextStepId}`,
					source: step.id,
					target: step.nextStepId!,
					type: 'default',
					animated: !isRejectionEdge && !isBypassEdge,
					selectable: true,
					focusable: true,
					interactionWidth: 15,
					style: {
						strokeWidth: 2,
						...(isRejectionEdge && { stroke: '#ef4444', strokeDasharray: '5,5' }),
						...(isBypassEdge && { stroke: '#eab308', strokeDasharray: '5,5' }),
					},
					markerEnd: {
						type: MarkerType.ArrowClosed,
						width: 12,
						height: 12,
						...(isRejectionEdge && { color: '#ef4444' }),
						...(isBypassEdge && { color: '#eab308' }),
					},
				}
			})

		// First apply auto-layout to get base positions (use calculated nodeWidth for proper spacing)
		const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(nodes, edges, { nodeWidth })

		// Then override with saved positions where available
		const finalNodes = layoutedNodes.map(node => {
			const step = steps.find(s => s.id === node.id)
			if (step && step.positionX !== null && step.positionY !== null) {
				return {
					...node,
					position: { x: step.positionX, y: step.positionY },
				}
			}
			return node
		})

		return { nodes: finalNodes, edges: layoutedEdges }
	}, [steps, workflow.id, workflow.tenantId])

	const [nodes, setNodes, onNodesChange] = useNodesState(initialElements.nodes)
	const [edges, setEdges, onEdgesChange] = useEdgesState(initialElements.edges)

	// Sync nodes/edges when loader data changes
	useEffect(() => {
		setNodes(initialElements.nodes)
		setEdges(initialElements.edges)
	}, [initialElements, setNodes, setEdges])

	// Save position when node drag ends
	const onNodeDragStop = useCallback(
		(_: React.MouseEvent, node: Node) => {
			positionFetcher.submit(
				{
					intent: 'updatePosition',
					sourceStepId: node.id,
					positionX: node.position.x.toString(),
					positionY: node.position.y.toString(),
				},
				{
					method: 'POST',
					action: `${baseUrl}/connect`,
				},
			)
		},
		[positionFetcher, baseUrl],
	)

	// Reset all positions to auto-layout
	const onResetLayout = useCallback(() => {
		positionFetcher.submit(
			{ intent: 'resetLayout' },
			{
				method: 'POST',
				action: `${baseUrl}/connect`,
			},
		)
	}, [positionFetcher, baseUrl])

	// Handle new connection between nodes
	const onConnect = useCallback(
		(connection: Connection) => {
			if (!connection.source || !connection.target) return

			// Check if source already has an outgoing edge
			const existingEdge = edges.find(e => e.source === connection.source)
			if (existingEdge) {
				// Remove existing edge first (disconnect)
				connectFetcher.submit(
					{
						intent: 'disconnect',
						sourceStepId: connection.source,
					},
					{
						method: 'POST',
						action: `${baseUrl}/connect`,
					},
				)
			}

			// Submit new connection - Remix will revalidate and update the UI
			connectFetcher.submit(
				{
					intent: 'connect',
					sourceStepId: connection.source,
					targetStepId: connection.target,
				},
				{
					method: 'POST',
					action: `${baseUrl}/connect`,
				},
			)
		},
		[edges, connectFetcher, baseUrl],
	)

	// Handle edge deletion
	const onEdgesDelete = useCallback(
		(deletedEdges: Edge[]) => {
			deletedEdges.forEach(edge => {
				connectFetcher.submit(
					{
						intent: 'disconnect',
						sourceStepId: edge.source,
					},
					{
						method: 'POST',
						action: `${baseUrl}/connect`,
					},
				)
			})
		},
		[connectFetcher, baseUrl],
	)

	// Handle drop from palette - navigate to new step route with action param
	const onDragOver = useCallback((event: React.DragEvent) => {
		event.preventDefault()
		event.dataTransfer.dropEffect = 'copy'
	}, [])

	const onDrop = useCallback(
		(event: React.DragEvent) => {
			event.preventDefault()

			const action = event.dataTransfer.getData(
				'application/workflow-step',
			) as Action
			if (!action) return

			// Open the form for the dropped action
			navigate(`${baseUrl}/visual/new?action=${action}`)
		},
		[navigate, baseUrl],
	)

	// Handle node click - select the node (edit via button on node)
	const onNodeClick = useCallback(
		(_: React.MouseEvent, node: Node) => {
			// Deselect all edges
			setEdges(eds =>
				eds.map(e => ({
					...e,
					selected: false,
					style: { ...e.style, strokeWidth: 2 },
				})),
			)
			// Select only the clicked node
			setNodes(nds =>
				nds.map(n => ({
					...n,
					selected: n.id === node.id,
				})),
			)
		},
		[setNodes, setEdges],
	)

	// Handle edge click - select the edge for deletion
	const onEdgeClick = useCallback(
		(_: React.MouseEvent, edge: Edge) => {
			// Deselect all nodes first
			setNodes(nds => nds.map(n => ({ ...n, selected: false })))
			// Toggle edge selection and update visual style
			setEdges(eds =>
				eds.map(e => {
					const isSelected = e.id === edge.id
					const baseStrokeWidth = 2
					const selectedStrokeWidth = 5
					return {
						...e,
						selected: isSelected,
						style: {
							...e.style,
							strokeWidth: isSelected ? selectedStrokeWidth : baseStrokeWidth,
						},
					}
				}),
			)
		},
		[setEdges, setNodes],
	)

	const onAddStep = useCallback(() => {
		navigate(`${baseUrl}/visual/new?action=APPROVE`)
	}, [navigate, baseUrl])

	// Handle pane click - deselect all elements
	const onPaneClick = useCallback(() => {
		setNodes(nds => nds.map(n => ({ ...n, selected: false })))
		setEdges(eds =>
			eds.map(e => ({
				...e,
				selected: false,
				style: {
					...e.style,
					strokeWidth: 2,
				},
			})),
		)
	}, [setNodes, setEdges])

	return (
		<div className="flex h-[600px] flex-col rounded-lg border bg-background">
			{/* Palette - horizontal bar on top with action buttons */}
			<StepPalette onResetLayout={onResetLayout} onAddStep={onAddStep} backUrl={backUrl} />

			{/* Canvas */}
			<div className="flex-1">
				<ReactFlow
					nodes={nodes}
					edges={edges}
					onNodesChange={onNodesChange}
					onEdgesChange={onEdgesChange}
					onConnect={onConnect}
					onEdgesDelete={onEdgesDelete}
					onNodeDragStop={onNodeDragStop}
					onNodeClick={onNodeClick}
					onEdgeClick={onEdgeClick}
					onPaneClick={onPaneClick}
					onDragOver={onDragOver}
					onDrop={onDrop}
					nodeTypes={nodeTypes}
					defaultViewport={{ x: 50, y: 20, zoom: 0.9 }}
					minZoom={0.5}
					maxZoom={1.5}
					deleteKeyCode={['Backspace', 'Delete']}
					nodesConnectable={true}
					elementsSelectable={true}
					edgesFocusable={true}
					selectNodesOnDrag={false}
					selectionOnDrag={false}
					className="bg-muted/20"
				>
					<Background variant={BackgroundVariant.Dots} gap={20} size={1} />
					<Controls />
				</ReactFlow>
			</div>
		</div>
	)
}
