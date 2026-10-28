import { z } from 'zod'

import type { Favourite, FavouriteType } from '../../shared/house'
import type { OutlineNode, Plan } from '../../shared/plan'
import type { Answer, Decide, Question } from './decide'
import { type WebSearch, webSearchResult, type WebSearchResult } from './search'

/**
 * One research call from the Chat: several searches, one pool of candidates,
 * and Clef picking the ones worth showing — `docs/llm.md`.
 *
 * The favourites rank and never filter — `docs/house.md`. So Clef judges a
 * result's merit without seeing them, and a favourite moves ahead only of
 * results in its own merit tier.
 */

/** What the model fills in to research. Strict like the search's own input,
 * so an invented field is refused and retried rather than stripped. */
export const researchInput = z.strictObject({
	queries: z.array(z.string().min(1)).min(1).max(4),
	/** Published on or after this date, as YYYY-MM-DD. */
	since: z.iso.date().optional(),
})
export type ResearchInput = z.infer<typeof researchInput>

const researchResult = webSearchResult.extend({
	/** The name of the writer's favourite this result belongs to. */
	favourite: z.string().min(1).optional(),
})
export type ResearchResult = z.infer<typeof researchResult>

/** `considered` counts the candidates after deduplication, so the writer can
 * see how many a turn looked at against how many it kept. */
export const researchOutput = z.discriminatedUnion('status', [
	z.object({
		status: z.literal('ok'),
		results: z.array(researchResult),
		considered: z.number().int(),
	}),
	z.object({ status: z.literal('unavailable'), reason: z.string() }),
])
export type ResearchOutput = z.infer<typeof researchOutput>

/** Never rejects, because a rejected tool `execute` ends the turn. */
export type Research = (
	input: ResearchInput,
	abortSignal?: AbortSignal,
) => Promise<ResearchOutput>

/** How many results reach the model. The same number one search returned
 * before ranking, so the model reads as much as it did, and the best of it. */
export const KEEP = 6

/** The merit a result needs to be kept, on the scale in `meritQuestion` — nearer
 * "useful" than "thin". */
const MERIT_FLOOR = 1.5

/** The probability Clef must give a favourite before a result counts as that
 * favourite's. */
const FAVOURITE_FLOOR = 0.5

export type ResearchSetup = {
	search: WebSearch
	/** Absent, or failing, leaves the results unranked, the way a search
	 * returned them before Clef. */
	decide?: Decide
	favourites: readonly Favourite[]
	plan: Plan
}

export function research({ search, decide, favourites, plan }: ResearchSetup): Research {
	return async ({ queries, since }, abortSignal) => {
		const outcomes = await Promise.all(
			queries.map((query) =>
				search({ query, ...(since !== undefined && { since }) }, abortSignal),
			),
		)

		const found = outcomes.flatMap((outcome) =>
			outcome.status === 'ok' ? [outcome.results] : [],
		)
		const failed = outcomes.find((outcome) => outcome.status === 'unavailable')
		if (found.length === 0 && failed !== undefined) return failed

		const candidates = dedupe(interleave(found))
		const judgements =
			decide === undefined || candidates.length === 0
				? null
				: await judge(
						decide,
						candidates,
						{ plan, queries, favourites },
						abortSignal,
					).catch((error: unknown) => {
						console.warn('Clef did not rank this research, so it went unranked:', error)

						return null
					})

		return {
			status: 'ok',
			results:
				judgements === null ? candidates.slice(0, KEEP) : pick(candidates, judgements),
			considered: candidates.length,
		}
	}
}

// ---------------------------------------------------------------------------
// Pooling

/** Each search's first result, then each one's second, and so on, so that the
 * unranked fallback keeps every query's best rather than the first query's
 * whole page. */
function interleave(lists: readonly WebSearchResult[][]): WebSearchResult[] {
	const longest = Math.max(0, ...lists.map((list) => list.length))

	return Array.from({ length: longest }, (_, at) =>
		lists.flatMap((list) => (at < list.length ? [list[at]!] : [])),
	).flat()
}

/** Keeps the first of each page, in order. */
function dedupe(results: readonly WebSearchResult[]): WebSearchResult[] {
	const seen = new Set<string>()

	return results.filter((result) => {
		const key = urlKey(result.url)
		if (seen.has(key)) return false
		seen.add(key)

		return true
	})
}

/** One page under the spellings two searches give it: the scheme, a leading
 * `www.`, a trailing slash, the fragment, and tracking parameters. */
export function urlKey(url: string): string {
	const parsed = new URL(url)
	// Collects the names before deleting any, because deleting from
	// `searchParams` while iterating it skips the name after each one deleted.
	const tracking = Array.from(parsed.searchParams.keys()).filter((name) =>
		name.startsWith('utm_'),
	)
	for (const name of tracking) parsed.searchParams.delete(name)

	const host = parsed.hostname.toLowerCase().replace(/^www\./, '')
	const path = parsed.pathname.replace(/\/+$/, '')

	return `${host}${path}${parsed.search}`
}

// ---------------------------------------------------------------------------
// Judging

export type Judgement = {
	/** Clef's score on `meritQuestion`'s scale, 0 to 3. */
	merit: number
	favourite?: Favourite
}

type Context = {
	plan: Plan
	queries: readonly string[]
	favourites: readonly Favourite[]
}

/** One Clef call per candidate rather than one for the pool, so a candidate
 * is judged on its own and not against whichever others came back with it. */
async function judge(
	decide: Decide,
	candidates: readonly WebSearchResult[],
	{ plan, queries, favourites }: Context,
	abortSignal?: AbortSignal,
): Promise<Judgement[]> {
	const options = favouriteOptions(favourites)
	const questions: Record<string, Question> = {
		merit: meritQuestion,
		...(options.size > 0 && { favourite: favouriteQuestion(options) }),
	}
	const article = articleState(plan)

	return Promise.all(
		candidates.map(async (result) => {
			const answers = await decide(
				{ article, sought: queries, result },
				questions,
				abortSignal,
			)

			return {
				merit: meritOf(answers.merit),
				...favouriteOf(answers.favourite, options),
			}
		}),
	)
}

/** The favourites stay out of this question, which is what stops a favourite
 * outranking a better result. */
const meritQuestion: Question = {
	type: 'score',
	instructions: [
		'How much does `result` give the writer to work with, for the Article in `article`,',
		'given what they searched for in `sought`? Judge the excerpt on what it says.',
		'A well-known name is not evidence of merit.',
	].join(' '),
	criteria: [
		'Off the subject, or nothing the writer could use.',
		'On the subject but thin: a passing mention, a roundup of other coverage, or promotion.',
		'Useful: a specific claim, number, or first-hand account the writer could draw on.',
		'Strong: original evidence or reporting on what this Article needs.',
	],
}

function meritOf(answer: Answer | undefined): number {
	if (answer?.type !== 'score') throw new Error('Clef answered merit without a score.')

	return answer.score
}

/** The option that is no favourite. Every favourite's option name starts with
 * its type, so no favourite can be named this. */
const NONE = 'none'

const typeLabel: Record<FavouriteType, string> = {
	publication: 'Publication',
	person: 'Person',
	idea: 'Idea',
}

/** Option name to favourite. Clef takes at most 255 options, and `NONE` is
 * one of them. */
function favouriteOptions(favourites: readonly Favourite[]): Map<string, Favourite> {
	return new Map(
		favourites
			.slice(0, 254)
			.map((favourite) => [`${typeLabel[favourite.type]}: ${favourite.name}`, favourite]),
	)
}

function favouriteQuestion(options: ReadonlyMap<string, Favourite>): Question {
	const criteria: Record<string, string> = {}
	for (const [name, favourite] of options) criteria[name] = describe(favourite)
	criteria[NONE] = 'None of these. Choose this unless the result plainly belongs to one.'

	return {
		type: 'choice',
		instructions: [
			'Which of these favourites does `result` come from, or engage?',
			'A favourite counts only where its description allows.',
		].join(' '),
		criteria,
	}
}

function describe(favourite: Favourite): string {
	if (favourite.type === 'idea') {
		return favourite.why === undefined
			? `Engages the idea of ${favourite.name}.`
			: `Engages the idea of ${favourite.name}: ${favourite.why}`
	}

	const who =
		favourite.type === 'publication'
			? `Published by ${favourite.name}.`
			: `Written by ${favourite.name}, or built on their own words at length.`
	const on =
		favourite.preferFor.length === 0
			? ''
			: ` Counts only on ${favourite.preferFor.join(', ')}.`
	const not =
		favourite.notFor === undefined ? '' : ` Does not count for: ${favourite.notFor}`

	return `${who}${on}${not}`
}

function favouriteOf(
	answer: Answer | undefined,
	options: ReadonlyMap<string, Favourite>,
): { favourite?: Favourite } {
	if (answer?.type !== 'choice' || answer.choice === NONE) return {}

	const favourite = options.get(answer.choice)
	const probability = answer.probabilities?.[answer.choice] ?? answer.confidence ?? 0

	return favourite !== undefined && probability >= FAVOURITE_FLOOR ? { favourite } : {}
}

/** What the Article is about, as Clef reads it: the title and each Section's
 * title and intent note, in Outline order. */
function articleState(plan: Plan) {
	const sections: { title: string; intent?: string }[] = []
	const walk = (nodes: readonly OutlineNode[]) => {
		for (const node of nodes) {
			sections.push({
				title: node.title,
				...(node.intent !== undefined && { intent: node.intent }),
			})
			walk(node.children)
		}
	}
	walk(plan.outline)

	return { title: plan.title, sections }
}

// ---------------------------------------------------------------------------
// Picking

/**
 * The results worth showing, best first. A result below the merit floor is
 * dropped. Among the rest, merit rounds to a tier, and a favourite goes first
 * within its tier — ahead of equally good results, never ahead of better ones.
 */
export function pick(
	candidates: readonly WebSearchResult[],
	judgements: readonly Judgement[],
): ResearchResult[] {
	return candidates
		.map((result, at) => ({ result, ...judgements[at]! }))
		.filter(({ merit }) => merit >= MERIT_FLOOR)
		.sort(
			(a, b) =>
				Math.round(b.merit) - Math.round(a.merit) ||
				Number(b.favourite !== undefined) - Number(a.favourite !== undefined) ||
				b.merit - a.merit,
		)
		.slice(0, KEEP)
		.map(({ result, favourite }) =>
			favourite === undefined ? result : { ...result, favourite: favourite.name },
		)
}
