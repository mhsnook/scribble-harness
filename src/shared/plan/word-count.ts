import type { OutlineNode, Plan } from './schema'

/**
 * Word-count arithmetic. The total is stored and nothing derives it, so the
 * parts are allowed to disagree with the whole and the gap is information.
 */

/**
 * - `unstated` — no total is stated, so there is nothing to compare against.
 * - `balanced` — the targets meet the total exactly.
 * - `unallocated` — the targets fall short and some node carries no target.
 * - `under` — the targets fall short and every node carries one.
 * - `over` — the targets exceed the total.
 */
export type AllocationStatus = 'unstated' | 'balanced' | 'unallocated' | 'under' | 'over'

export type Allocation = {
	/** The stored target: the Article's `totalTarget`, or the node's `target`. */
	total: number | null
	/** The sum of the targets below it. */
	allocated: number
	/** How many nodes sit at this level, and not below it: the Sections under
	 * the Article, or the Subsections under one Section. */
	parts: number
	/** How many of those parts put something into `allocated`. */
	placed: number
	/** How many nodes below it carry no target and no children to carry one. */
	untargeted: number
	/** `total - allocated`, and null when no total is stated. Positive is words
	 * still to place; negative is words over. */
	gap: number | null
	status: AllocationStatus
}

/** The Article's total against the targets in its Outline. */
export function planAllocation(plan: Plan): Allocation {
	return allocate(plan.totalTarget, plan.outline)
}

/** One node's target against the targets of its children. A leaf node has
 * nothing below it, so its whole target reads as unallocated — ask this where
 * children exist. */
export function nodeAllocation(node: OutlineNode): Allocation {
	return allocate(node.target ?? null, node.children)
}

function allocate(total: number | null, nodes: readonly OutlineNode[]): Allocation {
	const { allocated, untargeted } = sumTargets(nodes)
	const gap = total === null ? null : total - allocated

	return {
		total,
		allocated,
		parts: nodes.length,
		placed: nodes.filter(carriesShare).length,
		untargeted,
		gap,
		status: gap === null ? 'unstated' : statusFor(gap, untargeted, nodes),
	}
}

/** Whether a node put anything into the sum: its own target, or one anywhere
 * below it. */
function carriesShare(node: OutlineNode): boolean {
	return node.target !== undefined || node.children.some(carriesShare)
}

function statusFor(
	gap: number,
	untargeted: number,
	nodes: readonly OutlineNode[],
): AllocationStatus {
	if (gap === 0) return 'balanced'
	if (gap < 0) return 'over'

	// Nothing below yet reads the same as some node carrying no target, because the
	// words are not placed, rather than deliberately short of the total.
	return untargeted > 0 || nodes.length === 0 ? 'unallocated' : 'under'
}

/**
 * A node's target covers its subtree, so the walk stops at the outermost node
 * carrying one — counting a parent and its children both would double the same
 * words. `untargeted` counts the leaves the walk reaches without meeting a
 * target, which is what separates "not allocated yet" from "deliberately under".
 */
function sumTargets(nodes: readonly OutlineNode[]): {
	allocated: number
	untargeted: number
} {
	let allocated = 0
	let untargeted = 0

	for (const node of nodes) {
		if (node.target !== undefined) {
			allocated += node.target
			continue
		}
		if (node.children.length === 0) {
			untargeted += 1
			continue
		}

		const below = sumTargets(node.children)
		allocated += below.allocated
		untargeted += below.untargeted
	}

	return { allocated, untargeted }
}
