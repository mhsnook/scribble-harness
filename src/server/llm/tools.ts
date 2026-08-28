import { getCurrentAgent } from 'agents'
import { tool, type ToolSet } from 'ai'
import { z } from 'zod'

import {
	proposePlanChangeInput,
	proposePlanChangeTool,
	recordedOffersOutput,
	recordOffersTool,
	webSearchTool,
} from '../../shared/chat'
import { offerBatchSchema } from '../../shared/offer'
import type { ArticleAgent } from '../article-agent'
import { type WebSearch, webSearchInput, webSearchOutput } from './search'

/**
 * The tools a Chat turn is given, and the descriptions that teach a model to
 * use them. A tool's name is `src/shared/chat.ts`, because the Chat Panel
 * matches on it. Its schemas go there only where the Panel parses them too —
 * the Proposal's input and the Offer tool's output. The search tool's are in
 * `llm/search.ts`, because nothing on the client reads them.
 *
 * The Proposal tool is **`execute`-less**: a tool with no `execute` suspends
 * for the client, and that suspension is the Proposal the writer rules on —
 * `docs/architecture.md` §6. It writes nothing, because the Chat proposes and
 * the client applies (§3, rule 4).
 *
 * Do not reach for `needsApproval` or `toolApproval`. Both gate a server-side
 * `execute` this product does not have.
 *
 * The Offer tool below carries an `execute` instead, because an Offer is a row
 * the writer rules on later rather than mid-turn — §5. So does the search
 * tool: a search result is not something the writer rules on at all.
 */

const proposePlanChange = tool({
	description: [
		'Propose a change to the Plan for the writer to Accept or Decline.',
		'The ops apply all-or-nothing, in the order given. You never write the Plan yourself.',
		'',
		'A content op - setTitle, setIntent, setTarget, setVoice, setAdjectives - carries an',
		'"expected" field, the value you believe is there now, compared whole-field. Read it off',
		'the Plan you were given. On a content op, "nodeId": null means the Article rather than',
		'one Section.',
		'',
		'A structural op - createNode, moveNode - anchors on ids and states exactly one of',
		'"afterId" and "beforeId": name whichever neighbour the change relates to, so the op',
		'survives the other neighbour being deleted. "afterId": null means first child, and',
		'"beforeId": null means last child.',
		'',
		'deleteNode unplaces every Reference placed at the node it removes and at any node below',
		"it. mergeNodes keeps the target's own fields, so carry the source's intent note over",
		'with a setIntent op in the same batch when you want it kept.',
		'',
		'placeReference puts a Reference the writer has already Accepted at a Section, and',
		'"value": null takes it off the one it sits at. Its "expected" is where it sits now, which',
		'is null while it is unplaced. You cannot add a Reference to the Plan: research reaches it',
		'by the writer Accepting an Offer.',
	].join('\n'),
	inputSchema: proposePlanChangeInput,
})

const recordOffers = tool({
	description: [
		'Record what research turned up, as Offers for the writer to Accept or Decline later.',
		'This writes nothing to the Plan: an Offer is an inert row, and only the writer moves',
		'one into the Plan. Call it once per turn with everything worth showing.',
		'',
		'Offers are flat. Two passages pulled from one publication are two Offers, each of',
		'type "quote" carrying its own "text" - never one Offer holding several. A "link" is',
		'something to draw on, named rather than quoted, and carries a "source". Every Offer',
		'carries a text, a source, or both.',
		'',
		'Offer the same source again freely: an entry this Article already carries comes back',
		'marked a duplicate, keeping whatever the writer already decided about it, and no',
		'second row is written.',
		'',
		"Where you searched, a Quote's text is copied from a result's excerpt word for word, and",
		'the source is filled in from the same result. Say in the note where the Offer came',
		'from - the search that turned it up, or your own memory.',
	].join('\n'),
	// An object at the top level, like the Proposal tool's input.
	inputSchema: z.strictObject({ offers: offerBatchSchema }),
	// The Chat Panel parses this output to find the rows a turn recorded, and
	// fails soft when it cannot — so bind both ends to the one schema.
	outputSchema: recordedOffersOutput,
	execute: async ({ offers }) => {
		// The module is imported once; the instance is per turn.
		const { agent } = getCurrentAgent<ArticleAgent>()
		if (agent === undefined)
			throw new Error('The Offer tool ran outside an Article Agent.')

		const recorded = await agent.recordOffers(offers)

		return recorded.map(({ offer, duplicate }) => ({
			id: offer.id,
			name: offer.source?.title ?? offer.text,
			disposition: offer.disposition,
			duplicate,
		}))
	},
})

const searchDescription = [
	'Search the web. Use it before you offer a link or a quote, so what you offer is',
	'something you retrieved rather than something you remember.',
	'',
	'Search more than once in a turn when the first query comes back thin, or when the',
	'writer\'s question has several sides worth searching separately. Pass "since" as',
	'YYYY-MM-DD where only recent material counts.',
	'',
	'Each result carries a url, and usually a title, an author, a published date, and an',
	'excerpt - a passage pulled off the page for this query. Only offer urls this tool',
	"returned. A Quote's text is copied from an excerpt word for word: an excerpt can",
	'start or end mid-sentence, so trim it back to a whole sentence rather than writing',
	'the missing words yourself.',
	'',
	'A status of "unavailable" means the search did not happen, and the reason says why.',
	'Tell the writer search is down, answer from what you know, and mark any Offer you',
	'make as coming from memory.',
].join('\n')

/** Takes the search rather than importing one, so the Article Agent supplies
 * it the way it supplies the model and a test can script it. */
function searchTool(search: WebSearch) {
	return tool({
		description: searchDescription,
		inputSchema: webSearchInput,
		outputSchema: webSearchOutput,
		// `search` never rejects, so a failed search does not end the turn.
		execute: (input, { abortSignal }) => search(input, abortSignal),
	})
}

/**
 * The registry one turn is given. A function rather than a const, because what
 * it holds varies with what the deployment can reach.
 *
 * Typed as the whole `ToolSet` rather than inferred: the Proposal tool has no
 * `execute` and so no return type to infer, and the wide type is what lets the
 * Agent's `onFinish` callback fit `streamText`'s.
 */
export function chatTools(search?: WebSearch): ToolSet {
	return {
		[proposePlanChangeTool]: proposePlanChange,
		[recordOffersTool]: recordOffers,
		...(search !== undefined && { [webSearchTool]: searchTool(search) }),
	}
}
