import type { ModelMessage } from 'ai'

import { emptyHouse, type HouseContext, lexiconInPlay } from '../../shared/house'
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
	'it. Adjectives compose instead, accumulating from the House down through the Article to the',
	'Section. They arrive widest first, so the nearest ones weigh most: where a Section and the',
	"Article pull against each other, the Section's term is the one to write to.",
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
 * The stable prefix of one Chat turn: the product's own rules, identical on
 * every turn of every Article.
 *
 * The House's material sits behind this rather than inside it — `houseMessage`
 * below — so this string stays the same bytes on every turn and the Plan stays
 * out of the prefix entirely, per the ordering note above.
 */
export function chatSystemPrompt(canSearch: boolean): string {
	return canSearch ? searchingPrompt : recallingPrompt
}

/**
 * The House, in front of everything that changes — the Lexicon entries in play,
 * then the writer's own standing rules, then the House Tone. `docs/llm.md`
 * gives the order and `docs/house.md` the contents.
 *
 * The `user` role rather than `system`, for the reason `planMessage` gives: a
 * system message after the first is not portable across providers. Null where
 * the House is empty, so a writer who has authored nothing pays no tokens and
 * reads no empty headings.
 */
export function houseMessage(house: HouseContext): ModelMessage | null {
	const { tone, lexicon, rules } = house

	const parts: string[] = []

	if (lexicon.length > 0) {
		parts.push(
			"Terms from the House Lexicon that this Article invokes. These are the writer's own",
			'definitions, and they beat yours wherever the two disagree.',
			'',
			...lexicon.map((entry) => `- ${entry.term}: ${entry.definition}`),
		)
	}

	if (rules.length > 0) {
		if (parts.length > 0) parts.push('')
		parts.push(
			'The standing rules the writer holds every piece to. They apply on top of the Plan,',
			'and where one of them and your own taste disagree, the rule wins.',
			'',
			...rules.map((rule) => `- ${rule.body}`),
		)
	}

	const adjectives = tone.adjectives ?? []
	if (tone.voice !== undefined || adjectives.length > 0) {
		if (parts.length > 0) parts.push('')
		parts.push(
			'The House Tone, which is the outermost Scope: the Article and its Sections state',
			'theirs against this one.',
			...(tone.voice === undefined ? [] : [`Voice: ${tone.voice}`]),
			...(adjectives.length === 0 ? [] : [`Adjectives: ${adjectives.join(', ')}`]),
		)
	}

	if (parts.length === 0) return null

	return { role: 'user', content: parts.join('\n') }
}

/**
 * The House with its Lexicon narrowed to the entries these texts invoke — what
 * `docs/context.md` means by injecting an entry "whenever the term is invoked".
 *
 * A pack calls this rather than sending the whole Lexicon, because a Lexicon
 * grows for as long as the writer uses the app and a turn about one Article
 * needs the handful of terms that Article uses.
 */
export function houseInPlay(house: HouseContext, texts: readonly string[]): HouseContext {
	return { ...house, lexicon: lexiconInPlay(house.lexicon, texts) }
}

/** The words in a message, for the invocation scan above. A model message
 * carries either a string or the SDK's parts array, and only the text parts of
 * the second one are words the writer or the guide wrote. */
export function messageText(message: ModelMessage): string {
	const { content } = message
	if (typeof content === 'string') return content

	return content
		.map((part) => ('text' in part && typeof part.text === 'string' ? part.text : ''))
		.join('\n')
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
 * The conversation with the House in front of it and the Plan in it — the Plan
 * ahead of the writer's last message, so the writer's words are the last thing
 * the model reads, per `docs/llm.md`.
 *
 * A term counts as invoked when it appears anywhere in the turn's own material:
 * the Plan the writer is looking at, or something either of them said. A term
 * the writer used four turns ago is still what they meant by the word.
 */
export function chatPackMessages(
	conversation: ModelMessage[],
	plan: Plan,
	house: HouseContext = emptyHouse,
): ModelMessage[] {
	const at = planSlot(conversation)
	const said = conversation.map(messageText)
	const opening = houseMessage(houseInPlay(house, [...said, JSON.stringify(plan)]))

	return [
		...(opening === null ? [] : [opening]),
		...conversation.slice(0, at),
		planMessage(plan),
		...conversation.slice(at),
	]
}

/**
 * Calculates where the Plan goes, per `docs/llm.md`.
 */
function planSlot(conversation: ModelMessage[]): number {
	const last = conversation.length - 1
	if (last < 0) return 0

	return conversation[last].role === 'user' ? last : conversation.length
}
