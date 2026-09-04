import { describe, expect, it } from 'vitest'

import {
	acceptReason,
	declineReason,
	describeProposal,
	readProposal,
	ruleProposal,
	waitingCount,
} from '../../src/client/chat/proposals'
import { proposePlanChangeTool, recordOffersTool } from '../../src/shared/chat'
import {
	applyProposal,
	type Plan,
	type Proposal,
	type Refusal,
} from '../../src/shared/plan'
import { makePlan } from '../shared/plan-fixtures'
import { toolPart, transcript } from './chat-fixtures'

/** Reading Proposals out of a transcript, and ruling on one. */

const plan: Plan = makePlan({
	title: 'Why cities stopped building',
	totalTarget: 2400,
	outline: [
		{ id: 'sec-cranes', title: 'The year the cranes stopped', target: 300, children: [] },
		{ id: 'sec-cost', title: 'Who actually pays', children: [] },
	],
	references: [
		{
			id: 'ref-quote',
			type: 'quote',
			provenance: { type: 'writer' },
			text: 'The meter runs on an empty lot.',
			nodeId: null,
		},
	],
})

const ops: Proposal = [
	{
		op: 'setTitle',
		nodeId: 'sec-cost',
		expected: 'Who actually pays',
		value: 'Who pays',
	},
]

describe('reading a transcript', () => {
	it('counts a call whose input has arrived and whose output has not', () => {
		const messages = transcript(
			toolPart(proposePlanChangeTool, 'input-available', { input: { ops } }),
		)

		expect(waitingCount(messages)).toBe(1)
	})

	it('leaves a Proposal still streaming, and one already ruled on', () => {
		const messages = transcript(
			toolPart(proposePlanChangeTool, 'input-streaming', { input: {} }),
			toolPart(proposePlanChangeTool, 'output-available', {
				input: { ops },
				output: 'done',
			}),
			toolPart(proposePlanChangeTool, 'output-error', {
				input: { ops },
				errorText: 'no',
			}),
		)

		expect(waitingCount(messages)).toBe(0)
	})

	/** The research tool resolves inside the turn (`docs/chat.md`), so its call sits at
	 * `input-available` for as long as the lookup takes. */
	it('leaves out a research call, which nobody has to rule on', () => {
		const messages = transcript(
			toolPart(proposePlanChangeTool, 'input-available', { input: { ops } }),
			toolPart(recordOffersTool, 'input-available', {
				toolCallId: 'call-2',
				input: {},
			}),
		)

		expect(waitingCount(messages)).toBe(1)
	})

	it('counts nothing while only research is running', () => {
		const messages = transcript(
			toolPart(recordOffersTool, 'input-available', { input: {} }),
		)

		expect(waitingCount(messages)).toBe(0)
	})

	it('reads the ops off a suspended call', () => {
		const call = readProposal(
			toolPart(proposePlanChangeTool, 'input-available', { input: { ops } }) as never,
		)

		expect(call.toolCallId).toBe('call-1')
		expect(call.ops).toEqual(ops)
		expect(call.unreadable).toBeNull()
	})

	it('says why a payload could not be read rather than rendering blank', () => {
		const call = readProposal(
			toolPart(proposePlanChangeTool, 'input-available', {
				input: { ops: [{ op: 'setTitle' }] },
			}) as never,
		)

		expect(call.ops).toBeNull()
		expect(call.unreadable).toContain('expected')
	})
})

describe('ruling on a Proposal', () => {
	const call = { toolCallId: 'call-1', ops, unreadable: null }

	it('applies the ops and answers the tool call', () => {
		let written: Plan | null = null
		const ruling = ruleProposal({
			call,
			accepted: true,
			edit: (applied) => {
				const result = applyProposal(plan, applied)
				if (result.ok) written = result.plan

				return result.ok ? null : result.refusal
			},
			refusal: null,
		})

		expect(ruling.refusal).toBeNull()
		expect(ruling.answer).toEqual({ output: acceptReason(ops) })
		expect(written).not.toBeNull()
		expect(written!.outline[1].title).toBe('Who pays')
	})

	/** The card stays open, so the writer can fix the Plan and Accept again. */
	it('answers nothing when the Plan refuses, and hands back the reason', () => {
		const stale = makePlan({
			outline: [{ id: 'sec-cost', title: 'Who bears it', children: [] }],
		})

		const ruling = ruleProposal({
			call,
			accepted: true,
			edit: (applied) => {
				const result = applyProposal(stale, applied)

				return result.ok ? null : result.refusal
			},
			refusal: null,
		})

		expect(ruling.answer).toBeNull()
		expect(ruling.refusal?.type).toBe('stale')
		expect(ruling.refusal?.message).toContain('Who bears it')
	})

	it('declines with is_error and the refusal the Accept produced', () => {
		const refusal: Refusal = {
			type: 'stale',
			reason: 'stale',
			index: 0,
			op: 'setTitle',
			subject: { of: 'article' },
			other: null,
			message: 'setTitle on the Article expected "a" and the Plan carries "b".',
		}

		const ruling = ruleProposal({
			call,
			accepted: false,
			edit: () => null,
			refusal,
		})

		expect(ruling.answer).toEqual({ errorText: declineReason(call, refusal) })
		expect(ruling.answer).toEqual({
			errorText: expect.stringContaining('the Plan carries "b"'),
		})
	})

	it('declines a Proposal it never applied without inventing a reason', () => {
		const ruling = ruleProposal({
			call,
			accepted: false,
			edit: () => null,
			refusal: null,
		})

		expect(ruling.answer).toEqual({ errorText: 'The writer Declined this Proposal.' })
	})

	it('declines an unreadable Proposal rather than applying nothing quietly', () => {
		const unreadable = {
			toolCallId: 'call-1',
			ops: null,
			unreadable: 'ops: expected array',
		}
		const ruling = ruleProposal({
			call: unreadable,
			accepted: true,
			edit: () => {
				throw new Error('An unreadable Proposal must not reach the writer.')
			},
			refusal: null,
		})

		expect(ruling.answer).toEqual({
			errorText: expect.stringContaining('ops: expected array'),
		})
	})
})

describe('what a card says', () => {
	it('names a Section the way the Outline numbers it', () => {
		const said = describeProposal(plan, [
			{ op: 'setTarget', nodeId: 'sec-cost', expected: null, value: 700 },
		])

		expect(said).toEqual(['Set the length of §2 Who actually pays to 700 words.'])
	})

	it('reads a null Scope as the Article', () => {
		const said = describeProposal(plan, [
			{ op: 'setVoice', nodeId: null, expected: null, value: 'Explainer' },
		])

		expect(said).toEqual(['Set the Voice of the Article to Explainer.'])
	})

	it('says which neighbour a new Section anchors to', () => {
		const said = describeProposal(plan, [
			{
				op: 'createNode',
				parentId: null,
				afterId: 'sec-cranes',
				node: { id: 'sec-new', title: 'The appeal nobody files', children: [] },
			},
		])

		expect(said).toEqual([
			'Add a Section, “The appeal nobody files”, after §1 The year the cranes stopped.',
		])
	})

	it('states the consequence a delete carries', () => {
		const said = describeProposal(plan, [{ op: 'deleteNode', nodeId: 'sec-cranes' }])

		expect(said[0]).toContain('unplace the References sitting there')
	})

	it('names a Reference by what it says', () => {
		const said = describeProposal(plan, [
			{
				op: 'placeReference',
				referenceId: 'ref-quote',
				expected: null,
				value: 'sec-cost',
			},
		])

		expect(said).toEqual([
			'Place “The meter runs on an empty lot.” at §2 Who actually pays.',
		])
	})

	it('describes one op per op, in order', () => {
		const said = describeProposal(plan, [
			{ op: 'setTitle', nodeId: null, expected: plan.title, value: 'Stalled' },
			{ op: 'setTarget', nodeId: null, expected: 2400, value: 2800 },
		])

		expect(said).toEqual([
			'Retitle the Article “Stalled”.',
			'Set the length of the Article to 2800 words.',
		])
	})
})
