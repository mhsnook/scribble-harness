import type { ModelMessage } from 'ai'

import { type BlockRow, blockOrdinals, blockText } from '../../shared/draft'
import { type Note, type NoteAnchor, wholePiece } from '../../shared/note'
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
	'A Note carries the paragraphs it is about, a two or three word label, and a body of one or',
	'two sentences.',
	'Keep the body short. The writer will have just read the passage above it, so the Note has to',
	'remind them of the point rather than restate it. Give a part no Notes at all where the prose',
	'is doing framing rather than landing on a line.',
	'',
	'An anchored Note points the writer at the line. A Note that names ¶5 reaches them beside',
	'¶5 and takes them to it; the same Note naming no paragraph leaves them scanning the piece',
	'for what you meant. That is most of what a Note is worth to them.',
	'',
	'Every Note carries "paragraphs". Name the ones it is about, by the numbers the Draft below',
	'gives them: ["¶5"] for one, ["¶3","¶5"] for the run from ¶3 to ¶5 - name the two ends',
	'rather than every paragraph between them. If your own sentence names a paragraph, that',
	'paragraph goes in this array: a Note saying that ¶5 re-argues ¶2 belongs on ¶5. Where one',
	'point covers two stretches that do not touch, write two Notes rather than one loose one.',
	'',
	'Leave "paragraphs" empty only where the point lands nowhere in particular: a Section the',
	'Plan asks for and the Draft never writes, a piece that reads as two pieces, anything true',
	'of the whole. A point about a Section the Draft does write is not one of these. It belongs',
	"on that Section's paragraphs, including where the point is that those paragraphs and the",
	'Plan disagree.',
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
 * The paragraph numbers the Guide named, as an anchor.
 *
 * Beside `draftMessage` because the module that decides how a paragraph is
 * named owns reading the name back. `finishReview` holds one list of Blocks for
 * the prompt and for this, so a number always means the paragraph the Guide was
 * shown, whatever the writer has typed since.
 *
 * Digits are pulled out of whatever the Guide wrote, so "¶5", "5" and
 * "paragraph 5" all land on ¶5, and a range written as one entry lands on both
 * of its ends. A number the Draft does not carry drops out, and a Note left
 * with none reads as the whole piece.
 */
export function anchorFor(
	named: readonly string[],
	blocks: readonly BlockRow[],
): NoteAnchor {
	const byOrdinal = new Map(
		[...blockOrdinals(blocks)].map(([id, ordinal]) => [ordinal, id]),
	)

	const blockIds = named
		.flatMap((one) => [...one.matchAll(/\d+/g)].map((found) => Number(found[0])))
		.map((ordinal) => byOrdinal.get(ordinal))
		.filter((id): id is string => id !== undefined)

	return blockIds.length === 0 ? wholePiece : { kind: 'blocks', blockIds }
}

/**
 * The Draft, numbered.
 *
 * One number does for the writer and for the anchor: it comes from
 * `blockOrdinals`, the same function the client labels an anchor with, and
 * `anchorFor` reads it back into the Block id that is stored. What is stored is
 * still the id, which survives the paragraph moving.
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

		return `¶${ordinals.get(block.id)} ${block.json.type}: ${said}`
	})

	return {
		role: 'user',
		content: [
			'The Draft as it stands now, one line per paragraph. The number is what the writer',
			'reads and what a Note names.',
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
