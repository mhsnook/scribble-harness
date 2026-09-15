import type { OutlineNode, Plan } from './schema'

/**
 * One Voice active at a time, cascading with optional Outline-node overrides.
 * Adjectives cascade and combine.
 */

/** What one Scope states. Taken from the Section so the House, the Article,
 * and a node cannot drift apart as terms are added. */
export type ScopeTerms = Pick<OutlineNode, 'voice' | 'adjectives'>

/** What applies at a point in the Plan. The Voice is null when no Scope states
 * one, and the Adjectives run House first and nearest last. */
export type ResolvedScope = {
	voice: string | null
	adjectives: string[]
}

/** Resolve a chain of Scopes given widest first. An Adjective stated at two
 * Scopes appears once, in the nearest position: restating a term is emphasis,
 * and order is the only locality the Guide reads from the list. */
export function resolveScope(chain: readonly ScopeTerms[]): ResolvedScope {
	let voice: string | null = null
	const adjectives: string[] = []

	for (const terms of chain) {
		if (terms.voice !== undefined) voice = terms.voice
		for (const adjective of terms.adjectives ?? []) {
			const stated = adjectives.indexOf(adjective)
			if (stated !== -1) adjectives.splice(stated, 1)
			adjectives.push(adjective)
		}
	}

	return { voice, adjectives }
}

/** What applies to the Article as a whole: House, then the Plan's own terms. */
export function resolveArticleScope(plan: Plan, house: ScopeTerms = {}): ResolvedScope {
	return resolveScope([house, plan])
}

/** What applies at one Section: House, the Article, then every ancestor
 * from the outermost down to the node itself. Returns null when the Plan
 * carries no node with that id. */
export function resolveNodeScope(
	plan: Plan,
	nodeId: string,
	house: ScopeTerms = {},
): ResolvedScope | null {
	const path = findNodePath(plan.outline, nodeId)
	if (path === null) return null

	return resolveScope([house, plan, ...path])
}

/** The chain of Sections from the outermost down to `nodeId`, or null when
 * no node carries that id. The node itself is the last element. */
export function findNodePath(
	outline: readonly OutlineNode[],
	nodeId: string,
): OutlineNode[] | null {
	for (const node of outline) {
		if (node.id === nodeId) return [node]

		const deeper = findNodePath(node.children, nodeId)
		if (deeper !== null) return [node, ...deeper]
	}

	return null
}

/**
 * Whether a Section carries nothing: no title, no length, no note, no Tone,
 * nothing inside it, and no Reference placed at it.
 *
 * Reads the node's own fields rather than a list of names, so a field added to
 * `outlineNodeSchema` later counts here without being named.
 */
export function sectionIsEmpty(plan: Plan, nodeId: string): boolean {
	const path = findNodePath(plan.outline, nodeId)
	if (path === null) return false

	const bare = Object.entries(path[path.length - 1]!).every(([field, value]) => {
		if (field === 'id') return true
		if (field === 'title') return value === ''
		if (field === 'children') return (value as OutlineNode[]).length === 0

		return value === undefined
	})

	return bare && !plan.references.some((reference) => reference.nodeId === nodeId)
}
