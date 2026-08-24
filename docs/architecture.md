# Architecture

This document records the current and planned/decided architecture of the application,
particularly for patterns that are used to coordinate or bind more than one module.
The reasoning behind each decision lives in the wayfinding map, issue #5, and its closed
tickets.

This document should make very clear what is a rule (and what it's for), vs. descriptions
of how we're doing things now, so as not to over-specify and constrain future innovation.

- Vocabulary is fixed in [`context.md`](./context.md) and governs the code, the UI,
  and this file.
- UI decisions and patterns go in [`ui.md`](./ui.md) or the Storybook stories it includes
  by reference.
- Certain key architecture decisions are recorded in the [`adr`](./adr/) folder.
- What a feature is and how it behaves goes in its own file — [`reviews.md`](./reviews.md).
- What has to be set outside the repository is [`deploy.md`](./deploy.md).
- Use [`later.md`](./later.md) sparingly.

## 1. Build order

Three stages of usefulness. Build with all three in mind and ship them in order. A refactor
at a stage boundary is accepted rather than designed around.

| Stage  | What ships              | What it adds                                                                                                    |
| ------ | ----------------------- | --------------------------------------------------------------------------------------------------------------- |
| **1a** | The Chat and the Plan   | One Article Agent per Article. Useful alone.                                                                    |
| **1b** | The House               | The Lexicon, the standing rules, the Skills, and House-scoped Voice and Adjectives. Only useful once 1a exists. |
| **2**  | The Draft and the Guide | The writing surface, Guidance notes, Reviews.                                                                   |

**Scale**: one Team of two people. No signup flow. "Only one editor at a time on a Draft" is
an acceptable constraint.

**Tiebreaker**: where options are close, take the one that puts a product you can write with
in front of you soonest. Arguments from scale, cost, or throughput decide only when they
threaten that.

## 2. Shape

```
Browser — React + Vite + TanStack Router
  ├─ Chat Panel   ─┐
  ├─ Plan Panel    ├── useAgent WebSocket ──► Article Agent (one per Article)
  ├─ Draft Panel   │                            ├─ Agents SDK store: the Chat transcript
  └─ Notes Panel  ─┘                            ├─ Agent state (one JSON blob): the Plan
                                                ├─ SQLite rows: Blocks, Offers, Notes, Rounds
                   ── party-db WebSocket ──►  The House (one party-db room, → D1)   [1b]
                   ── HTTP (Hono) ─────────►  The article index (→ D1)
                                              Archived reads, export
                                              Workers AI binding → the model
```

**Cloudflare throughout.** Workers, Durable Objects, D1, R2, Workers AI.

**One Article Agent per Article**, built on the Cloudflare Agents SDK. It holds everything
about one Article. It is named in full as "Article Agent" to distinguish from the general
term or a different agent we might add later.

**House Style** arrives at 1b as a single party-db room persisted to D1, holding the writer's
own standing material: the Lexicon, the standing rules, the Skills, and House-scoped Voice
and Adjectives. The House is small, read frequently, simple CRUD over a few
collections, so the API is just the PartyDB collections talking to the PartyDbServer.

**The House holds style and process guides that the writer authors and reuses.** These are
things like research skills/formats, preferred writing Voice, definitions for key Adjectives,
such as "punchy" or "serious", favourite authors and publications -- things that the Article
Agent will use to either gather research, make suggestions, or review the draft.

**Plain D1 tables** hold Archived Plans, Drafts, and Finals, read through a Worker endpoint
rather than synced. D1 also carries the backup story, because a Durable Object's storage has
no export path and D1 has `wrangler d1 export`.

**Three source roots**: `src/client`, `src/server`, and `src/shared` for the modules both
sides import — the Plan schema, the Proposal ops, and the applier. Nothing in `src/shared`
touches a Worker binding or React, and each tsconfig lists the root once rather than
naming each domain.

Recorded in [ADR 0001](./adr/0001-phase-1-storage-shape.md).

## 3. Where writes go

1. **Article Agent state holds only the Plan, and only the client writes it.** `setState`
   replaces the entire blob, so a write meant to change one Section rewrites every
   field from whatever version the client last read. A second writer's changes vanish with
   no conflict and no error.
2. **Every other per-Article record is a SQLite row in the Article Agent**, read and written
   over `@callable` RPC on the WebSocket the client already holds. That covers the Draft's
   Blocks, and Offers, Notes, and Rounds. Row writes touch named columns, so the Guide can
   append a Round while the writer Declines an Offer and neither erases the other. Adding a
   per-Article record type needs no endpoint, no store, and no sync library.
3. **A request is an action when it runs a model, and CRUD otherwise.** Actions: sending a
   Chat turn, running a Review, running research. CRUD: editing a Section, editing a
   Reference, Accepting a Proposal, Declining an Offer, retitling the Article. Accepting is
   CRUD even though a model produced the thing being accepted, because applying it is a
   plain write.
4. **The Guide writes only Notes.** Guidance notes and Rounds are its own output,
   which the writer doesn't (currently) author.
5. **Accepting copies into the Plan and keeps the Provenance.** The Plan's copy is the
   writer's to edit; the original stays as the record of what was produced. A later
   correction therefore arrives as a new Proposal rather than silently rewriting a citation
   the writer already approved.

**The blob is a reactive store; the tables are an on-demand store.** Rows in a Durable
Object's SQLite have no sync — `@callable` RPC is request and response, so nothing tells a
client a row changed. That suits Offers, Notes, and Rounds, which are read when a Panel
opens. It does not suit the Plan, which is on screen continuously. (It's worth keeping
open the question of which items should be included under the PartyDB collections, once
they're added.)

## 4. The Plan

One JSON blob in Article Agent state. Full shape and rationale in
[ADR 0002](./adr/0002-the-plan-data-model.md).

```
plan: {
  title, totalTarget,
  voice, adjectives: [],
  outline: [ { id, title, intent?, target?, voice?, adjectives?: [], children: [] } ],
  references: [ { id, type, provenance, text?, source?, nodeId, note? } ],
}
```

- **The Outline is a nested tree**, sibling order carried by array position, every Section with
  a stable ID that never changes. What the writer reads is that position, worked out in
  `outlineEntries`: the bare `ordinal` for a gutter of them and for a phrase that composes
  one ("Section 2"), and `sectionLabel` for the standalone form ("§2"). Both come from the
  one walk, so no two Panels can number a Section differently.
- **References are flat with an optional `nodeId`**, so an Accepted Reference can sit at a
  Section or nowhere yet.
- **References are type Link or Quote**, and Reference is the umbrella over either type. The
  type is **assigned, not derived from the contents**, so an Offer and the Reference it was
  Accepted into carry the same `type`. Amended in
  [ADR 0002](./adr/0002-the-plan-data-model.md).
- **Voice cascades; Adjectives compose.** Both resolve down the same path — House, then
  Article, then Section, **at read time** — and they differ when two Scopes each state one.
  The nearest Voice wins outright. Adjectives accumulate instead: a "slow" Section inside a
  "fast" Article carries both, and the resolved list runs widest first, so the nearest lands
  last and reads as the strongest. Restating a term moves it to the end, which lets the
  writer say it again for emphasis.
- **The word-count total is stored rather than derived/summed.** The parts may disagree with
  the whole; the gap is information about under/over allocation.
- **One spelling per state.** A field that may be absent says "nothing here" by being
  absent, and not also by an empty string or an empty list — the blob is written whole,
  compared whole-field by a Proposal's `expected`, and sent whole in every prompt pack, so
  two Plans that mean the same thing should be the same, field for field. The schema enforces
  this today: an empty `adjectives` on a Section is refused. Some fields always carry their
  key and indicate "nothing here" with a value; others are absent when empty, but we make
  sure to accept only one or the other. **Choosing for a new field: a question the record is
  always asked carries its key and answers with a value, and a Section's own refinement is
  absent until it is set.** `nodeId`, `totalTarget`, and `children` are the first kind — every
  Reference has a placement even when unplaced. `intent`, `target`, and `voice` are the
  second. Read which one a field takes off `src/shared/plan/schema.ts` rather than from a
  list here.

**The schema guards client writes.** `validateStateChange` parses the whole Plan on every
write, and the model's outputs do not go through it — the Chat proposes and the client
applies, so the blob has only client writes. What the model does meet are the **piece**
schemas, `outlineNodeSchema`, `referenceSchema`, and `sourceSchema`, reused inside a
Proposal's op payloads. It lives in `src/shared/plan/` with the Scope resolver and the
word-count arithmetic.

Four invariants sit above the object shape, checked in the same parse: a Section id is
unique among Sections, a Reference id is unique among References, no two References were
copied from one Offer, and a placed Reference names a node that exists. The last one means
an op that deletes a node unplaces its References in the same Proposal, because the Plan is
written whole and validated whole.

**Size**: a normal Plan runs about 40 KB. The soft ceiling is around 100 KB, where
re-broadcasting on every write gets noticeable; the hard wall is 2 MB, the Durable Object
limit on a single row or value. Growth comes from References carrying long passages. The
relief valve is moving References into SQLite rows, which is the phase 2 move anyway.
**Debounce `setState` while the writer types**, or 40 KB goes over the wire per keystroke.

## 5. Chat and the Offers Ledger

The Chat turns up Offers — Links and Quotes — as SQLite rows in the Article Agent. The
**Ledger** is a View over all the Offers surfaced in this Chat. Offers can be
**Undecided**, **Accepted**, or **Declined** (restorable). In this way, the Ledger is used
as a direct sibling to, or alternative to, showing the chat transcript. We toggle it on or
off within the Chat Panel to view something specific about the Chat. It doesn't attempt to
do the job of any other Panels; when Offers are Accepted, they get promoted into the Plan
as new References, and this is the end of the Offer Ledger's job. It's just throwing the
new Reference over the wall to the next Panel, moving curated pieces of knowledge from the
first Panel to the second. The Plan Panel's references are their own editable clones,
so the Offers don't really have to keep track.

**The research tool carries an `execute`**, where the Proposal tool does not. An Offer is an
inert row rather than something the writer rules on mid-turn, so suspending the call would
buy nothing and cost the turn — a research turn returns seventeen items, and an unruled tool
batch stalls the Chat with no orphan timeout (§11). The suspend-or-execute rule is per tool
rather than for the registry.

**Deduplication runs in two places, and neither compares the Plan's content.** A research
turn calls `recordOffers`, which runs inside the Article Agent rather than over RPC — the
writer never authors an Offer, so nothing on the client may. It fingerprints each entry —
the type, the text, and the source, never the note — and hands back the row already there
rather than writing a second one, still carrying the disposition the writer gave it.
Asking whether an Offer is already in the Plan runs on the Provenance instead: the writer
edits their copy, and content stops matching the moment they do.

**Accepting is two writes against two stores, and nothing makes them atomic.** The copy goes
first, with a `createReference` op through the applier like every other Plan edit, then
`setOfferDisposition` over RPC. This way round a failure does not create an un-recoverable
middle state. The Plan write is local so as long as it succeeds, the RPC can fail and the
only consequence is an Undecided Offer in the Ledger. If the writer attempts to Accept it
again, `acceptOffer` returns `null` and builds no op at all.

**The other order strands the writer, which is why the order is fixed.** Ruling first leaves
the row reading Accepted with the Plan holding nothing. That state is invisible on the
Ledger, because the Ledger shows a ruled Offer as settled and does not read the Plan to
check. It is also unfixable from the Ledger, because there is no control that re-runs the
copy for an Offer already Accepted. Nothing recovers it, and nothing surfaces it.

**A refused copy stops the ruling for the same reason.** `edit` hands back the applier's
refusal, and `useOfferLedger` reads it: sending the ruling anyway would land the app in
exactly that stranded state. The writer gets the applier's sentence instead, built at the
edge from `refusal.reason` like every other one (§6).

**The writer pastes their own References straight into the Plan**, and those carry
`provenance: { type: 'writer' }` rather than an Offer id. They never enter the Ledger: an
Offer is something the Chat turned up and handed over to rule on, and there is nothing to
rule on in a passage the writer typed.

**One Offer becomes one Reference**, and `planSchema` refuses a Plan carrying two copies
of one. `referenceForOffer` answers with the first match on the strength of it, and that
answer is what makes a retried Accept build no op — so a second copy would turn every retry
into another copy.

**A retrieved Offer is the same row as a recalled one.** `provenance` is `writer` or `offer`
and says nothing about whether the Chat looked the source up or remembered it (§7). How to
mark that on an Offer and on the Reference it becomes is open, and waits on #40.

**Proposals are not Offers.** See below.

## 6. Chat and Proposals

**The Chat is standard, and we adopt rather than invent.** Chat with research, tool calls,
approved edits, and an output artifact is well-trodden territory.

**The Article Agent extends `AIChatAgent`** from `@cloudflare/ai-chat`, which is where that
class now lives — importing `agents/ai-chat-agent` throws and says so. It routes a turn to
`onChatMessage`, and the Chat rides the socket the Plan and the RPC already share. The
transcript stays in the Agents SDK's own store.

**The Chat Panel is `src/client/chat/`.** `useArticleChat` is the wiring — the transcript,
the composer, and the two rulings — and `ChatPanel` is the surface, taking a transcript and
the rulings the way `PlanPanel` takes a Plan and one `edit`. The rule itself is
`ruleProposal`, a pure function the app and the showcase both run, so a story cannot rule
differently from the product.

**The Chat can make proposals; only the writer (client) can apply them to the Plan.** The
Chat doesn't get to write to the Plan directly; it surfaces Proposals; the writer can click
to Accept or Decline them. Accepting is `edit(ops)`, the same call every Plan edit makes.
The Proposal's ops go through `createPlanWriter` rather than a
`setState` of their own: the writer holds the Plan the writer sees, so the Plan always gets
updated in a way that will make sense to the writer, even if server and client are out of
sync (§3, rule 1).

**A refused Accept answers nothing and leaves the card open.** The card shows the applier's
sentence, the writer may fix the Plan and Accept again, and Declining sends that sentence
back — so the model learns the Plan moved rather than that the writer said no.

**Proposals are `execute`-less tools** (AI SDK v7). A tool with no `execute` suspends for the
client, which is the Proposal. Four API details, each easy to get wrong:

- Use `addToolOutput`, not the deprecated `addToolResult`, and call it **without `await`** —
  the docs warn twice about deadlock.
- `addToolApprovalResponse` takes `part.approval.id`, not `toolCallId`.
- Do **not** use `needsApproval` or `toolApproval`. Both gate a server-side `execute` this
  product does not have.
- A rejection returns `is_error: true` with the reason in the content.

**Send the Plan in `body`, never in `metadata`.** `body` is request-only and never enters the
transcript; `metadata` persists on the `UIMessage` and re-rides every turn.

### Proposal shape

A list of ops, applied all-or-nothing.

```
proposal: [
  { op: 'createNode', parentId, beforeId, node: { id, title, intent, children: [] } },
  { op: 'setTarget',  nodeId, expected: null, value: 400 },
]
```

- **`expected` is content-addressed staleness** — it names the value the Proposal thinks is
  there, not a version. Compared **whole-field**, because Plan fields are short.
- **Structural ops anchor on IDs and carry no `expected`.** Exactly one of `afterId` or
  `beforeId`, so the model anchors to whichever neighbour its insertion relates to: a Section
  leading into §3 says `before: §3` and survives §2 being deleted. `afterId: null` means
  first child, `beforeId: null` means last child.
- **If any op's `expected` fails, the whole Proposal is Stale.** The UI must say why rather
  than greying it out — whole-field comparison is conservative and will refuse a Proposal
  against a field the writer has since touched.

**Thirteen ops**, in `src/shared/plan/ops.ts`: `createNode`, `moveNode`, `mergeNodes`,
`deleteNode`, `setTitle`, `setIntent`, `setTarget`, `setVoice`, `setAdjectives`,
`placeReference`, `createReference`, `deleteReference`, `setReference`.

**The Chat is offered ten of them.** The three Reference ops are how the writer pastes a
Reference in themselves, and `chatProposalSchema` leaves them out of the tool the model
sees — research reaches the Plan by being Accepted from an Offer, and handing a model
`createReference` would be a way round the Ledger (§5). The applier takes all thirteen,
because the writer's own paste goes through it too.

A content op reads `nodeId: null` as the Article Scope, so setting the
Article's Voice and setting one node's Voice are one op rather than two. Two ops carry a
consequence worth stating: **`deleteNode` unplaces every Reference placed at the node it
removes or at any node below it**, because the Plan is written whole and a Reference naming a
node that is gone does not parse; and **`mergeNodes` keeps the target's own fields**, moving the source's children
and placed References onto it, so a Proposal that wants the source's intent note carried over
says so with a `setIntent` op in the same batch.

**The applier refuses with a reason**, in `src/shared/plan/apply.ts`. `applyProposal` returns
either a new Plan or a refusal naming which op failed, its position in the Proposal, and what
it expected against what it found. It sorts refusals into four types, listed on `RefusalType`
where they cannot drift away from the union. It also parses the Plan it produces, so a
Proposal the Article Agent would reject is refused here, where there is a reason to show,
rather than there, where there is none.

**A refusal has two readers, the LLM and the human.** `refusal.message` is for the model's:
a Declined Proposal sends it back, so it names the op and the ids and may run long. The
writer's sentence is built at the edge from `refusal.reason` — a closed code
naming exactly what went wrong — plus the records it is about, in
`src/client/plan/refusalText.ts`. The Panel that shows it holds the Plan, so it can name a
Section the way the Outline numbers it, where the applier only has an id.

Two things follow. **One English string lives in `src/shared`**, aimed at a an LLM. The
writer's half is a table over a closed union, so if we used a second language, it would be a
second table rather than a sweep through the applier. `refusalText.ts` is total over
`RefusalReason`, so a new refusal site stops it compiling until it says what the new one
reads as.

**The op payloads are strict, and a rejected tool call retries with the validation error.**
The piece schemas the payloads reuse are `strictObject`, so a model that adds one field fails
the whole tool call rather than having the field stripped. Stripping would produce a Proposal
the model did not make and the writer would rule on it without seeing what was dropped. The
cost is real: a model that adds the same field every time thrashes the retry instead of
converging, and the answer to that is naming the field in the schema, not loosening every
payload to strip.

**Staleness is not a multi-client problem.** It comes from the gap between generating a
Proposal and applying it, and inference is slower than typing, so it exists with one writer
in one tab. We are currently quite strict about marking Proposals as stale, but as time goes
on we may want to come up with heuristics that allow us to be a bit more forgiving.

## 7. Inference

**Currently using `@cf/zai-org/glm-5.2` on Workers AI**, over the `env.AI` binding. 262k
context, tool calling and streaming supported, Workers Paid plan required. Swapping it is one
string, and #16 names the fallback and why it is a swap rather than a spike.

**Currently, one model serves every call** — the Chat, the ambient Guidance notes, the
Review. No routing machinery, no per-call-type model selection is included here.

**The AI SDK follows from "Cloudflare throughout" (§2) rather than being chosen against
alternatives.** `@cloudflare/ai-chat` declares `ai` and `@ai-sdk/react` as peer dependencies,
and `workers-ai-provider` is an AI SDK provider whose `createWorkersAI` returns an `ai`
`LanguageModel` over the `env.AI` binding. So the SDK arrives with both packages, and dropping
it would mean dropping `AIChatAgent` and calling the binding by hand. It stays
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

**Search is Exa**, in `src/server/llm/search.ts` — the one place a provider is named, as
`llm/model.ts` is for the model. **No key means no search tool**, and the guide is told to
answer from memory instead: the registry and the guide rules read one value, so they cannot
disagree about what the turn can reach. **A search that fails answers rather than throws**,
because a rejected `execute` ends a turn that still owes the writer a reply.

**Model output is validated, never parsed out of prose.** A Proposal is a tool call and a
Review is `generateObject` against a zod schema — both checked in the Article Agent, with one
retry carrying the validation error. A Review's prose lives _inside_ that schema rather than
being scanned for structure.

The Gateway and the keys are deployment configuration — [`deploy.md`](./deploy.md).

**Prompt packs put the stable part first** — system prompt, then Lexicon entries in play,
then the standing rules, then everything that changes. The Plan and the Draft change all the
time, so they go at the end.

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

Whether the stable-first ordering saves anything on Workers AI is unmeasured — the argument
for it is structural, and the arithmetic is in #16.

Each row below reads in pack order, stable to volatile.

| Pack       | Contents                                                                                    |
| ---------- | ------------------------------------------------------------------------------------------- |
| Chat turn  | The Chat transcript, then the Plan, then the writer's own last message                      |
| Proposal   | The affected span, plus adjacent Section titles and intent notes. Nothing else              |
| Guide pass | The Plan, then the Draft or active Section with neighbours, then recent deltas. **No Chat** |
| Review     | The same, plus the existing Notes. **No Chat**                                              |

Research reaches a Review only by being Accepted into the Plan. The Ledger is the bridge, and
curation is forced rather than assumed.

**Cost does not constrain the design** — #16 priced a guide pass at about a tenth of a cent.

## 8. Frontend

**React + Vite with TanStack Router**, served as static assets from the Worker. **TanStack
Start does not join it** — its value is a typed server boundary in both directions, and the
Agents SDK owns the actions while the two sockets own the reads, leaving about five HTTP
calls in total.

**Hono** serves those in the same Worker: the Agents SDK's chat route, the article index,
party-db's lobby and write path at 1b, archived reads, and export.

**TanStack Query** serves the article index and the archived and export reads. Live data is
already reactive through Article Agent state and, at 1b, party-db's TanStack DB collections.

**The Article screen has four Panels** — Chat, Plan, Draft, Notes — which become tabs on a
narrow screen, and which are all more or less their own little interfaces, with very specific
and explicit, user-gated interactions between them. `usePanels` holds which are open, keeps
them in the one order, drawn by a `Rail` component in the navbar. It also sets how wide each
one gets: Notes takes a fixed slice as the margin rail, and the Draft takes twice what a
supporting Panel does out of what is left, so the prose keeps the room whatever is beside it.

**Use Loading states instead of drawing empty values.** An empty title, a zero count and four
empty columns are answers, and a screen that puts one on the page before it has read anything
has said something untrue. Whatever is still coming says so — `Skeleton` where the shape is
known, a sentence like "Opening the Plan…" where it is not, and a route's `pendingComponent`
where the whole screen is waiting. This is why the Article bar takes `title: string | null`:
`''` is the title the writer cleared, and it cannot also mean "not read yet".

**Navigation is a `Link`.** Tanstack Router provides this component for us, with the very
helpful `defaultPreload: 'intent'` which allows us to trigger functions, such as waking up a
different Article Agent's Durable Object to improve loading times.

**The Articles Area is the list at `/` and the Board View at `/board`**, over the one index
read, under a pathless layout route that holds both.

**The Plan Panel's edits are ops, and the applier applies them.** A field the writer types
in builds the same op a Proposal would carry, `src/client/plan/edits.ts` reads its
`expected` out of the Plan on screen, and `applyProposal` produces the Plan that goes to
`setState`. One write path means the Panel cannot make a change the applier would refuse,
and a structural edit gets the consequences the ops already state — deleting a Section
unplaces its References. The writer's own edits never go Stale: staleness is the gap
between generating a Proposal and applying it, and there is no gap here.

**One writer holds the Plan and the debounce**, in `src/client/plan/writer.ts`. It applies
each edit locally, sends after a pause for the four ops a keystroke produces, and sends at
once for everything else. An update arriving from the Article Agent over an unsent edit is
the echo of an older write and is dropped — the client is the Plan's only writer, so there
is nothing else it can be.

**The Article Agent's WebSocket is multiplexed.** It carries `cf_agent_*` control frames for
state, RPC, and scheduling on one socket. In phase 1 this is free, because the SDK's own
client handles them. It becomes work if a party-db transport ever shares that socket.

**One connection per Article, opened above the Panels.** `useArticleAgent` makes the single
`useAgent` call and hands out three things: the Plan channel, the Offer store built on the
same socket's RPC, and the client itself, which is what `useAgentChat` takes. The Panels read
it through `ArticleProvider` rather than connecting themselves. A Panel opening its own would
be a second socket, a second `createPlanWriter`, and a second debounce timer against a blob
whose whole design is that it has one writer.

## 9. Auth

**Cloudflare Access** gates the Worker at the edge. An unauthenticated request never arrives.

**1a is single-author and its auth is zero code.** One Team, both people read everything, no
per-user records, so nothing parses a token.

**The article index is a real D1 table** — a small table read through Hono routes in the
same Worker, on the path §2 already has for the Archived reads. It does not wait for the
House. An Article created on one machine appears on the other, which is what makes the index
worth having at all. Issue #29 built it.

**It is a list, not a store.** One row carries `{ id, title, status, createdAt, updatedAt,
archivedAt }` and nothing else, so the Article Agent stays the source of truth for the
contents of the Article, and nothing on the index path reaches into one.

**The title is the one field that lives in two places.** The Plan holds the real one, and the
index holds a copy written by the same client action that renames the Article —
`useTitleCopy`, debounced beside the Plan's own writer. **The Plan write goes first**, so a
Plan that lands with a failed copy leaves a stale row that the next rename corrects; the
other order would leave the list ahead of the Plan with nothing to walk it back. That is §5's
argument about Accepting an Offer, applied to the second pair of writes in the app.

**`status` is the writer's word, not an inference.** 1a has no Draft to measure, so the
Article screen carries the one control that sets it and the Board View reads it. `updatedAt`
is when the row last changed — a rename, a status, or Archiving — and not when the Article
was last worked on, because a Plan edit goes to the Article Agent and never touches this
table.

**An Archived Article stays on the same table** and says so with `archivedAt`, rather than
moving to one of its own. Both Views filter the one list the index answers with: the list
shows Archived Articles as a group at its foot, and the Board View leaves them out. Moving
the Chat to R2 is still §11's, still unbuilt, and independent of this flag.

**Avoiding the `Cf-Access-Jwt-Assertion` header makes localhost dev easier.** Localhost has
no Access gate at all, so in development there is no header and no gate. We can change our
DX later if we want to; for now this practice keeps things simple.

**Identity arrives at 1b**, when party-db's `authorize` runs in the partyserver lobby and
needs a verified identity before the object wakes. Access injects
`Cf-Access-Jwt-Assertion` as a header where party-db expects `?token=` on connect, so
`authorize` reads the header. Whether the header survives a WebSocket upgrade into the
Durable Object is unproven — issue #12. If it fails, WorkOS is the documented upgrade.

**Attributing Chat messages to people is wanted and deferred past 1a.** The Agents SDK stores
a role, not a person, so it needs a field on the `UIMessage` or a parallel table. A stable
person id is the one case where `metadata` persistence is wanted; §6's warning is about
payload size and staleness, not about `metadata` as such.

## 10. Phase 2, at low resolution

Decided now so 1a cannot paint itself into a corner. The Draft is built and persists; the
Guide, the Notes Panel, and everything that reads the prose are not.

- **The Draft is one row per Block**, meaning per paragraph. Not one row for the whole Draft,
  and not one row per Section — a row per Section would make Section Boundaries a storage
  fact, and they are approximate and inferred. A list or a blockquote is one Block too: a
  Block is a top-level child of the document, whatever kind it is.
- **The Draft is edited locally** and persisted to the server. A server-authoritative
  ProseMirror step stream is ruled out — the client is the Draft's only writer, the same way
  it is the Plan's.
- **A Block is a row in the Article Agent's SQLite**, written over `@callable` RPC by rule 2,
  and **a save carries a delta** rather than the whole Draft. The delta is what bounds a
  stale tab: a client can only name a Block it has already seen, so a paragraph written
  somewhere else is not one it can delete.
- **Sync is not here yet.** party-db (`mhsnook/party-db`, checked out at `~/code/party-db`)
  arrives with the House at 1b, and the Draft can move onto it later without changing shape.
  Until then two tabs on one Draft is last-write-wins per Block, which is what §1's "only one
  editor at a time" costs. Findings #7 and #18 stand and are not load-bearing yet.
- **Notes is the fourth Panel**, and it is built — §12. What is still phase 2's is the
  ambient half: notes that arrive while the writer works, and anything drawn beside the
  prose.
- **The guide loop is client-initiated. There is no server-side timer anywhere in v1.** The
  client knows when typing stopped; the server cannot tell "still thinking" from "left the
  room." An alarm earns its place only when work must happen while nobody is connected, and
  there is no such work. A stale Proposal or an orphaned tool batch expires lazily on read.
- **Guidance notes do not stream.** A Review is the thing that should.
- **The Draft is a ProseMirror document, built with TipTap.** The reason is narrow: a
  decoration is **drawn as part of the document's layout while staying out of its content**,
  which is what the Guide needs for anything it shows beside the prose without writing it.
  Marks decide nothing — every candidate stores a comment as one. So **a Proposal is a
  decoration and an accepted annotation is a mark**: a proposed section break parts the
  paragraphs and reaches no stored row, while a comment rides in the prose, because only a
  mark survives the writer rewriting around it in a session that never drew the note. And
  **a comment is not a Block reference** — it is a set of marked runs spanning any number of
  Blocks, targeting the span from its first to its last.
  `docs/adr/0003-the-draft-editor.md`.
- **The writer types their own headings and section breaks.** Boundaries are inferred, so
  nothing can place a title automatically; writer control is the tiebreaker, and what the
  writer typed is then the strongest hint the inference has.

## 11. Carries

Settings and known defects. None is a decision to make; all are things to get right.

- **Only the Chat goes cold when an Article is Archived.** Archive is a soft delete. The
  Plan, the Draft, and the Final move to plain D1 tables and stay readable; the Chat goes to
  R2, and un-archiving asks the writer whether to bring it back whole or truncate it. Not
  built in v1.
- **Set party-db's `oplogRetention` low, around 200** against its default of 10,000. For a
  hot row the reconnect delta measured 400× the snapshot, and party-db has no large-delta
  bail-out. Low retention pushes a returning client onto the cheap snapshot path.
- **party-db never compares `previousValue`.** Any concurrent write clobbers the whole row.
  The Block shape limits the blast radius; nothing removes it.
- **party-db has no per-row access control.** `src/server/access.ts` warns that `access` and
  `ownerColumn` are unenforced (party-db #33). Survivable while both people may read
  everything, and not survivable the moment that stops being true.
- **An expired Access session answers with a redirect rather than a 1008 close**, so
  party-db's client reconnect-loops instead of firing `onAuthError`.
- **`@callable` needs the `agents/vite` plugin, in both Vite configs.** Vite 8 transpiles
  with oxc, which does not implement TC39 decorators (oxc#9170) and emits the `@` syntax
  verbatim, so the Worker fails to parse with "SyntaxError: Invalid or unexpected token".
  The plugin lowers them through Babel. `vitest.config.ts` needs it as well as
  `vite.config.ts` — a worker test builds the Article Agent, and the two files do not
  share plugins. **Do not reach for `experimentalDecorators`**: the SDK uses standard
  decorators, and the legacy convention hands `callable()` the prototype instead of the
  method, so nothing registers and every RPC call is refused at runtime with "is not
  callable" — a silent failure where the missing plugin is a loud one.
- **An abandoned tool batch parks indefinitely.** Cloudflare's `ai-chat` enforces batch
  completeness server-side with **no orphan timeout**, so a Proposal the writer neither
  Accepts nor Declines stalls the Chat silently. The composer counts the suspended calls and
  says what it is waiting on rather than sitting dead; nothing expires them.
- **Local development is half solved.** `pnpm db:migrate` puts the article index's schema
  into the local D1 and the worker tests apply the same files themselves, so a build ticket
  can run what it writes against a real table. What is still missing is seeded data: an
  Article with a Plan and a transcript already in it, so a screen can be opened rather than
  built up by hand every time.

## 12. Notes and the Review

What the feature is and how it behaves is [`reviews.md`](./reviews.md). Four rules here,
because each one binds more than one module.

**The Article Agent runs the Review, and the client does not.** A Review is long-running
and produces a batch, so a client-run one is lost the moment the writer closes the tab —
issue #11. `startReview` writes a Round row, answers with it, and carries on under
`waitUntil`. Three things follow:

- **`state` is a column.** `running` has to survive the writer leaving, and a Review that
  fails with nobody connected has to leave its reason on the row rather than on a call.
  A `running` row seen at wake is one a restart cut off — the Review itself holds the
  Agent awake — so `onStart` fails it, freeing the guard below.
- **One Review at a time per Article**, guarded by the running row. Two calls interleave
  whenever the writer double-clicks or has the Article open twice, and `await` inside a
  Durable Object lets the second start before the first finishes (#9). The guard cannot be
  a field: in-memory state does not survive hibernation.
- **Settling a Round broadcasts `review_finished`.** Rows have no sync (§3), so this is the
  one thing that tells a waiting client. A client that was away reads the rows when the
  Panel opens instead, and one whose socket dropped mid-Review polls the Rounds.

**A Note's anchor is settled once, at write time, against the Plan and Draft the model was
shown.** An anchor the client cannot resolve reads as the whole piece and breaks nothing,
so the write is taken and the anchor settled rather than the Note refused — issue #42's
line, applied where nothing is load-bearing. What happens to an anchor afterwards is
`reviews.md`.

**Accept and Decline are the same two words for a Note, an Offer, and a Proposal**, because
the writer rules on all three the same way. The three records still differ in shape — an
Offer starts `undecided`, a Note starts `proposed`, a Proposal stores no disposition at all
and dies with its turn — and whether that is worth reconciling is issue #79.

**A Review does not stream, and §10 says it should.** `@callable` is request and response,
so the streaming version is `streamObject` over the Agent's `onRequest` — issue #77. The
cost is smaller than it looks, because the Round is durable: the wait is a row rather than
a call being held open.

## 13. Out of scope

- **The tracking model** — affirmed Boundaries and text-relocating operations, which would
  make Section membership a fact the app operates on rather than something the Guide infers.
- **Multi-user scoping beyond one Team of two** — House sharing, per-publication sets,
  collaboration.
- **Any harness that evaluates the Guide's output.** The Guide writes Guidance notes, and v1
  ships nothing that scores them.
- **Future ideas** parked in [`later.md`](./later.md): the public showcase, the arc note,
  Review lenses, exemplar pieces, a copy-edit pass, and Transition word-count attribution.
