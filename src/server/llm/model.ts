import type { LanguageModel } from 'ai'
import { createWorkersAI } from 'workers-ai-provider'

/**
 * The whole model boundary — `docs/llm.md`. One model serves every
 * call, and this is the only place it is named: swapping the string below is
 * the entire swap. Do not wrap this in `complete()` / `stream()` /
 * `structured()`. AI SDK v7 already provides those as `generateText`,
 * `streamText`, and `generateObject`, and a wrapper would break the
 * `execute`-less tool machinery a Proposal rides on.
 *
 * If glm-5.2's tool calling or structured output disappoints, the documented
 * swap is `@cf/moonshotai/kimi-k2.6` — same 262k context, same catalogue.
 */
const modelId = '@cf/zai-org/glm-5.2'

/**
 * AI Gateway attaches for logging, and response caching stays off: two guide
 * passes over different Drafts look near-identical to a cache and would come
 * back with each other's Notes.
 *
 * `AI_GATEWAY_ID` names the Gateway. It is set from the CLI rather than checked
 * in — `wrangler.jsonc` says why — so an unset value is ordinary and attaches
 * no Gateway. Leave the Gateway itself unauthenticated: a binding call is
 * same-account and `GatewayOptions` carries nowhere to put a token.
 */
function gatewayFor(env: Env) {
	return env.AI_GATEWAY_ID ? { id: env.AI_GATEWAY_ID, skipCache: true } : undefined
}

// The return type is stated rather than inferred: the provider's model class
// carries private fields, which a project building declarations cannot name.
export const model = (env: Env): LanguageModel =>
	createWorkersAI({ binding: env.AI, gateway: gatewayFor(env) })(modelId)
