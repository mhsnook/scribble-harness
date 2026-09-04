import {
	type DynamicToolUIPart,
	getToolName,
	isToolUIPart,
	type ToolUIPart,
	type UIMessage,
} from 'ai'
import { z } from 'zod'

import { proposePlanChangeInput, proposePlanChangeTool } from '../../shared/chat'
import type { Anchor, Plan, Proposal, ProposalOp, Refusal } from '../../shared/plan'
import { planNames } from '../plan/names'
import { referenceName } from '../plan/references'

/**
 * Reading Proposals out of a Chat transcript, ruling on one, and wording what a
 * card says. A Proposal is a suspended tool call: input present, no output,
 * parked until the writer rules — `docs/chat.md`.
 *
 * No socket and no React here, so a test drives it with a transcript and a Plan.
 */

export type ProposalCall = {
	toolCallId: string
	ops: Proposal | null
	/** Why the ops could not be read. */
	unreadable: string | null
}

type AnyToolPart = ToolUIPart | DynamicToolUIPart

/**
 * How many Proposals have their input complete and no output sent, which is what
 * parks a turn — `docs/carries.md`.
 *
 * **Only the Proposal tool counts.** It is the one with no `execute`, so it
 * suspends for the writer and nothing expires it; the research tool resolves
 * inside the turn (`docs/chat.md`) and its call sits at `input-available` meanwhile.
 */
export function waitingCount(messages: readonly UIMessage[]): number {
	let waiting = 0

	for (const message of messages) {
		for (const part of message.parts) {
			if (!isToolUIPart(part)) continue
			if (getToolName(part) !== proposePlanChangeTool) continue
			if (part.state === 'input-available') waiting += 1
		}
	}

	return waiting
}

/** Reads the ops off a suspended call. A payload that fails here has already
 * survived the schema's own retries (`docs/plan.md`), so the card reports it. */
export function readProposal(part: AnyToolPart): ProposalCall {
	const parsed = proposePlanChangeInput.safeParse(part.input)
	if (!parsed.success) {
		return {
			toolCallId: part.toolCallId,
			ops: null,
			unreadable: z.prettifyError(parsed.error),
		}
	}

	return { toolCallId: part.toolCallId, ops: parsed.data.ops, unreadable: null }
}

/** The `is_error: true` content a Decline sends back — `docs/chat.md`. A refused Accept
 * sends the refusal, so the model learns the Plan moved under it. */
export function declineReason(call: ProposalCall, refusal: Refusal | null): string {
	if (call.unreadable !== null) {
		return `This Proposal did not parse, so there was nothing to Accept. ${call.unreadable}`
	}
	if (refusal !== null) {
		return `The Plan refused this Proposal. ${refusal.message}`
	}

	return 'The writer Declined this Proposal.'
}

/** What an Accept sends back. Just the ruling: the next turn carries the whole
 * Plan in `body` anyway. */
export function acceptReason(ops: Proposal): string {
	const count = ops.length === 1 ? 'change' : `${ops.length} changes`

	return `The writer Accepted this Proposal, and the Plan now carries the ${count}.`
}

/** What the tool call is answered with. An `errorText` is the `is_error: true`
 * half — `docs/chat.md`. */
export type ToolAnswer = { output: string } | { errorText: string }

/** Refusals by tool call, since a transcript can carry several open Proposals. */
export type Refusals = Record<string, Refusal>

/** Folds a ruling into the refusals a Panel holds. Landing or declining clears
 * whatever the card was showing. */
export function afterRuling(
	held: Refusals,
	toolCallId: string,
	refusal: Refusal | null,
): Refusals {
	const rest = { ...held }
	delete rest[toolCallId]

	return refusal === null ? rest : { ...rest, [toolCallId]: refusal }
}

export type Ruling = {
	/** Null where the Proposal stays open. */
	answer: ToolAnswer | null
	refusal: Refusal | null
}

export type RulingOptions = {
	call: ProposalCall
	accepted: boolean
	/** The Plan's one writer, so a ruling lands like any other edit. */
	edit: (ops: Proposal) => Refusal | null
	/** From an earlier Accept on this same call. */
	refusal: Refusal | null
}

/**
 * Applies the ops on an Accept, then says what goes back on the tool call. A
 * refused Accept answers nothing and hands back the refusal, leaving the card
 * open for the writer to fix the Plan and try again. The app and the showcase
 * both run this.
 */
export function ruleProposal({ call, accepted, edit, refusal }: RulingOptions): Ruling {
	if (!accepted || call.ops === null) {
		return { answer: { errorText: declineReason(call, refusal) }, refusal: null }
	}

	const refused = edit(call.ops)
	if (refused !== null) return { answer: null, refusal: refused }

	return { answer: { output: acceptReason(call.ops) }, refusal: null }
}

/** The Proposal in the writer's words, one sentence per op, named out of the
 * Plan on screen. */
export function describeProposal(plan: Plan, ops: Proposal): string[] {
	const { section, reference, scope } = planNames(plan)

	// A structural op states exactly one of the two — ops.ts. Null means an end
	// rather than a neighbour: `afterId` first child, `beforeId` last.
	const anchored = (parentId: string | null, op: Anchor) => {
		if (op.beforeId !== undefined) {
			return op.beforeId === null ? lastIn(parentId) : `before ${section(op.beforeId)}`
		}
		if (op.afterId !== undefined && op.afterId !== null) {
			return `after ${section(op.afterId)}`
		}

		return firstIn(parentId)
	}
	const lastIn = (parentId: string | null) =>
		parentId === null ? 'last in the Outline' : `last inside ${section(parentId)}`
	const firstIn = (parentId: string | null) =>
		parentId === null ? 'first in the Outline' : `first inside ${section(parentId)}`

	return ops.map((op) => describe(op))

	function describe(op: ProposalOp): string {
		switch (op.op) {
			case 'createNode':
				return `Add ${titled(op.node.title)}, ${anchored(op.parentId, op)}.`
			case 'moveNode':
				return `Move ${section(op.nodeId)} ${anchored(op.parentId, op)}.`
			case 'mergeNodes':
				return `Merge ${section(op.nodeId)} into ${section(op.intoId)}, keeping what the second one says.`
			case 'deleteNode':
				return `Delete ${section(op.nodeId)}, and unplace the References sitting there.`
			case 'setTitle':
				return op.value === ''
					? `Clear the title of ${scope(op.nodeId)}.`
					: `Retitle ${scope(op.nodeId)} “${op.value}”.`
			case 'setIntent':
				return op.value === null
					? `Clear the intent note on ${section(op.nodeId)}.`
					: `Note on ${section(op.nodeId)}: “${op.value}”.`
			case 'setTarget':
				return op.value === null
					? `Clear the length of ${scope(op.nodeId)}.`
					: `Set the length of ${scope(op.nodeId)} to ${op.value} words.`
			case 'setVoice':
				return op.value === null
					? `Clear the Voice of ${scope(op.nodeId)}.`
					: `Set the Voice of ${scope(op.nodeId)} to ${op.value}.`
			case 'setAdjectives':
				return op.value.length === 0
					? `Clear the Adjectives of ${scope(op.nodeId)}.`
					: `Set the Adjectives of ${scope(op.nodeId)} to ${op.value.join(', ')}.`
			case 'placeReference':
				return op.value === null
					? `Take ${reference(op.referenceId)} off the Section it sits at.`
					: `Place ${reference(op.referenceId)} at ${section(op.value)}.`
			case 'createReference':
				return `Add ${referenceName(op.reference)} to the References.`
			case 'deleteReference':
				return `Delete ${reference(op.referenceId)} from the References.`
			case 'setReference':
				return `Replace what ${reference(op.referenceId)} says.`
		}
	}
}

function titled(title: string): string {
	return title === '' ? 'an untitled Section' : `a Section, “${title}”`
}
