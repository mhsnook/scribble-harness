import type { OutlineNode, Plan, Reference } from '../../shared/plan'
import { outlineEntries } from './outline'
import { referenceEntries, referenceName } from './references'

/**
 * Where each box sits when the Plan opens left to right, and the curve joining
 * it to its parent. Arithmetic only, so `test/client/plan-map.test.ts` drives
 * it with a Plan and reads the numbers back.
 *
 * `branches: 'references'` draws the Article title, one layer of Sections, and
 * the References placed at each — what the app draws today.
 * `branches: 'sections'` draws the Sections nested inside a Section instead,
 * however deep the Plan goes. The schema holds that nesting and no screen
 * offers it — `context.md` §Subsection says why.
 */

/** What one box stands for. */
export type MapSubject =
	| { kind: 'article' }
	| { kind: 'section'; node: OutlineNode }
	| { kind: 'reference'; reference: Reference; number: number }

/** One box on the map. */
export interface MapNode {
	/** `root`, `n:` and a Section's id, or `r:` and a Reference's id, so ids
	 * that collide across the two lists cannot collide here. */
	key: string
	parentKey: string | null
	subject: MapSubject
	title: string
	/** "2" for a Section, "2.1" for a nested one, "[3]" for a Reference. */
	ordinal: string
	depth: number
	x: number
	y: number
	width: number
	height: number
	/** Children the box holds, drawn or not — a folded box still counts them. */
	childCount: number
	/** Empty under `branches: 'references'`, where each is its own box. */
	referenceNumbers: number[]
	collapsed: boolean
	/** Every key from the parent up to the root, nearest first. */
	ancestors: string[]
}

/** One curve, joining a parent's right edge to a child's left edge. */
export interface MapLink {
	parentKey: string
	childKey: string
	/** The `d` of the SVG path. */
	d: string
}

export interface PlanMap {
	nodes: MapNode[]
	links: MapLink[]
	width: number
	height: number
}

export type MapBranches = 'references' | 'sections'

export interface MapOptions {
	nodeWidth?: number
	columnGap?: number
	rowGap?: number
	/** A function, because what a box carries decides how many lines it needs. */
	heightOf?: (box: Measured) => number
	/** Sections whose children the map is leaving undrawn. */
	collapsed?: ReadonlySet<string>
	branches?: MapBranches
}

export type Measured = Pick<MapNode, 'subject' | 'depth' | 'referenceNumbers'>

/** Room for the ordinal and a two-line title, plus a line each for an intent
 * note and for the References placed at the Section. */
function defaultHeight({ subject, referenceNumbers }: Measured): number {
	if (subject.kind === 'article') return 48
	if (subject.kind === 'reference') return 44

	return (
		48 +
		(subject.node.intent === undefined ? 0 : 18) +
		(referenceNumbers.length === 0 ? 0 : 16)
	)
}

/** Out of the parent's right edge, into the child's left edge, turning at the
 * midpoint between the columns — the cubic `curveBumpX` generates. */
export function linkPath(parent: MapNode, child: MapNode): string {
	const sx = parent.x + parent.width
	const sy = parent.y + parent.height / 2
	const tx = child.x
	const ty = child.y + child.height / 2
	const mx = (sx + tx) / 2

	return `M${sx},${sy}C${mx},${sy} ${mx},${ty} ${tx},${ty}`
}

/** The Plan's id for what a box stands for, or null at the root. */
export function subjectId(subject: MapSubject): string | null {
	if (subject.kind === 'article') return null

	return subject.kind === 'section' ? subject.node.id : subject.reference.id
}

/**
 * Lays the Plan out left to right. Leaves stack down the page in reading order
 * and a parent centres on its children; where centring would ride a parent up
 * into the box above it, the parent takes the floor and its subtree moves down
 * with it.
 */
export function planMap(plan: Plan, options: MapOptions = {}): PlanMap {
	const {
		nodeWidth = 210,
		columnGap = 40,
		rowGap = 10,
		heightOf = defaultHeight,
		collapsed = new Set<string>(),
		branches = 'references',
	} = options

	const nodes: MapNode[] = []

	// Numbered off the one list, so a box and `references.ts` mark a Reference
	// the same way.
	const placed = new Map<string, { reference: Reference; number: number }[]>()
	for (const entry of referenceEntries(plan)) {
		const nodeId = entry.reference.nodeId
		if (nodeId === null) continue
		const held = placed.get(nodeId)
		if (held === undefined) placed.set(nodeId, [entry])
		else held.push(entry)
	}

	// Numbered off the walk the Panel reads, not counted again here —
	// `docs/plan.md`.
	const ordinals = new Map(
		outlineEntries(plan.outline).map((entry) => [entry.node.id, entry.ordinal]),
	)

	/** Where the next leaf goes, counting down the page in reading order. */
	let cursor = 0
	/** The bottom edge each column has reached. */
	const floors: number[] = []

	const childrenOf = (subject: MapSubject): MapSubject[] => {
		if (subject.kind === 'reference') return []
		if (subject.kind === 'article') {
			return plan.outline.map((node) => ({ kind: 'section', node }) as const)
		}

		if (branches === 'sections') {
			return subject.node.children.map((node) => ({ kind: 'section', node }) as const)
		}

		return (placed.get(subject.node.id) ?? []).map(
			(entry) => ({ kind: 'reference', ...entry }) as const,
		)
	}

	const place = (
		subject: MapSubject,
		depth: number,
		parentKey: string | null,
		ancestors: string[],
	): MapNode => {
		const id = subjectId(subject)
		const key =
			subject.kind === 'article'
				? 'root'
				: `${subject.kind === 'section' ? 'n' : 'r'}:${id}`

		// Only where the References are not boxes of their own.
		const referenceNumbers =
			subject.kind === 'section' && branches === 'sections'
				? (placed.get(subject.node.id) ?? []).map((entry) => entry.number)
				: []

		const held = childrenOf(subject)
		const isCollapsed = id !== null && collapsed.has(id)
		const height = heightOf({ subject, depth, referenceNumbers })

		const entry: MapNode = {
			key,
			parentKey,
			subject,
			title: titleOf(subject, plan),
			ordinal: ordinalOf(subject, ordinals),
			depth,
			x: depth * (nodeWidth + columnGap),
			y: 0,
			width: nodeWidth,
			height,
			childCount: held.length,
			referenceNumbers,
			collapsed: isCollapsed,
			ancestors,
		}

		// Pushed before its children, so a subtree occupies one run of the array
		// and shifting it is a slice.
		const start = nodes.length
		nodes.push(entry)

		const drawn = isCollapsed ? [] : held
		const laid = drawn.map((child) => place(child, depth + 1, key, [key, ...ancestors]))

		const floor = floors[depth] ?? 0

		if (laid.length === 0) {
			entry.y = Math.max(cursor, floor)
		} else {
			const first = laid[0]!
			const last = laid[laid.length - 1]!
			entry.y = (first.y + last.y + last.height - height) / 2

			if (entry.y < floor) {
				const by = floor - entry.y
				entry.y = floor
				for (let i = start + 1; i < nodes.length; i += 1) nodes[i]!.y += by
				cursor += by
			}
		}

		cursor = Math.max(cursor, entry.y + height + rowGap)
		floors[depth] = entry.y + height + rowGap

		return entry
	}

	place({ kind: 'article' }, 0, null, [])

	const byKey = new Map(nodes.map((entry) => [entry.key, entry]))
	const links: MapLink[] = []

	for (const child of nodes) {
		if (child.parentKey === null) continue
		const parent = byKey.get(child.parentKey)
		if (parent === undefined) continue

		links.push({ parentKey: parent.key, childKey: child.key, d: linkPath(parent, child) })
	}

	const width = Math.max(...nodes.map((entry) => entry.x + entry.width))
	const height = Math.max(...nodes.map((entry) => entry.y + entry.height))

	return { nodes, links, width, height }
}

/** A Reference keeps its number in the Plan's list, the way a footnote does. */
function ordinalOf(subject: MapSubject, ordinals: Map<string, string>): string {
	if (subject.kind === 'article') return ''
	if (subject.kind === 'reference') return `[${subject.number}]`

	return ordinals.get(subject.node.id) ?? ''
}

/** Named through `referenceName`, so the map and the References list agree. */
function titleOf(subject: MapSubject, plan: Plan): string {
	if (subject.kind === 'article') return plan.title
	if (subject.kind === 'section') return subject.node.title

	return referenceName(subject.reference)
}
