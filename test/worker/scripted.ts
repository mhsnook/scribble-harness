import { env, runInDurableObject } from 'cloudflare:test'

import type { ArticleAgent } from '../../src/server/article-agent'
import type { WebSearch } from '../../src/server/llm/search'

/**
 * What every scripted model answer carries, and how a test reaches inside one
 * Article Agent.
 *
 * No test calls a model: Workers AI is a remote-only binding and
 * `vitest.config.ts` keeps remote bindings off, so a fresh clone can run
 * `pnpm test` with no API token. What the tests drive instead is the Article
 * Agent's own model methods, replaced with scripted ones — the boundary under
 * test is what the app does with a model's answer, which is the same boundary
 * either way.
 */

/** How a turn ended. A provider also reports its own raw reason, and nothing
 * reads that. */
export const stopped = { unified: 'stop' as const, raw: undefined }
export const calledATool = { unified: 'tool-calls' as const, raw: undefined }

/** Token counts a real provider fills in. Nothing reads them. */
export const noUsage = {
	inputTokens: { total: 0, noCache: 0, cacheRead: 0, cacheWrite: 0 },
	outputTokens: { total: 0, text: 0, reasoning: 0 },
}

export function agentStub(name: string) {
	return env.ArticleAgent.get(env.ArticleAgent.idFromName(name))
}

/** One call inside the named Article Agent. */
export function inAgent<T>(
	name: string,
	run: (agent: ArticleAgent) => T | Promise<T>,
): Promise<T> {
	return runInDurableObject(agentStub(name), run)
}

/**
 * Put a scripted model behind one of the Article Agent's model boundaries.
 *
 * The method is named rather than assumed, because the Chat and the Review each
 * read their own (`docs/llm.md` leaves room for them to differ), and a test that scripts
 * the wrong one passes for the wrong reason.
 */
export function scriptModel(
	name: string,
	method: 'chatModel' | 'reviewModel',
	model: ArticleAgent['chatModel'] extends () => infer M ? M : never,
): Promise<void> {
	return inAgent(name, (agent) => {
		agent[method] = () => model
	})
}

/** The same for the Chat's search seam, which is undefined until a key is set. */
export function scriptSearch(name: string, search: WebSearch): Promise<void> {
	return inAgent(name, (agent) => {
		agent.chatSearch = () => search
	})
}
