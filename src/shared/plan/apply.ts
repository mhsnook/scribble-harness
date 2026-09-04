import type { z } from 'zod'

import type { Anchor, OpName, ProposalOp } from './ops'
import { proposalSchema } from './ops'
import type { OutlineNode, Plan } from './schema'
import { planSchema, referenceContent } from './schema'

/**
 * The client-side applier, working on a copy so that the first op to refuse
 * throws the whole Proposal away. What the ops mean is `docs/architecture.md`
 * `docs/plan.md`, and the vocabulary is ops.ts.
 */

/**
 * - `malformed` — the ops do not match the vocabulary in ops.ts.
 * - `missing` — an op names a node, a Reference, or an anchor the Plan does not
 *   carry.
 * - `stale` — an `expected` names a value the Plan no longer carries.
 * - `invalid` — the ops resolve, but applying them would leave something that is
 *   not a Plan.
 */
export type RefusalType = 'malformed' | 'missing' | 'stale' | 'invalid'

/**
 * Which check failed, as a code a caller can word for itself where
 * `RefusalType`'s four kinds are too coarse to build a sentence from. Closed, so
 * a new refusal site stops `refusalText.ts` compiling until it is worded.
 */
export type RefusalReason =
	| 'unreadable'
	| 'noSection'
	| 'noParent'
	| 'noAnchor'
	| 'noReference'
	| 'noPlan'
	| 'stale'
	| 'duplicateId'
	| 'moveUnderOwn'
	| 'mergeUnderOwn'
	| 'mergeWithItself'
	| 'anchorToItself'
	| 'wouldNotParse'

const kindOf: Record<RefusalReason, RefusalType> = {
	unreadable: 'malformed',
	noSection: 'missing',
	noParent: 'missing',
	noAnchor: 'missing',
	noReference: 'missing',
	noPlan: 'missing',
	stale: 'stale',
	duplicateId: 'invalid',
	moveUnderOwn: 'invalid',
	mergeUnderOwn: 'invalid',
	mergeWithItself: 'invalid',
	anchorToItself: 'invalid',
	wouldNotParse: 'invalid',
}

/** What a refusal is about, by the Plan's own id, so a caller can name it the
 * way the Outline and the References list do. */
export type RefusalSubject =
	| { of: 'article' }
	| { of: 'section'; id: string }
	| { of: 'reference'; id: string }

export type Refusal = {
	/** Derived from `reason`. */
	type: RefusalType
	reason: RefusalReason
	/** Which op refused, counting from 0, and null when the refusal is about the
	 * Proposal as a whole. */
	index: number | null
	/** Which op refused, and null when the malformed payload is what hid it. */
	op: OpName | null
	/** Null where the refusal is about no one record. */
	subject: RefusalSubject | null
	/** The second record a reason names — a merge target, the Section an anchor
	 * was sought in — and null for the reasons that name one. */
	other: RefusalSubject | null
	/** One sentence for the model, which a Declined Proposal sends back (`docs/plan.md`), so
	 * it names the op and the ids and may run long. The writer's sentence is
	 * built from the fields above, in `src/client/plan/refusalText.ts`. */
	message: string
	/** The value the op named against the value the Plan carries. Both are
	 * present on a stale field and absent otherwise. */
	expected?: unknown
	found?: unknown
}

const articleSubject: RefusalSubject = { of: 'article' }
const sectionSubject = (id: string): RefusalSubject => ({ of: 'section', id })
const referenceSubject = (id: string): RefusalSubject => ({ of: 'reference', id })

/** A content op reads `nodeId: null` as the Article — `docs/plan.md`. */
const scopeSubject = (nodeId: string | null): RefusalSubject =>
	nodeId === null ? articleSubject : sectionSubject(nodeId)

/** What the model's sentence calls a record — the data model's own words, ids
 * included, because the model proposes in them. */
function nameFor(subject: RefusalSubject, reason: RefusalReason): string {
	if (subject.of === 'article') return 'the Article'
	if (subject.of === 'reference') return `Reference ${subject.id}`

	return reason === 'noParent' ? `parent ${subject.id}` : `node ${subject.id}`
}

/** The neighbour a structural op anchored to, and null where the anchor named
 * an end rather than a sibling. */
const anchorSubject = (op: Anchor): RefusalSubject | null => {
	const anchor = op.afterId ?? op.beforeId

	return anchor === undefined || anchor === null ? null : sectionSubject(anchor)
}

export type ApplyResult = { ok: true; plan: Plan } | { ok: false; refusal: Refusal }

/**
 * Apply a Proposal to a Plan, leaving the Plan passed in untouched. The Proposal
 * arrives from a tool call, so this parses it rather than trusting its type.
 */
export function applyProposal(plan: Plan, proposal: unknown): ApplyResult {
	const parsed = proposalSchema.safeParse(proposal)
	if (!parsed.success) return { ok: false, refusal: malformed(parsed.error) }

	const next = structuredClone(plan)

	for (const [index, op] of parsed.data.entries()) {
		const refusal = applyOp(next, op, index)
		if (refusal !== null) return { ok: false, refusal }
	}

	const checked = planSchema.safeParse(next)
	if (!checked.success) return { ok: false, refusal: invalidPlan(checked.error) }

	return { ok: true, plan: checked.data }
}

function applyOp(plan: Plan, op: ProposalOp, index: number): Refusal | null {
	const refuse = (
		reason: RefusalReason,
		subject: RefusalSubject | null,
		message: string,
		other: RefusalSubject | null = null,
	): Refusal => ({
		type: kindOf[reason],
		reason,
		index,
		op: op.op,
		subject,
		other,
		message,
	})

	const stale = (
		subject: RefusalSubject,
		expected: unknown,
		found: unknown,
	): Refusal => ({
		...refuse(
			'stale',
			subject,
			`${op.op} on ${nameFor(subject, 'stale')} expected ${JSON.stringify(expected)} and the Plan carries ${JSON.stringify(found)}.`,
		),
		expected,
		found,
	})

	const absent = (reason: RefusalReason, subject: RefusalSubject) =>
		refuse(
			reason,
			subject,
			`${op.op} names ${nameFor(subject, reason)}, which the Plan does not carry.`,
		)

	switch (op.op) {
		case 'createNode': {
			const siblings = childrenOf(plan, op.parentId)
			if (siblings === null) return absent('noParent', scopeSubject(op.parentId))

			const at = insertionIndex(siblings, op)
			if (at === null)
				return refuse(
					'noAnchor',
					anchorSubject(op),
					anchorMissing(op),
					scopeSubject(op.parentId),
				)

			// checkIds catches a repeated id at the final parse, but that refusal
			// cannot say which op carried it. Claiming them here is what does.
			const taken = new Set(plan.outline.flatMap(subtreeIds))
			for (const id of subtreeIds(op.node)) {
				if (taken.has(id)) {
					return refuse(
						'duplicateId',
						sectionSubject(id),
						`${op.op} would leave two Sections carrying the id ${id}.`,
					)
				}
				taken.add(id)
			}

			dropEmptyAdjectives(op.node)
			siblings.splice(at, 0, op.node)
			return null
		}

		case 'moveNode': {
			const site = locate(plan.outline, op.nodeId)
			if (site === null) return absent('noSection', sectionSubject(op.nodeId))

			const node = site.siblings[site.index]
			if (op.parentId !== null && subtreeIds(node).includes(op.parentId)) {
				return refuse(
					'moveUnderOwn',
					sectionSubject(op.nodeId),
					`${op.op} would move ${op.nodeId} under a node it contains.`,
					sectionSubject(op.parentId),
				)
			}
			// Caught here rather than as a missing anchor, which is what it becomes
			// once the node is out of the Outline, and which would say the Plan does
			// not carry a node it does.
			if (op.afterId === op.nodeId || op.beforeId === op.nodeId) {
				return refuse(
					'anchorToItself',
					sectionSubject(op.nodeId),
					`${op.op} cannot anchor ${op.nodeId} to itself.`,
				)
			}

			// The node comes out before the destination is known good. That is safe
			// only because a refusal discards this whole copy: a dry run, or applying
			// an op in place, would need every check above the splice.
			site.siblings.splice(site.index, 1)

			const siblings = childrenOf(plan, op.parentId)
			if (siblings === null) return absent('noParent', scopeSubject(op.parentId))

			const at = insertionIndex(siblings, op)
			if (at === null)
				return refuse(
					'noAnchor',
					anchorSubject(op),
					anchorMissing(op),
					scopeSubject(op.parentId),
				)

			siblings.splice(at, 0, node)
			return null
		}

		case 'mergeNodes': {
			if (op.nodeId === op.intoId) {
				return refuse(
					'mergeWithItself',
					sectionSubject(op.nodeId),
					`${op.op} names ${op.nodeId} on both sides.`,
				)
			}

			const site = locate(plan.outline, op.nodeId)
			if (site === null) return absent('noSection', sectionSubject(op.nodeId))
			const intoSite = locate(plan.outline, op.intoId)
			if (intoSite === null) return absent('noSection', sectionSubject(op.intoId))

			const node = site.siblings[site.index]
			const into = intoSite.siblings[intoSite.index]
			if (subtreeIds(node).includes(op.intoId)) {
				return refuse(
					'mergeUnderOwn',
					sectionSubject(op.nodeId),
					`${op.op} would merge ${op.nodeId} into ${op.intoId}, which it contains.`,
					sectionSubject(op.intoId),
				)
			}

			site.siblings.splice(site.index, 1)
			into.children.push(...node.children)
			for (const reference of plan.references) {
				if (reference.nodeId === op.nodeId) reference.nodeId = op.intoId
			}
			return null
		}

		case 'deleteNode': {
			const site = locate(plan.outline, op.nodeId)
			if (site === null) return absent('noSection', sectionSubject(op.nodeId))

			// The unplacing lands in this op or nowhere: the Plan is written whole,
			// and a Reference naming a node that is gone does not parse — `docs/plan.md`.
			const gone = new Set(subtreeIds(site.siblings[site.index]))
			site.siblings.splice(site.index, 1)
			for (const reference of plan.references) {
				if (reference.nodeId !== null && gone.has(reference.nodeId))
					reference.nodeId = null
			}
			return null
		}

		case 'setTitle': {
			const scope = scopeOf(plan, op.nodeId)
			if (scope === null) return absent('noSection', scopeSubject(op.nodeId))

			if (!matches(op.expected, scope.title))
				return stale(scopeSubject(op.nodeId), op.expected, scope.title)

			scope.title = op.value
			return null
		}

		case 'setIntent': {
			const node = findNode(plan, op.nodeId)
			if (node === null) return absent('noSection', sectionSubject(op.nodeId))

			const found = node.intent ?? null
			if (!matches(op.expected, found))
				return stale(scopeSubject(op.nodeId), op.expected, found)

			if (op.value === null) delete node.intent
			else node.intent = op.value
			return null
		}

		case 'setTarget': {
			// This op and setAdjectives cannot reach both Scopes through scopeOf the
			// way setTitle and setVoice do: the Article spells its target
			// `totalTarget`, and its Adjectives are required where a node's are not.
			if (op.nodeId === null) {
				if (!matches(op.expected, plan.totalTarget)) {
					return stale(articleSubject, op.expected, plan.totalTarget)
				}
				plan.totalTarget = op.value
				return null
			}

			const node = findNode(plan, op.nodeId)
			if (node === null) return absent('noSection', sectionSubject(op.nodeId))

			const found = node.target ?? null
			if (!matches(op.expected, found))
				return stale(scopeSubject(op.nodeId), op.expected, found)

			if (op.value === null) delete node.target
			else node.target = op.value
			return null
		}

		case 'setVoice': {
			const scope = scopeOf(plan, op.nodeId)
			if (scope === null) return absent('noSection', scopeSubject(op.nodeId))

			const found = scope.voice ?? null
			if (!matches(op.expected, found))
				return stale(scopeSubject(op.nodeId), op.expected, found)

			if (op.value === null) delete scope.voice
			else scope.voice = op.value
			return null
		}

		case 'setAdjectives': {
			if (op.nodeId === null) {
				if (!matches(op.expected, plan.adjectives)) {
					return stale(articleSubject, op.expected, plan.adjectives)
				}
				plan.adjectives = op.value
				return null
			}

			const node = findNode(plan, op.nodeId)
			if (node === null) return absent('noSection', sectionSubject(op.nodeId))

			const found = node.adjectives ?? []
			if (!matches(op.expected, found))
				return stale(scopeSubject(op.nodeId), op.expected, found)

			if (op.value.length === 0) delete node.adjectives
			else node.adjectives = op.value
			return null
		}

		case 'placeReference': {
			const reference = plan.references.find((held) => held.id === op.referenceId)
			if (reference === undefined)
				return absent('noReference', referenceSubject(op.referenceId))

			if (!matches(op.expected, reference.nodeId)) {
				return stale(referenceSubject(op.referenceId), op.expected, reference.nodeId)
			}
			if (op.value !== null && findNode(plan, op.value) === null)
				return absent('noSection', sectionSubject(op.value))

			reference.nodeId = op.value
			return null
		}

		case 'createReference': {
			// checkIds catches a repeated id at the final parse, the same way it
			// catches a repeated Section id, and cannot say which op carried it.
			if (plan.references.some((held) => held.id === op.reference.id)) {
				return refuse(
					'duplicateId',
					referenceSubject(op.reference.id),
					`${op.op} would leave two References carrying the id ${op.reference.id}.`,
				)
			}
			if (op.reference.nodeId !== null && findNode(plan, op.reference.nodeId) === null)
				return absent('noSection', sectionSubject(op.reference.nodeId))

			plan.references.push(op.reference)
			return null
		}

		case 'deleteReference': {
			const at = plan.references.findIndex((held) => held.id === op.referenceId)
			if (at === -1) return absent('noReference', referenceSubject(op.referenceId))

			plan.references.splice(at, 1)
			return null
		}

		case 'setReference': {
			const reference = plan.references.find((held) => held.id === op.referenceId)
			if (reference === undefined)
				return absent('noReference', referenceSubject(op.referenceId))

			const found = referenceContent(reference)
			if (!matches(op.expected, found)) {
				return stale(referenceSubject(op.referenceId), op.expected, found)
			}

			// The content is replaced whole, so a field the op leaves out is a
			// field the Reference no longer carries — `docs/plan.md`, one spelling per state.
			delete reference.text
			delete reference.source
			delete reference.note
			Object.assign(reference, op.value)
			return null
		}
	}
}

/** Splicing needs the array holding a node, which `findNodePath` in scope.ts
 * does not return. */
type Site = { siblings: OutlineNode[]; index: number }

function locate(nodes: OutlineNode[], id: string): Site | null {
	const index = nodes.findIndex((node) => node.id === id)
	if (index !== -1) return { siblings: nodes, index }

	for (const node of nodes) {
		const deeper = locate(node.children, id)
		if (deeper !== null) return deeper
	}

	return null
}

function findNode(plan: Plan, id: string): OutlineNode | null {
	const site = locate(plan.outline, id)
	return site === null ? null : site.siblings[site.index]
}

/** What a content op with `nodeId: null` acts on. */
function scopeOf(plan: Plan, nodeId: string | null): Plan | OutlineNode | null {
	return nodeId === null ? plan : findNode(plan, nodeId)
}

function childrenOf(plan: Plan, parentId: string | null): OutlineNode[] | null {
	if (parentId === null) return plan.outline

	const parent = findNode(plan, parentId)
	return parent === null ? null : parent.children
}

/** Where the anchor puts the node among `siblings`, or null when the sibling it
 * names is gone. A null anchor names none, so it never goes missing. */
function insertionIndex(siblings: OutlineNode[], anchor: Anchor): number | null {
	if (anchor.afterId !== undefined) {
		if (anchor.afterId === null) return 0

		const at = siblings.findIndex((node) => node.id === anchor.afterId)
		return at === -1 ? null : at + 1
	}

	if (anchor.beforeId === null) return siblings.length

	const at = siblings.findIndex((node) => node.id === anchor.beforeId)
	return at === -1 ? null : at
}

function subtreeIds(node: Pick<OutlineNode, 'id' | 'children'>): string[] {
	return [node.id, ...node.children.flatMap(subtreeIds)]
}

/** The payload of a createNode op may state an empty Adjectives list where the
 * Plan says absent — `docs/plan.md`. */
function dropEmptyAdjectives(node: OutlineNode) {
	if (node.adjectives?.length === 0) delete node.adjectives
	node.children.forEach(dropEmptyAdjectives)
}

/**
 * Whole-field comparison. Adjectives are the one list a content op sets, and
 * order counts there. A Reference's content is the one field carrying an object,
 * and it compares key by key — a key that is absent and a key that is undefined
 * say the same thing, which is what lets an op leave a field out.
 */
function matches(expected: unknown, found: unknown): boolean {
	if (Array.isArray(expected) || Array.isArray(found)) {
		if (!Array.isArray(expected) || !Array.isArray(found)) return false

		return (
			expected.length === found.length &&
			expected.every((term, at) => matches(term, found[at]))
		)
	}

	if (isRecord(expected) && isRecord(found)) {
		const keys = new Set([...Object.keys(expected), ...Object.keys(found)])

		return [...keys].every((key) => matches(expected[key], found[key]))
	}

	return expected === found
}

function isRecord(value: unknown): value is Record<string, unknown> {
	return typeof value === 'object' && value !== null
}

function anchorMissing(op: Anchor & { op: OpName; parentId: string | null }): string {
	const anchor =
		op.afterId !== undefined ? `after ${op.afterId}` : `before ${op.beforeId}`
	const holder = op.parentId === null ? 'the Outline' : `node ${op.parentId}`

	return `${op.op} anchors ${anchor}, which ${holder} does not carry.`
}

function malformed(error: z.ZodError): Refusal {
	const issue = error.issues[0]
	// A Proposal is a bare array of ops, so the first path segment is the op's
	// position. Wrapping the array in ops.ts would silently make this null.
	const index = typeof issue.path[0] === 'number' ? issue.path[0] : null

	return {
		type: kindOf.unreadable,
		reason: 'unreadable',
		index,
		op: null,
		subject: null,
		other: null,
		message: `An op does not match the vocabulary${at(issue.path.slice(1))}: ${issue.message}`,
	}
}

function invalidPlan(error: z.ZodError): Refusal {
	const issue = error.issues[0]

	return {
		type: kindOf.wouldNotParse,
		reason: 'wouldNotParse',
		index: null,
		op: null,
		subject: null,
		other: null,
		message: `The Proposal would leave a Plan the schema refuses${at(issue.path)}: ${issue.message}`,
	}
}

function at(path: PropertyKey[]): string {
	return path.length === 0 ? '' : ` at ${path.join('.')}`
}
