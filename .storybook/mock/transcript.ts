import type { UIMessage } from 'ai'

import { proposePlanChangeTool, recordOffersTool } from '../../src/shared/chat'
import { offers } from './content'

/**
 * Transcripts for the showcase, in the shape the Agents SDK stores them. The
 * tool parts carry the interesting states: a suspended Proposal has `input` and
 * no output, where a resolved `recordOffers` has both. The Proposal ops apply
 * cleanly against the mock Plan, so a story runs the real applier.
 */

/** The Chat mid-conversation, with a Proposal the writer has not ruled on. */
export const midChat: UIMessage[] = [
	{
		id: 'm-1',
		role: 'user',
		parts: [
			{
				type: 'text',
				text: "The process, then — but I want one developer in it so it isn't all spreadsheets.",
			},
		],
	},
	{
		id: 'm-2',
		role: 'assistant',
		parts: [
			{
				type: 'text',
				text: 'Then the appeal is the part that needs its own Section — the one nobody files is the whole mechanism. It runs long, so the total wants to move with it.',
			},
			{
				type: `tool-${proposePlanChangeTool}`,
				toolCallId: 'call-appeals',
				state: 'input-available',
				input: {
					ops: [
						{
							op: 'createNode',
							parentId: null,
							afterId: 'sec-cost',
							node: {
								id: 'sec-appeals',
								title: 'The appeal that nobody files',
								intent: 'Why the objector pays nothing and the clock resets anyway.',
								target: 400,
								children: [],
							},
						},
						{ op: 'setTarget', nodeId: null, expected: 2400, value: 2800 },
					],
				},
			},
		],
	},
]

/** A Proposal the Plan will refuse: its `expected` names a title the Plan no
 * longer carries. */
export const staleProposal: UIMessage[] = [
	{
		id: 's-1',
		role: 'user',
		parts: [{ type: 'text', text: 'Tighten §3 — the title is doing too much work.' }],
	},
	{
		id: 's-2',
		role: 'assistant',
		parts: [
			{ type: 'text', text: 'Shorter, and it keeps the accusation:' },
			{
				type: `tool-${proposePlanChangeTool}`,
				toolCallId: 'call-stale',
				state: 'input-available',
				input: {
					ops: [
						{
							op: 'setTitle',
							nodeId: 'sec-cost',
							expected: 'Who pays for the delay',
							value: 'Who pays',
						},
					],
				},
			},
		],
	},
]

/** A research turn that returned a lot — the mock Article's whole Offer list. */
export const researchTurn: UIMessage[] = [
	{
		id: 'r-1',
		role: 'user',
		parts: [
			{
				type: 'text',
				text: "Find me everything on approval times in comparable cities. Cast wide, I'll rule on them.",
			},
		],
	},
	{
		id: 'r-2',
		role: 'assistant',
		parts: [
			{
				type: 'text',
				text: "Seven worth showing you. Two are from your favourites, and I've ranked those first.",
			},
			{
				type: `tool-${recordOffersTool}`,
				toolCallId: 'call-research',
				state: 'output-available',
				input: { offers: [] },
				output: offers.map((offer) => ({
					id: offer.id,
					name: offer.source?.title ?? offer.text,
					disposition: offer.disposition,
					duplicate: false,
				})),
			},
			{
				type: 'text',
				text: 'Accepting one copies it into the Plan — the Offer ledger keeps the whole list either way.',
			},
		],
	},
]

/** A turn written in markdown — headings, nested lists, a table, a link and a
 * rule. The writer's own message keeps its asterisks, so this transcript shows
 * both halves of the rule in `ChatMessage`. */
export const markdownTurn: UIMessage[] = [
	{
		id: 'md-1',
		role: 'user',
		parts: [
			{
				type: 'text',
				text: 'Here are the notes I pasted from the ecologist: **captive-bred releases**, sorted by class. Which of these carries an article?',
			},
		],
	},
	{
		id: 'md-2',
		role: 'assistant',
		parts: [
			{
				type: 'text',
				text: `## What the releases turned up

**Birds**

- **Florida grasshopper sparrow** (USA) — fewer than 200 left, up from near-zero. Over 1,000 captive-reared birds released since 2019.
- **Piping plover** (Great Lakes, USA) — 99 pairs and 155 fledged chicks, the most since the 1986 listing.
  - The Michigan count is the one with a series behind it.
- **White-rumped vulture** (India) — first confirmed post-release breeding, after the 1990s \`diclofenac\` collapse.

**Fish**

1. **Olive perchlet** (Victoria, Australia) — extinct in the state since the 1980s; 200 released back into the wild.

| Species | Released | Year |
| --- | --- | --- |
| Sparrow | 1,000+ | 2019– |
| Perchlet | 200 | 2024 |

> The pattern is the same everywhere: the release is the easy half.

---

The [Journal of Threatened Taxa](https://www.threatenedtaxa.org) paper is the peer-reviewed one, so it is the spine if you want the piece to argue rather than list.`,
			},
		],
	},
]
