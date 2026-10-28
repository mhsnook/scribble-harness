import { type DynamicToolUIPart, type ToolUIPart } from 'ai'
import { z } from 'zod'

/** One search read out of the transcript, and the line the Chat Panel shows
 * for it. The writer rules on nothing here. */

/** How far one search got: still running, failed, or this many results. */
export type SearchOutcome = number | 'running' | 'failed'

export type SearchCall = {
	/** Empty while the model is still streaming the call. */
	queries: string[]
	outcome: SearchOutcome
	/** How many results the search pooled before it kept `outcome` of them.
	 * Absent on a search from before results were ranked. */
	considered?: number
}

/** A search that worked. The Panel needs the status and a count, so results are
 * counted rather than validated, because the tool's own schema already lives in
 * `src/server/llm/search.ts` and re-checking every url on every render would
 * buy the Panel nothing. An unavailable search fails this parse, which is the
 * answer the Panel wants for it anyway. */
const answered = z.object({
	status: z.literal('ok'),
	results: z.array(z.unknown()),
	considered: z.number().int().optional(),
})

/**
 * The caller matches the tool name, so this takes any part it hands over.
 *
 * The input is read field by field rather than through `webSearchInput`,
 * because it would refuse the half-object a streaming call carries.
 */
export function readWebSearch(part: ToolUIPart | DynamicToolUIPart): SearchCall {
	const queries = askedOf(part.input)

	if (part.state === 'output-error') return { queries, outcome: 'failed' }
	if (part.state !== 'output-available') return { queries, outcome: 'running' }

	// The tool never throws, so a failed search arrives as an ordinary output
	// saying so rather than as `output-error`.
	const answer = answered.safeParse(part.output)
	if (!answer.success) return { queries, outcome: 'failed' }

	const { results, considered } = answer.data

	return {
		queries,
		outcome: results.length,
		...(considered !== undefined && { considered }),
	}
}

/** Reads `queries`, and `query` where there is none, because a transcript keeps
 * each call in the shape it was made in, and calls from before the search took
 * several queries carry one. */
function askedOf(input: unknown): string[] {
	const { queries, query } = (input ?? {}) as { queries?: unknown; query?: unknown }
	const asked: unknown[] = Array.isArray(queries) ? queries : [query]

	return asked.filter((one): one is string => typeof one === 'string' && one !== '')
}

/** A failure stays short here, because the guide relays the provider's own
 * reason in its reply. */
export function searchNote({ queries, outcome, considered }: SearchCall): string {
	const asked =
		queries.length === 0 ? 'the web' : listed(queries.map((one) => `“${one}”`))

	switch (outcome) {
		case 'failed':
			return `Searching ${asked} failed, so the guide answered without it.`
		case 'running':
			return `Searching ${asked}…`
		case 0:
			return considered === undefined || considered === 0
				? `Searched ${asked}, and found nothing.`
				: `Searched ${asked}, and none of ${considered} results was worth showing.`
		default:
			if (considered !== undefined && considered > outcome)
				return `Searched ${asked} — kept ${outcome} of ${considered}.`

			return outcome === 1
				? `Searched ${asked} — 1 result.`
				: `Searched ${asked} — ${outcome} results.`
	}
}

/** “a”, “b” and “c”. */
function listed(items: readonly string[]): string {
	if (items.length < 2) return items.join('')

	return `${items.slice(0, -1).join(', ')} and ${items.at(-1)}`
}
