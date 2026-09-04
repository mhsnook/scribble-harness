import { z } from 'zod'

import type { OutlineNode } from './schema'
import {
	adjectiveSchema,
	idSchema,
	intentSchema,
	outlineNodeSchema,
	referenceContentSchema,
	referenceSchema,
	targetSchema,
	voiceSchema,
} from './schema'

/**
 * The op vocabulary a Proposal is written in. What the ops mean, how strict the
 * payloads are, and what to do when a model fights that strictness are all
 * `docs/plan.md`. The applier is apply.ts.
 */

/** Nullable and optional say different things: `afterId: null` is first child,
 * and an absent `afterId` is an op anchored on `beforeId`. */
export type Anchor = { afterId?: string | null; beforeId?: string | null }

const anchorFields = {
	afterId: idSchema.nullable().optional(),
	beforeId: idSchema.nullable().optional(),
}

const anchorRule = {
	error: 'A structural op states exactly one of afterId and beforeId.',
}

function statesOneAnchor(op: Anchor) {
	return (op.afterId !== undefined) !== (op.beforeId !== undefined)
}

// The two nullable ids below are the same schema and not the same field: null
// is the Article for a content op, and the root of the Outline for a
// structural one.
const scopeIdSchema = idSchema.nullable()
const parentIdSchema = idSchema.nullable()

/**
 * The node a `createNode` op carries: `outlineNodeSchema` loosened at its two
 * list fields, so a model is never made to state one empty list while being
 * refused the other. `children` may be left out and `adjectives` may arrive
 * empty; the applier writes the Plan's spelling of both.
 *
 * The leniency lives here rather than on `outlineNodeSchema` because
 * `validateStateChange` guards a write without rewriting it — a default there
 * would let a node reach the blob carrying no `children` key at all, which
 * every reader of a Plan assumes it has.
 */
export const createdNodeSchema: z.ZodType<OutlineNode, CreatedNode> =
	outlineNodeSchema.extend({
		adjectives: z.array(adjectiveSchema).optional(),
		get children() {
			return z.array(createdNodeSchema).default([])
		},
	})

type CreatedNode = Omit<OutlineNode, 'children'> & { children?: CreatedNode[] }

export const createNodeOpSchema = z
	.strictObject({
		op: z.literal('createNode'),
		parentId: parentIdSchema,
		node: createdNodeSchema,
		...anchorFields,
	})
	.refine(statesOneAnchor, anchorRule)

export const moveNodeOpSchema = z
	.strictObject({
		op: z.literal('moveNode'),
		nodeId: idSchema,
		parentId: parentIdSchema,
		...anchorFields,
	})
	.refine(statesOneAnchor, anchorRule)

export const mergeNodesOpSchema = z.strictObject({
	op: z.literal('mergeNodes'),
	nodeId: idSchema,
	intoId: idSchema,
})

export const deleteNodeOpSchema = z.strictObject({
	op: z.literal('deleteNode'),
	nodeId: idSchema,
})

/** A title may be empty, so neither side is nullable. */
export const setTitleOpSchema = z.strictObject({
	op: z.literal('setTitle'),
	nodeId: scopeIdSchema,
	expected: z.string(),
	value: z.string(),
})

/** The Article carries no intent note, so this op takes a node rather than a
 * Scope. */
export const setIntentOpSchema = z.strictObject({
	op: z.literal('setIntent'),
	nodeId: idSchema,
	expected: intentSchema.nullable(),
	value: intentSchema.nullable(),
})

export const setTargetOpSchema = z.strictObject({
	op: z.literal('setTarget'),
	nodeId: scopeIdSchema,
	expected: targetSchema.nullable(),
	value: targetSchema.nullable(),
})

export const setVoiceOpSchema = z.strictObject({
	op: z.literal('setVoice'),
	nodeId: scopeIdSchema,
	expected: voiceSchema.nullable(),
	value: voiceSchema.nullable(),
})

/** A Scope stating no Adjectives reads as the empty list on both sides, so
 * there is no null spelling here. */
export const setAdjectivesOpSchema = z.strictObject({
	op: z.literal('setAdjectives'),
	nodeId: scopeIdSchema,
	expected: z.array(adjectiveSchema),
	value: z.array(adjectiveSchema),
})

export const placeReferenceOpSchema = z.strictObject({
	op: z.literal('placeReference'),
	referenceId: idSchema,
	expected: idSchema.nullable(),
	value: idSchema.nullable(),
})

/**
 * The three ops below are the writer's own References — the ones they paste in
 * rather than Accept from an Offer, which is why the payload states its
 * Provenance.
 *
 * The applier understanding an op does not mean the Chat may propose it. What
 * the model is offered is the tool schema, and research reaches the Plan
 * through the Ledger — `docs/chat.md`. Leave these out of that schema.
 */
export const createReferenceOpSchema = z.strictObject({
	op: z.literal('createReference'),
	reference: referenceSchema,
})

export const deleteReferenceOpSchema = z.strictObject({
	op: z.literal('deleteReference'),
	referenceId: idSchema,
})

/** Replaces what a Reference says and leaves its id, its Provenance, and its
 * placement alone. `expected` is the whole of what it said, compared key by
 * key, because a Reference's content is short and one field. */
export const setReferenceOpSchema = z.strictObject({
	op: z.literal('setReference'),
	referenceId: idSchema,
	expected: referenceContentSchema,
	value: referenceContentSchema,
})

/** The Outline and what a Scope says, which the Chat and the writer both change. */
const planOps = [
	createNodeOpSchema,
	moveNodeOpSchema,
	mergeNodesOpSchema,
	deleteNodeOpSchema,
	setTitleOpSchema,
	setIntentOpSchema,
	setTargetOpSchema,
	setVoiceOpSchema,
	setAdjectivesOpSchema,
	placeReferenceOpSchema,
] as const

/** The writer's own References, which only the writer writes. */
const referenceOps = [
	createReferenceOpSchema,
	deleteReferenceOpSchema,
	setReferenceOpSchema,
] as const

export const proposalOpSchema = z.discriminatedUnion('op', [...planOps, ...referenceOps])

/** The whole Proposal, applied as one ordered batch. An empty list is not one. */
export const proposalSchema = z.array(proposalOpSchema).min(1)

/**
 * What the Chat may propose, against `proposalSchema`, which is everything the
 * applier understands. The Reference ops are left out: research reaches the
 * Plan by being Accepted from an Offer, and the Ledger is that bridge —
 * `docs/chat.md`. A model handed `createReference` could put a
 * source in the Plan that the writer never ruled on.
 *
 * This is the schema the Proposal tool declares, in `src/shared/chat.ts`.
 */
export const chatProposalSchema = z.array(z.discriminatedUnion('op', [...planOps])).min(1)

/**
 * The names of those ops, read off the schema rather than listed again — a
 * second list is a list that drifts. The Proposal tool's description has to
 * teach every one of them, and a test holds it to that: an op added to
 * `planOps` reaches the model whether or not anything tells the model what it
 * does.
 */
export const chatOpNames: OpName[] = (
	chatProposalSchema.element as unknown as {
		options: { shape: { op: { value: OpName } } }[]
	}
).options.map((option) => option.shape.op.value)

export type ProposalOp = z.infer<typeof proposalOpSchema>
export type Proposal = z.infer<typeof proposalSchema>
export type OpName = ProposalOp['op']

/** What a caller may write, against `Proposal`, which is what the parse returns.
 * They differ where `createdNodeSchema` is lenient. */
export type ProposalInput = z.input<typeof proposalSchema>
