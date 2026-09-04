# Inference

The model, the search provider, and the prompt packs, in `src/server/llm/`. Keys and the
Gateway are [`deploy.md`](./deploy.md).

## The model

We currently run `@cf/zai-org/glm-5.2` on Workers AI over the `env.AI` binding: 262k context,
tool calling and streaming supported, Workers Paid plan required. Swapping it changes one
string. Issue #16 names the fallback and why it is a swap rather than a spike.

One model serves every call today — the Chat, the ambient Guidance notes, and the Review. We
have no routing machinery and no per-call-type selection.

The AI SDK follows from "Cloudflare throughout" rather than from a comparison.
`@cloudflare/ai-chat` declares `ai` and `@ai-sdk/react` as peer dependencies, and
`workers-ai-provider` is an AI SDK provider whose `createWorkersAI` returns an `ai`
`LanguageModel` over the `env.AI` binding. The SDK therefore arrives with both packages, and
dropping it would mean dropping `AIChatAgent` and calling the binding by hand. It stays
provider-agnostic, which is what keeps the model swap down to one string.

The swappable boundary is the model instance rather than a wrapper API. AI SDK v7 already
provides `generateText`, `streamText`, and `generateObject`, so a wrapper would duplicate it
and break the `execute`-less tool machinery.

```ts
// src/server/llm/model.ts — the whole boundary
import { createWorkersAI } from 'workers-ai-provider'
export const model = (env: Env) =>
  createWorkersAI({ binding: env.AI })('@cf/zai-org/glm-5.2')
```

Cost does not constrain the design. Issue #16 priced a guide pass at about a tenth of a cent.

## Search

`src/server/llm/search.ts` names Exa, as `llm/model.ts` names the model.

The registry and the guide rules read one value, so they cannot disagree about what a turn can
reach: without a key there is no search tool, and the guide is told to answer from memory.

A failed search returns an answer rather than throwing, because a rejected `execute` ends a
turn that still owes the writer a reply.

## Validation

We validate model output rather than parsing it out of prose. A Proposal is a tool call and a
Review is `generateObject` against a zod schema. The Article Agent checks both and retries
once, carrying the validation error. A Review's prose lives inside that schema rather than
being scanned for structure.

## Prompt packs

Each pack puts the stable part first: the system prompt, then the Lexicon entries in play,
then the standing rules, then everything that changes. The Plan and the Draft change all the
time, so they go last. Whether this saves anything on Workers AI is unmeasured; the argument
is structural, and the arithmetic is in issue #16.

A model weights the final message as the one to answer. So where the writer has just spoken,
their message goes last and the Plan sits in front of it — a pack ending on the Plan's JSON
risks a turn that discusses the Plan instead of answering the question. The Chat pack is built
around this.

A turn that resumes after a tool call is the exception, because the transcript ends with a
tool result. A tool result answers the assistant message before it, and the Plan is a user
message, so slotting the Plan in front would split that pair. The AI SDK refuses that outright
with `MissingToolResultsError`, before calling the model. The Plan goes last in that case, and
no writer message needs the final slot anyway. `chatPackMessages` and `planSlot` in
`src/server/llm/prompt.ts` are the whole of it.

Each row reads in pack order, stable to volatile.

| Pack       | Contents                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------- |
| Chat turn  | The Chat transcript, then the Plan, then the writer's own last message                      |
| Proposal   | The affected span, plus adjacent Section titles and intent notes. Nothing else              |
| Guide pass | The Plan, then the Draft or active Section with neighbours, then recent deltas. **No Chat** |
| Review     | The same, plus the existing Notes. **No Chat**                                              |

Research reaches a Review by being Accepted into the Plan, so the Ledger forces curation
rather than assuming it.
