import { describe, expect, it } from 'vitest'

import {
	chatProposalSchema,
	proposalOpSchema,
	proposalSchema,
} from '../../src/shared/plan'

/** An op that parses, so each test states only the field it is about. */
const setTitle = {
	op: 'setTitle',
	nodeId: 'n1',
	expected: 'The old title',
	value: 'The new title',
}

const createNode = {
	op: 'createNode',
	parentId: null,
	beforeId: null,
	node: { id: 'n9', title: 'A new node', children: [] },
}

describe('the op vocabulary', () => {
	it('parses a content op naming a node', () => {
		expect(proposalOpSchema.parse(setTitle)).toEqual(setTitle)
	})

	it('parses a content op naming the Article, where nodeId is null', () => {
		expect(proposalOpSchema.parse({ ...setTitle, nodeId: null })).toBeDefined()
	})

	it('refuses an op name outside the vocabulary', () => {
		expect(proposalOpSchema.safeParse({ ...setTitle, op: 'setTone' }).success).toBe(false)
	})

	it('refuses one extra field rather than stripping it', () => {
		const result = proposalOpSchema.safeParse({ ...setTitle, reason: 'it reads better' })

		expect(result.success).toBe(false)
	})

	it('refuses an extra field inside a piece schema too', () => {
		const node = { ...createNode.node, wordCount: 400 }

		expect(proposalOpSchema.safeParse({ ...createNode, node }).success).toBe(false)
	})

	it('holds the piece schemas to their own field rules', () => {
		const node = { ...createNode.node, voice: '' }

		expect(proposalOpSchema.safeParse({ ...createNode, node }).success).toBe(false)
	})

	it('takes a whole subtree as one createNode payload', () => {
		const node = {
			...createNode.node,
			children: [{ id: 'n9a', title: 'A child', children: [] }],
		}

		expect(proposalOpSchema.safeParse({ ...createNode, node }).success).toBe(true)
	})

	it('takes exactly one anchor', () => {
		expect(proposalOpSchema.safeParse({ ...createNode, afterId: 'n1' }).success).toBe(
			false,
		)
	})

	it('refuses a structural op stating no anchor', () => {
		const { beforeId: _anchor, ...unanchored } = createNode

		expect(proposalOpSchema.safeParse(unanchored).success).toBe(false)
	})

	it('reads a null anchor as first child or last child, not as a missing one', () => {
		expect(proposalOpSchema.safeParse({ ...createNode, beforeId: null }).success).toBe(
			true,
		)
	})

	it('refuses an expected on a structural op', () => {
		expect(proposalOpSchema.safeParse({ ...createNode, expected: null }).success).toBe(
			false,
		)
	})

	it('refuses an empty Proposal, which changes nothing', () => {
		expect(proposalSchema.safeParse([]).success).toBe(false)
	})
})

describe('what the Chat may propose', () => {
	const createReference = {
		op: 'createReference',
		reference: {
			id: 'r1',
			type: 'link',
			provenance: { type: 'writer' },
			source: { title: 'The memo' },
			nodeId: null,
		},
	}

	it('takes the ops that change the Plan', () => {
		expect(chatProposalSchema.safeParse([setTitle, createNode]).success).toBe(true)
	})

	// Research reaches the Plan by being Accepted from an Offer, and the Ledger
	// is that bridge — `docs/chat.md`. The applier still understands
	// the op, because the writer's own paste goes through it.
	it('refuses the Reference ops, which the applier understands', () => {
		expect(chatProposalSchema.safeParse([createReference]).success).toBe(false)
		expect(proposalSchema.safeParse([createReference]).success).toBe(true)
	})
})
