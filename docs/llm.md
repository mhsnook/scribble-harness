# Inference

The model, the search provider, and the prompt packs — `src/server/llm/`. The Gateway and
the keys are [`deploy.md`](./deploy.md). What the model may propose is
[`plan.md`](./plan.md).

## The model

**Currently `@cf/zai-org/glm-5.2` on Workers AI**, over the `env.AI` binding. 262k context,
tool calling and streaming supported, Workers Paid plan required. Swapping it is one string,
and #16 names the fallback and why it is a swap rather than a spike.

**One model serves every call today** — the Chat, the ambient Guidance notes, the Review. No
routing machinery and no per-call-type selection.

**The AI SDK follows from "Cloudflare throughout" rather than being chosen against
alternatives.** `@cloudflare/ai-chat` declares `ai` and `@ai-sdk/react` as peer dependencies,
and `workers-ai-provider` is an AI SDK provider whose `createWorkersAI` returns an `ai`
`LanguageModel` over the `env.AI` binding. So the SDK arrives with both packages, and
dropping it would mean dropping `AIChatAgent` and calling the binding by hand. It stays
provider-agnostic, which is what keeps the model swap above down to one string.

**The swappable boundary is the model instance, not a wrapper API.** AI SDK v7 already
provides `generateText`, `streamText`, and `generateObject`; a wrapper would duplicate it and
break the `execute`-less tool machinery.

```ts
// src/server/llm/model.ts — the whole boundary
import { createWorkersAI } from 'workers-ai-provider'
export const model = (env: Env) =>
  createWorkersAI({ binding: env.AI })('@cf/zai-org/glm-5.2')
```

**Cost does not constrain the design** — #16 priced a guide pass at about a tenth of a cent.

## Search

**Search is Exa**, in `src/server/llm/search.ts` — the one place a provider is named, as
`llm/model.ts` is for the model.

- **No key means no search tool**, and the guide is told to answer from memory instead: the
  registry and the guide rules read one value, so they cannot disagree about what the turn
  can reach.
- **A search that fails answers rather than throws**, because a rejected `execute` ends a
  turn that still owes the writer a reply.

## Model output is validated rather than parsed out of prose

A Proposal is a tool call and a Review is `generateObject` against a zod schema — both
checked in the Article Agent, with one retry carrying the validation error. A Review's prose
lives _inside_ that schema rather than being scanned for structure.

## Prompt packs

**Stable part first** — system prompt, then Lexicon entries in play, then the standing rules,
then everything that changes. The Plan and the Draft change all the time, so they go at the
end. Whether this ordering saves anything on Workers AI is unmeasured; the argument for it is
structural, and the arithmetic is in #16.

**Where the writer has just spoken, their message is the last thing the model reads**, and
the Plan sits in front of it. A model weights the final message as the one to answer, so a
pack ending on the Plan's JSON risks a turn that discusses the Plan rather than the question
the writer asked. This is the rule the Chat pack is built around.

**The exception is a turn that resumes after a tool call**, where the transcript ends with a
tool result rather than the writer. A tool result answers the assistant message before it,
and the Plan is a user message, so slotting it in front would split that pair — which the AI
SDK refuses outright with `MissingToolResultsError`, before the model is called at all. The
Plan goes last in that case, and there is no writer message to keep last anyway.
`chatPackMessages` and `planSlot` in `src/server/llm/prompt.ts` are the whole of it.

Each row reads in pack order, stable to volatile.

| Pack       | Contents                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------- |
| Chat turn  | The Chat transcript, then the Plan, then the writer's own last message                      |
| Proposal   | The affected span, plus adjacent Section titles and intent notes. Nothing else              |
| Guide pass | The Plan, then the Draft or active Section with neighbours, then recent deltas. **No Chat** |
| Review     | The same, plus the existing Notes. **No Chat**                                              |

Research reaches a Review by being Accepted into the Plan. The Ledger is the bridge, and
curation is forced rather than assumed.
