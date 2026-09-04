import type { ModelMessage } from 'ai'

import type { Plan } from '../../shared/plan'

/**
 * The Chat turn's prompt pack — The pack is the conversation plus the Plan,
 * in roughly that order. See `docs/llm.md`.
 */

/**
 * What the guide may judge by, stated once and read by both packs. The Chat is
 * asked to review from time to time and the Review does nothing else, so a
 * second wording here would be two products' worth of taste rather than one.
 */
export const judgeAgainstThePlan = [
	'Judge the writing only against the Plan, its intent notes, and the Lexicon.',
	'Your own taste is borrowed and does not count: a Section that meets its',
	'stated intent in a register you would not have chosen is correct for what the writer is trying',
	'to express, and your job is to say so. Where the Plan says nothing, ask rather than',
	'supplying a preference of your own.',
].join('\n')

/** The product's own instructions to the guide, identical on every turn of
 * every Article, so they sit at the very front of the cached prefix. Not the
 * **standing rules**, which `context.md` reserves for House material the
 * writer authors and which land in the same prompt at 1b. */
const guideRules = [
	'You are the guide in a writing harness, helping a human writer research, structure, and plan.',
	'',
	'You never write prose for the article; you chat with them about the type of',
	'article they want to write, how they want it to flow, what kind of tone and voice it should',
	'carry, what intellectual or philosophical patterns they want to employ or explore. And then to',
	'1) offer links and quotes with the recordOffers tool, which the writer might want to read or',
	'use in their article, and 2) propose changes to the Plan with the proposePlanChange tool.',
	'The writer Accepts or Declines each Offer and Proposal. A turn that answers a question,',
	'or asks one, or just yaps with the writer, carries no tool call at all.',
	'',
	'When asked to review the Article Draft, these rules apply:',
	judgeAgainstThePlan,
	'',
	'One Voice applies at a time and the nearest Scope wins outright, so switching a Voice replaces',
	'it. Adjectives compose instead, accumulating from the Article down to the Section. They arrive',
	'widest first, so the nearest ones weigh most: where a Section and the Article pull against each',
	"other, the Section's term is the one to write to.",
	'',
	'You do not use marketing-speak, or make claims you have not verified.',
].join('\n')

/** Recording an Offer the guide did not look up. In both prompts below: a
 * search that comes back unavailable puts the guide back on this path. */
const fromMemoryRules = [
	'Offer a source only where you are confident it',
	'exists and you have the attribution roughly correct. Give a url only where you are confident',
	'of the url itself, and leave it out otherwise — a source with an author and a publication',
	"and no url is useful, and an invented url wastes the writer's time. Where you are working",
	"from memory rather than certainty, say so in the Offer's note.",
].join('\n')

/** One of these two, decided by whether the same turn was given the search
 * tool — `chatTools` in `llm/tools.ts`. */
const canSearchRules = [
	'You can search the web with the webSearch tool, and a source you looked up beats one you',
	'remember. Search before you offer a link or a quote, and offer only urls a search returned.',
	'Where a search comes back unavailable, tell the writer, and record that Offer by the rules',
	'that follow instead.',
].join('\n')

const cannotSearchRules =
	'You cannot browse, so every Offer you record comes from your prior knowledge.'

// Both whole prompts, at module load. Nothing in either varies with the
// Article, so there is nothing for a turn to build.
const searchingPrompt = [guideRules, '', canSearchRules, '', fromMemoryRules].join('\n')
const recallingPrompt = [guideRules, '', cannotSearchRules, '', fromMemoryRules].join(
	'\n',
)

/**
 * The stable prefix of one Chat turn.
 *
 * Two things join the guide rules here, and both arrive with the House at 1b:
 * the Lexicon entries in play, and the writer's own standing rules. Nothing
 * goes in either slot until then. The Plan does not belong here — see the
 * ordering note above.
 */
export function chatSystemPrompt(canSearch: boolean): string {
	return canSearch ? searchingPrompt : recallingPrompt
}

/**
 * The Plan the turn is about, rendered whole.
 *
 * JSON rather than prose, because a Proposal anchors on the ids in it and an op
 * naming an id the model paraphrased is refused by the applier. Compact rather
 * than indented: indenting a Plan of a few hundred Sections buys the model
 * nothing and costs the whitespace in tokens on every turn, and twice on a turn
 * that retries.
 *
 * The `user` role rather than `system`, because a system message after the
 * first is not portable across providers.
 *
 * Exported for the Review pack, which puts the same Plan in front of the Draft.
 * Two spellings of "here is the Plan" would be two things to keep in step.
 */
export function planMessage(plan: Plan): ModelMessage {
	return {
		role: 'user',
		content: [
			'The Plan for this Article as it stands now:',
			'```json',
			JSON.stringify(plan),
			'```',
		].join('\n'),
	}
}

/**
 * The conversation with the Plan in it — in front of the writer's last message,
 * so the writer's words are the last thing the model reads, per `docs/llm.md`.
 */
export function chatPackMessages(
	conversation: ModelMessage[],
	plan: Plan,
): ModelMessage[] {
	const at = planSlot(conversation)

	return [...conversation.slice(0, at), planMessage(plan), ...conversation.slice(at)]
}

/**
 * Calculates where the Plan goes, per `docs/llm.md`.
 */
function planSlot(conversation: ModelMessage[]): number {
	const last = conversation.length - 1
	if (last < 0) return 0

	return conversation[last].role === 'user' ? last : conversation.length
}
