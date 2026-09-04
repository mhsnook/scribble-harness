import type { ModelMessage } from 'ai'

import { type BlockRow, blockOrdinals, blockText } from '../../shared/draft'
import { emptyHouse, type HouseContext } from '../../shared/house'
import type { Note } from '../../shared/note'
import type { Plan } from '../../shared/plan'
import type { ReviewDepth } from '../../shared/review'
import { houseInPlay, houseMessage, judgeAgainstThePlan, planMessage } from './prompt'

/**
 * The Review's prompt pack — `docs/llm.md`, and issue #16 for the
 * contents: the House, then the Plan, then the Draft, then the Notes already in
 * play, and **no Chat**. Research reaches a Review only by having been Accepted into the
 * Plan, so the Ledger is the bridge and curation is forced rather than assumed.
 *
 * The writer's prompt goes last, because a model weights the final message as
 * the one to answer and a pack ending on the Draft risks a response about the
 * Draft rather than about what was asked.
 */

/** What the Guide is doing here, identical on every Review of every Article, so
 * it sits at the front of the cached prefix. */
const reviewerRules = [
	"You are the guide in a writing harness, reviewing a human writer's Draft against their Plan.",
	'',
	judgeAgainstThePlan,
	'',
	'You never write prose for the article and you never rewrite a line of it. You say what you',
	'see and the writer decides. You also propose no new sources: a Review is bound by the Plan',
	'and the References already in it.',
	'',
	'Write a response the writer reads top to bottom, in parts. Each part is a passage of your own',
	'prose carrying the reasoning, and then the Notes that passage produced. Work through what you',
	'found rather than listing it: the prose is where you argue, and a Note is a short marker that',
	'pins one point of that argument to a place in the piece.',
	'',
	'A Note carries the anchor, a two or three word label, and a body of one or two sentences.',
	'Keep the body short. The writer will have just read the passage above it, so the Note has to',
	'remind them of the point rather than restate it. Give a part no Notes at all where the prose',
	'is doing framing rather than landing on a line.',
	'',
	'Anchor every Note as tightly as the observation allows, and name ids rather than numbers:',
	'{"kind":"blocks","blockIds":[...]} for one paragraph or a run of them, {"kind":"section",',
	'"nodeId":"..."} for a Section of the Plan, and {"kind":"article"} where the point is about the',
	'whole piece and lands nowhere in particular. Use only ids you were given below. A run of',
	'Blocks means the span from the first to the last, so name both ends rather than every',
	'paragraph between them.',
	'',
	"A Note's type is one or two words saying what sort of observation it is - structure,",
	'tone drift, citations, repetition, budget, pacing, plan divergence, and whatever else the',
	'piece needs. Reuse a type you have already used in this response rather than coining a near',
	'synonym for it.',
	'',
	'You do not use marketing-speak, and you do not open by praising the writer.',
].join('\n')

/** The one dial in front of the writer's own prompt. */
const depthRules: Record<ReviewDepth, string> = {
	quick: [
		'This is a quick pass. Read the whole piece, then write two or three parts covering only',
		'what you would say first if you had one minute with the writer. Leave the smaller',
		'observations out rather than shortening every one of them.',
	].join('\n'),
	thorough: [
		'This is a thorough pass. Work through the piece properly, in as many parts as it takes,',
		'and follow each observation far enough that the writer can act on it without asking you',
		'what you meant. Say where you looked and found nothing worth raising, so the writer knows',
		'the silence was a judgement rather than an omission.',
	].join('\n'),
}

export function reviewSystemPrompt(depth: ReviewDepth): string {
	return [reviewerRules, '', depthRules[depth]].join('\n')
}

/**
 * The Draft, numbered for the writer and identified for the anchors.
 *
 * Both are needed and neither replaces the other: the writer reads "¶3", and an
 * anchor stores the Block id, which survives the paragraph moving. The ordinal
 * comes from `blockOrdinals`, the same function the client labels an anchor
 * with.
 *
 * A Block with no text is named by its type rather than dropped. A section
 * break carries no words and is one of the strongest structural signals in the
 * piece, and a paragraph the writer has emptied is information too.
 */
function draftMessage(blocks: readonly BlockRow[]): ModelMessage {
	const ordinals = blockOrdinals(blocks)

	const lines = blocks.map((block) => {
		const text = blockText(block.json)
		const said = text === '' ? `(${block.json.type}, no text)` : text

		return `¶${ordinals.get(block.id)} [${block.id}] ${block.json.type}: ${said}`
	})

	return {
		role: 'user',
		content: [
			'The Draft as it stands now, one line per paragraph. The number is what the writer',
			'reads and the bracketed id is what an anchor names.',
			'',
			...lines,
		].join('\n'),
	}
}

/** An empty Draft is a real answer rather than a missing one, and saying so
 * stops the model reviewing the Plan and calling it a review of the piece. */
const noDraft: ModelMessage = {
	role: 'user',
	content: 'The Draft is empty. Nothing has been written yet.',
}

/**
 * The Notes still in play — accepted and unresolved.
 *
 * The Review reads them so it does not hand back an observation the writer is
 * already working on. A declined Note is left out on purpose: the writer said
 * no to it, and sending it back would invite the model to argue.
 */
function notesMessage(notes: readonly Note[]): ModelMessage {
	const lines = notes.map(
		(note) =>
			`- [${note.type}] ${note.label === undefined ? '' : `${note.label}: `}${note.body}`,
	)

	return {
		role: 'user',
		content: [
			'Notes the writer has already accepted from earlier Rounds and has not yet resolved.',
			'They are still open, so do not raise them again. Say it plainly if the Draft now',
			'answers one.',
			'',
			...lines,
		].join('\n'),
	}
}

export type ReviewPack = {
	plan: Plan
	blocks: readonly BlockRow[]
	/** The Notes still in play — accepted and not yet resolved. */
	notes: readonly Note[]
	/** What the writer typed. */
	prompt: string
	/** The writer's standing material. A Review reads the House the Chat reads,
	 * so the two cannot judge the same Draft by different rules. */
	house?: HouseContext
}

/** Stable to volatile, and the writer's words last. */
export function reviewPackMessages({
	plan,
	blocks,
	notes,
	prompt,
	house = emptyHouse,
}: ReviewPack): ModelMessage[] {
	const draft = blocks.length === 0 ? noDraft : draftMessage(blocks)

	// A Review's material is the whole piece, so a term is invoked if it appears
	// anywhere the Guide is about to read — including in what the writer asked
	// for, which is where a one-word question names the term it is about.
	const opening = houseMessage(
		houseInPlay(house, [
			JSON.stringify(plan),
			String(draft.content),
			...notes.map((note) => note.body),
			prompt,
		]),
	)

	return [
		...(opening === null ? [] : [opening]),
		planMessage(plan),
		draft,
		...(notes.length === 0 ? [] : [notesMessage(notes)]),
		{ role: 'user', content: `The writer asks:\n\n${prompt}` },
	]
}
