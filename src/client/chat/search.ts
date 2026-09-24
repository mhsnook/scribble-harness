import { type DynamicToolUIPart, type ToolUIPart } from 'ai'
import { z } from 'zod'

/** One search read out of the transcript, and the line the Chat Panel shows
 * for it. The writer rules on nothing here. */

/** How far one search got: still running, failed, or this many results. */
export type SearchOutcome = number | 'running' | 'failed'

export type SearchCall = {
	/** Null while the model is still streaming the call. */
	query: string | null
	outcome: SearchOutcome
}

/** A search that worked. The Panel needs the status and a count, so results are
 * counted rather than validated, because the tool's own schema already lives in
 * `src/server/llm/search.ts` and re-checking every url on every render would
 * buy the Panel nothing. An unavailable search fails this parse, which is the
 * answer the Panel wants for it anyway. */
const answered = z.object({
	status: z.literal('ok'),
	results: z.array(z.unknown()),
})

/**
 * The caller matches the tool name, so this takes any part it hands over.
 *
 * The input is read field by field rather than through `webSearchInput`,
 * because it would refuse the half-object a streaming call carries.
 */
export function readWebSearch(part: ToolUIPart | DynamicToolUIPart): SearchCall {
	const asked = (part.input as { query?: unknown } | undefined)?.query
	const query = typeof asked === 'string' && asked !== '' ? asked : null

	if (part.state === 'output-error') return { query, outcome: 'failed' }
	if (part.state !== 'output-available') return { query, outcome: 'running' }

	// The tool never throws, so a failed search arrives as an ordinary output
	// saying so rather than as `output-error`.
	const answer = answered.safeParse(part.output)

	return { query, outcome: answer.success ? answer.data.results.length : 'failed' }
}

/** A failure stays short here, because the guide relays the provider's own
 * reason in its reply. */
export function searchNote({ query, outcome }: SearchCall): string {
	const asked = query === null ? 'the web' : `“${query}”`

	switch (outcome) {
		case 'failed':
			return `Searching ${asked} failed, so the guide answered without it.`
		case 'running':
			return `Searching ${asked}…`
		case 0:
			return `Searched ${asked}, and found nothing.`
		case 1:
			return `Searched ${asked} — 1 result.`
		default:
			return `Searched ${asked} — ${outcome} results.`
	}
}
