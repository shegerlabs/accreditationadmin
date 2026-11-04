import dagre from 'dagre'
import { useMemo } from 'react'
import { Node, Edge } from '@xyflow/react'

interface LayoutOptions {
	direction: 'TB' | 'LR' // Top-to-bottom or Left-to-right
	nodeWidth: number
	nodeHeight: number
	rankSep: number // Vertical spacing between ranks
	nodeSep: number // Horizontal spacing between nodes
}

const DEFAULT_OPTIONS: LayoutOptions = {
	direction: 'TB', // Top-to-bottom vertical layout
	nodeWidth: 280,
	nodeHeight: 100,
	rankSep: 80,
	nodeSep: 50,
}

export function getLayoutedElements(
	nodes: Node[],
	edges: Edge[],
	options: Partial<LayoutOptions> = {},
): { nodes: Node[]; edges: Edge[] } {
	const opts = { ...DEFAULT_OPTIONS, ...options }

	if (nodes.length === 0) {
		return { nodes: [], edges: [] }
	}

	const dagreGraph = new dagre.graphlib.Graph()
	dagreGraph.setDefaultEdgeLabel(() => ({}))
	dagreGraph.setGraph({
		rankdir: opts.direction,
		ranksep: opts.rankSep,
		nodesep: opts.nodeSep,
	})

	// Add nodes to dagre
	nodes.forEach(node => {
		dagreGraph.setNode(node.id, {
			width: opts.nodeWidth,
			height: opts.nodeHeight,
		})
	})

	// Add edges to dagre
	edges.forEach(edge => {
		dagreGraph.setEdge(edge.source, edge.target)
	})

	// Run layout
	dagre.layout(dagreGraph)

	// Apply calculated positions back to nodes
	const layoutedNodes = nodes.map(node => {
		const nodeWithPosition = dagreGraph.node(node.id)
		return {
			...node,
			position: {
				x: nodeWithPosition.x - opts.nodeWidth / 2,
				y: nodeWithPosition.y - opts.nodeHeight / 2,
			},
		}
	})

	return { nodes: layoutedNodes, edges }
}

export function useAutoLayout(
	nodes: Node[],
	edges: Edge[],
	options: Partial<LayoutOptions> = {},
): { nodes: Node[]; edges: Edge[] } {
	return useMemo(() => {
		return getLayoutedElements(nodes, edges, options)
	}, [nodes, edges, options])
}
