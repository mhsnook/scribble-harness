# Inference

The model, the search provider, the research ranking, and the prompt packs, in
`src/server/llm/`. Keys and the Gateway are [`deploy.md`](./deploy.md).

## The model

We currently run `@cf/zai-org/glm-5.2` on Workers AI over the `env.AI` binding: 262k context,
tool calling and streaming supported, Workers Paid plan required. Swapping it changes one
string. Issue #16 names the fallback and why it is a swap rather than a spike.

One language model serves every call that writes text — the Chat, the ambient Guidance
notes, and the Review. We have no routing machinery and no per-call-type selection. The
research ranking runs on a decision model instead, which writes no text (see below).

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

## Research ranking

The Chat's search tool takes one to four queries in one call. `src/server/llm/research.ts`
runs them against Exa in parallel at six results each, pools them, and drops duplicate
pages: a leading `www.`, a trailing slash, the fragment, and `utm_` parameters do not make a
second page. Clef then judges each candidate, and the best six reach the model, which is as
many as one search returned before ranking.

`src/server/llm/decide.ts` names Clef — `@cf/cloudflare/clef`, Cloudflare's decision model
on Workers AI — as `llm/model.ts` names the language model. A decision model answers typed
questions about one state with calibrated probabilities rather than text, so it can rank
and cannot write an Offer's note. It rides the same `env.AI` binding and the same Gateway,
and needs no key.

Each candidate gets one call, with the Article's title and Section intents, the queries, and
the result as the state, and up to two questions:

| Question    | Type     | Asks                                                              |
| ----------- | -------- | ----------------------------------------------------------------- |
| `merit`     | `score`  | Off the subject, thin, useful, or strong, as 0 to 3               |
| `favourite` | `choice` | Which of the writer's Favourites the result belongs to, or `none` |

`merit` never sees the Favourites, and `favourite` is asked only where the House holds some.
A result below 1.5 merit is dropped. The rest sort by merit rounded to a tier, then
Favourite first, then merit — so a Favourite goes ahead of equally good results and never
ahead of better ones (`house.md`). A Favourite counts where Clef gives it 0.5 or more.

The ranking fails soft. If any Clef call fails, the turn gets the pool unranked and the
Worker logs a warning. The unranked order takes each query's first result, then each one's
second, so every query's best survives the cap.

Cost does not constrain this either. Clef bills input only. A ranking of twenty candidates
sends ≈20k tokens, which is about half a cent at the $0.24 per million input tokens reported
at launch — an estimate, unmeasured against a real Gateway log.
[ADR 0005](./adr/0005-research-ranking.md) records why the ranking is built this way.

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

The House's three parts ride as one `user` message rather than inside the system prompt —
`houseMessage` in `src/server/llm/prompt.ts`, and
[ADR 0004](./adr/0004-the-house.md) for why. A system message after the first is not portable
across providers, and the system prompt is the same bytes on every turn of every Article,
which is the property worth keeping. The message is null where the House is empty.

Which Lexicon entries are "in play" is decided per turn: an entry whose term appears in the
turn's own material, matched whole and case-insensitively. See
[`house.md`](./house.md).

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

| Pack       | Contents                                                                                                    |
| ---------- | ----------------------------------------------------------------------------------------------------------- |
| Chat turn  | The House, then the Chat transcript, then the Plan, then the writer's own last message                      |
| Proposal   | The affected span, plus adjacent Section titles and intent notes. Nothing else                              |
| Guide pass | The House, then the Plan, then the Draft or active Section with neighbours, then recent deltas. **No Chat** |
| Review     | The same, plus the existing Notes. **No Chat**                                                              |

Research reaches a Review by being Accepted into the Plan, so the Ledger forces curation
rather than assuming it.
