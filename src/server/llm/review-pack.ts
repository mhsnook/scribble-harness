import type { ModelMessage } from 'ai'

import { type BlockRow, blockOrdinals, blockText } from '../../shared/draft'
import type { Note, NoteAnchor } from '../../shared/note'
import type { Plan } from '../../shared/plan'
import type { ReviewDepth } from '../../shared/review'
import { judgeAgainstThePlan, planMessage } from './prompt'

/**
 * The Review's prompt pack — `docs/llm.md`, and issue #16 for the
 * contents: the Plan, then the Draft, then the Notes already in play, and
 * **no Chat**. Research reaches a Review only by having been Accepted into the
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
	'A Note anchors to the text or to the whole piece, and there is nothing in between.',
	'',
	'{"kind":"blocks","blockIds":[...]} names one paragraph or a run of them. Use only the tags',
	'bracketed in the Draft below, copied exactly. A run means the span from its first paragraph',
	'to its last, so name both ends rather than every paragraph between them.',
	'',
	'{"kind":"article"} is for a point that lands nowhere in particular: a Section the Plan asks',
	'for and the Draft never writes, a piece that reads as two pieces, anything true of the whole.',
	'',
	'Anchor to the text wherever the text exists. A Section the Draft does write is judged through',
	'its paragraphs, so name them and not the Section - including where the point is that the',
	'paragraphs and the Plan disagree. Where one point covers two stretches that do not touch,',
	'write two Notes rather than one loose one.',
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

/** Where a tag starts. Six hex characters over one Draft is a collision about
 * as often as never; `blockTags` checks rather than trusting that. */
const TAG_LENGTH = 6

export type BlockTags = {
	/** Block id → the tag the model is shown. */
	tagOf: ReadonlyMap<string, string>
	/** Tag → Block id, for reading an anchor back. */
	idOf: ReadonlyMap<string, string>
}

/**
 * The short name the model copies instead of a Block id.
 *
 * A Block id is a UUID, and every anchor carries one verbatim — 36 characters
 * the model has to transcribe with no error to anchor a Note to a paragraph.
 * A tail of six is the same work a git short hash does.
 *
 * **Derived from the Block ids alone**, because the pack computes these to
 * write the prompt and `writeReview` computes them again to read the answer.
 * Two calls over the same Blocks have to agree, so nothing else may reach in
 * here — not the ordinal, not the text, not the Round.
 *
 * The tail grows until every Block has its own tag, so a tag is unique within
 * the one Review that uses it, which is all it has to be.
 */
export function blockTags(blockIds: readonly string[]): BlockTags {
	const longest = blockIds.reduce((most, id) => Math.max(most, id.length), 0)

	for (let length = TAG_LENGTH; length < longest; length += 1) {
		const idOf = new Map(blockIds.map((id) => [id.slice(-length), id]))
		if (idOf.size === blockIds.length) return withTags(idOf)
	}

	// Every id in full. Ids are unique, so this always is.
	return withTags(new Map(blockIds.map((id) => [id, id])))
}

function withTags(idOf: Map<string, string>): BlockTags {
	return { idOf, tagOf: new Map([...idOf].map(([tag, id]) => [id, tag])) }
}

/**
 * One anchor as the model wrote it, with its tags turned back into Block ids.
 *
 * A name that is not a tag is left as it is rather than dropped, so an id the
 * model invented reaches `settleAnchor` and is refused there, in the one place
 * that reports it. A full Block id survives for the same reason.
 */
export function expandAnchor(anchor: NoteAnchor, tags: BlockTags): NoteAnchor {
	if (anchor.kind !== 'blocks') return anchor

	return {
		kind: 'blocks',
		blockIds: anchor.blockIds.map((named) => tags.idOf.get(named) ?? named),
	}
}

/**
 * The Draft, numbered for the writer and tagged for the anchors.
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
	const tags = blockTags(blocks.map((block) => block.id))

	const lines = blocks.map((block) => {
		const text = blockText(block.json)
		const said = text === '' ? `(${block.json.type}, no text)` : text

		return `¶${ordinals.get(block.id)} [${tags.tagOf.get(block.id)}] ${block.json.type}: ${said}`
	})

	return {
		role: 'user',
		content: [
			'The Draft as it stands now, one line per paragraph. The number is what the writer',
			'reads and the bracketed tag is what an anchor names.',
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
}

/** Stable to volatile, and the writer's words last. */
export function reviewPackMessages({
	plan,
	blocks,
	notes,
	prompt,
}: ReviewPack): ModelMessage[] {
	return [
		planMessage(plan),
		blocks.length === 0 ? noDraft : draftMessage(blocks),
		...(notes.length === 0 ? [] : [notesMessage(notes)]),
		{ role: 'user', content: `The writer asks:\n\n${prompt}` },
	]
}
