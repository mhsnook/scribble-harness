import type { Note, NoteContent } from '../../src/shared/note'
import type { Round } from '../../src/shared/review'

/**
 * One Review, as the showcase reads it. The real schemas, because the Notes
 * Panel and the Review are wired: a story draws the same rows the Article Agent
 * would hand back.
 *
 * Timestamps are written out rather than computed off `Date.now()`, so every
 * story renders the same dates on every run.
 */

const at = Date.UTC(2026, 7, 12, 13, 2)

const written: (NoteContent & { id: string; disposition: Note['disposition'] })[] = [
	{
		id: 'note-1',
		disposition: 'proposed',
		type: 'repetition',
		anchor: { kind: 'blocks', blockIds: ['b2'] },
		label: 'keep — the first statement',
		body: 'Strongest version. Everything later should point here.',
	},
	{
		id: 'note-2',
		disposition: 'accepted',
		type: 'repetition',
		anchor: { kind: 'blocks', blockIds: ['b3'] },
		label: 're-argued',
		body: 'Cut to a clause. "Neither, having signed the report, spoke."',
	},
	{
		id: 'note-3',
		disposition: 'proposed',
		type: 'repetition',
		anchor: { kind: 'blocks', blockIds: ['b7'] },
		label: 'third statement',
		body: 'The officer quote already implies it. Drop the sentence before it.',
	},
	{
		id: 'note-4',
		disposition: 'declined',
		type: 'tone drift',
		anchor: { kind: 'blocks', blockIds: ['b5'] },
		label: 'editorialising',
		body: '"Always the plan" restates the paragraph above it in a different register. Pick one.',
	},
	{
		id: 'note-5',
		disposition: 'proposed',
		type: 'structure',
		anchor: { kind: 'article' },
		body: 'Both points would survive the cuts. The section would lose about 90 words.',
	},
	{
		id: 'note-6',
		disposition: 'resolved',
		type: 'citations',
		anchor: { kind: 'article' },
		body: 'The £4,100 figure is used twice and attributed once.',
	},
]

export const reviewNotes: Note[] = written.map((note, index) => ({
	...note,
	roundId: 'round-3',
	createdAt: at + index,
	decidedAt: note.disposition === 'proposed' ? null : at + 60_000,
}))

export const reviewRound: Round = {
	id: 'round-3',
	ordinal: 3,
	state: 'done',
	depth: 'thorough',
	prompt:
		'Review specifically for repetitions of our supporting logic. It is fine to repeat the main thesis within reason, but the supporting points should mostly be made once and then we move on — later references can refer back without re-arguing.',
	failure: null,
	startedAt: at,
	finishedAt: at + 40_000,
	passages: [
		{
			prose: [
				'Two supporting points do most of the work in this section: that the two chairs were not shown the figure, and that no end-of-pilot decision was ever written down. The first is made three times, the second twice.',
				'Neither gains anything on repetition, and the second time each appears it arrives with slightly different emphasis, which reads less like restatement than like uncertainty about which version is true.',
			].join('\n\n'),
			label: 'on the first point',
			noteIds: ['note-1', 'note-2', 'note-3'],
		},
		{
			prose:
				'The thesis itself — that the extension was decided without the evidence meant to inform it — appears twice, in the opening and at the section’s close. That is within reason. I would leave both.',
			label: 'on the second point',
			noteIds: ['note-4', 'note-5'],
		},
		{
			prose:
				'One older Note is now answered: the £4,100 figure carries its attribution on both uses. Nothing else in the citations is worth raising.',
			noteIds: ['note-6'],
		},
	],
}

/** An earlier Round, so the history picker has something to pick. */
export const earlierRound: Round = {
	id: 'round-2',
	ordinal: 2,
	state: 'done',
	depth: 'quick',
	prompt: 'Does the middle still do what the Plan says it should?',
	failure: null,
	startedAt: Date.UTC(2026, 7, 11, 9, 40),
	finishedAt: Date.UTC(2026, 7, 11, 9, 41),
	passages: [
		{
			prose:
				'The middle holds. The human cost still arrives later than the Plan puts it, but the reporting either side of it has tightened enough that the delay reads as pacing rather than as an omission.',
			noteIds: [],
		},
	],
}

export const reviewRounds: Round[] = [earlierRound, reviewRound]
