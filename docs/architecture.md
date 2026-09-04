# Architecture

This file records the rules that bind more than one module. A rule belongs here if it takes
the form "P does Q, because R requires S" — that way, when R changes, the rule is up for
review. Anything true of one module alone belongs in that module's file:
[`plan.md`](./plan.md), [`chat.md`](./chat.md), [`sync.md`](./sync.md),
[`llm.md`](./llm.md), [`draft.md`](./draft.md), [`articles.md`](./articles.md),
[`reviews.md`](./reviews.md), [`ui.md`](./ui.md), [`carries.md`](./carries.md),
[`deploy.md`](./deploy.md), [`context.md`](./context.md), [`later.md`](./later.md), and
[`adr/`](./adr/).

## 1. Scale

One Team holds two people. There is no signup flow. Both people may read everything.

Two people rarely edit one Article at the same time, so we accept last-write-wins on the
Draft and a single-writer design for the Plan. Most of section 3 follows from this. If the
Team grows, revisit section 3 first.

Where two options are close, take the one that puts a usable writing product in front of you
soonest. Cost and throughput arguments decide only when they threaten that.

The build order and its stages are project management, not architecture. Stage 1a shipped as
issues #21 to #29. Stage 1b is #53, the House. Stage 2 is #54, the Draft and the Guide.

## 2. Shape

```
Browser — React + Vite + TanStack Router
  ├─ Chat Panel   ─┐
  ├─ Plan Panel    ├── useAgent WebSocket ───► Article Agent (one per Article)
  ├─ Draft Panel   ├── party-db WebSocket ──►   ├─ Agents SDK store: the Chat transcript
  └─ Notes Panel  ─┘    (same Agent, §4.3)      ├─ Agent state (one JSON blob): the Plan
                                                ├─ SQLite rows: Blocks
                                                ├─ party-db collections over its SQLite:
                                                │    Notes, Rounds, Offers (synced)
                   ── party-db WebSocket ──►  The House (one party-db room, → D1)   [1b]
                   ── HTTP (Hono) ─────────►  The article index (→ D1)
                                              Archived reads, export
                                              Workers AI binding → the model
```

We run on Cloudflare throughout: Workers, Durable Objects, D1, R2, and Workers AI.

Each Article gets one Article Agent, built on the Cloudflare Agents SDK, which holds
everything about that Article. We write the name in full to distinguish it from the general
term and from any agent we add later.

The House arrives at 1b as one party-db room persisted to D1. It holds the Lexicon, the
standing rules, the Skills, and House-scoped Voice and Adjectives. It is small and its API is
plain CRUD, so a `PartyDbServer` serves it directly. [`context.md`](./context.md) says what
the House is for.

Plain D1 tables hold Archived Plans, Drafts, and Finals. A Worker endpoint reads them; they
are not synced. D1 also carries the backup story, because a Durable Object's storage has no
export path and D1 has `wrangler d1 export`.

Hono serves the HTTP routes in the same Worker: the Agents SDK's chat route, the article
index, party-db's lobby and write path at 1b, archived reads, and export.

The client is React and Vite with TanStack Router, served as static assets from the Worker.
We left out TanStack Start, because its value is a typed server boundary in both directions,
and here the Agents SDK owns the actions while the two sockets own the reads — about five
HTTP calls remain. TanStack Query serves those. Live data is already reactive through Article
Agent state and party-db's TanStack DB collections.

Recorded in [ADR 0001](./adr/0001-phase-1-storage-shape.md).

## 3. Where writes go

1. The client is the only writer of Article Agent state, which holds the Plan. `setState`
   replaces the whole blob, so any write rewrites every field from the version the client
   last read. A second writer's changes would vanish with no conflict and no error.
2. Every other per-Article record is a SQLite row in the Article Agent, read and written over
   `@callable` RPC on the WebSocket the client already holds. That covers the Draft's Blocks,
   the Offers, the Notes, and the Rounds. A row write touches named columns, so the Guide can
   append a Round while the writer Declines an Offer, and neither erases the other. Adding a
   record type needs no endpoint, no store, and no sync library.
3. A request is an action when it runs a model, and CRUD otherwise. The actions are sending a
   Chat turn, running a Review, and running research. The CRUD is editing a Section, editing
   a Reference, Accepting a Proposal, Declining an Offer, and retitling the Article. Accepting
   counts as CRUD even though a model produced the thing being accepted, because applying it
   is a plain write.
4. A SQLite row reaches the client on demand until we publish its table as a party-db
   collection. `@callable` RPC is request and response, so nothing tells a connected client
   that a row changed. That suits Blocks, which the client writes and reads itself. Notes,
   Rounds and Offers are published as collections instead, so reads are live queries and the
   Guide's writes go through `commit()` — see [`sync.md`](./sync.md). Rulings still go over
   RPC, per rule 2. The Draft is the table left; [`draft.md`](./draft.md) says why it can wait.
5. The writer does not author an Offer, a Round, or a Note today. This is an observation
   rather than a rule, and it is worth stating because one thing rests on it: `recordOffers`
   runs inside the Article Agent rather than over RPC, since nothing on the client needs to
   write an Offer. Nothing else depends on it, so letting the writer author a Note would cost
   that one call and no more.

## 4. Seams

### 4.1 The Chat proposes Plan changes and the writer applies them

The Chat cannot write the Plan. It surfaces Proposals, and Accepting one calls `edit(ops)` —
the same call every Plan edit makes — so the ops run through `createPlanWriter` against the
Plan the writer is looking at. Rule 1 above is the reason.

We reach for this shape across the app: the server passes work to the client as Notes, Offers,
and Proposals, and the client writes them into the record. It answers two questions at once —
how to surface a change, and how to merge it — with one pattern, and it keeps the writer in
charge of the Plan and the Draft.

Two rules follow. The applier is the only write path, so no Panel can make a change the
applier would refuse. And `chatProposalSchema` withholds the three Reference ops from the
model, because research must reach the Plan by being Accepted from an Offer; the applier
still takes all thirteen ops, because the writer's own paste goes through it.

See [`plan.md`](./plan.md) for the ops and the applier.

### 4.2 One refusal serves two readers

The applier lives in `src/shared`, so its refusal has to answer the model and the writer at
once. `refusal.message` goes back to the model with a Decline. `refusalText.ts` builds the
writer's sentence at the edge from `refusal.reason` plus the Plan, so it can name a Section
the way the Outline numbers it. See [`plan.md`](./plan.md).

### 4.3 Sync rides a second socket, and server writes go through `commit()`

The `useAgent` socket carries the SDK's `cf_agent_*` control frames, so party-db connects to
the same Durable Object over a second socket rather than sharing that one. To reach an
already-connected client, a server write must go through `commit()`, because only the oplog
feeds the stream. See [`sync.md`](./sync.md).

### 4.4 One connection per Article, opened above the Panels

`useArticleAgent` makes the single `useAgent` call and hands out the Plan channel, the Offer
store built on that socket's RPC, and the client that `useAgentChat` takes. The Panels read
those through `ArticleProvider` instead of connecting themselves. A Panel that opened its own
connection would add a second socket, a second `createPlanWriter`, and a second debounce
timer against a blob that rule 1 gives one writer.

### 4.5 The writer Accepts Offers, which become References and keep their Provenance

An Accepted Offer is copied into the Plan, and the writer may then edit that Reference
freely. The Offer row stays as the record of what the Chat produced, so a later correction
arrives as a new Proposal instead of silently rewriting a citation the writer approved. To
tell whether an Offer already reached the Plan we compare Provenance rather than content,
because the writer's edits break a content match.

Accepting writes the Plan first and rules the Offer second. If the ruling fails, the Offer
stays Undecided and the writer can Accept again. See [`chat.md`](./chat.md).

### 4.6 Article titles live in the D1 index and in the Article Agent

The Plan holds the real title. The index holds a copy, written by the same client action that
renames the Article — `useTitleCopy`, debounced beside the Plan's own writer. The Plan write
goes first, so a failed copy leaves a stale row that the next rename corrects. See
[`articles.md`](./articles.md).

### 4.7 `src/shared` holds the code both sides import

`src/client`, `src/server`, and `src/shared` are the three source roots. `src/shared` holds
the Plan schema, the Proposal ops, the applier, and the collection schemas in `sync.ts`.
Nothing there may touch a Worker binding or React, so both sides can import it. That is what
lets the Article Agent validate a Plan against the same file the client used, and lets the
client refuse a Proposal at the edge where it has a reason to show.

### 4.8 Cloudflare Access gates the edge; identity arrives at 1b

Access gates the Worker, so an unauthenticated request never arrives. 1a needs no auth code:
one Team, both people read everything, and no record is per-user.

We avoid reading `Cf-Access-Jwt-Assertion` while we can, because localhost has no Access gate
and therefore no header, which keeps development simple. That is a convenience rather than a
constraint, and we can change the DX later if we want to.

At 1b, party-db's `authorize` runs in the partyserver lobby and needs a verified identity
before the object wakes. Access injects the assertion as a header where party-db expects
`?token=` on connect, so `authorize` reads the header. Issue #12 tracks whether the header
survives a WebSocket upgrade into the Durable Object. WorkOS is the documented upgrade if
it does not.

Attributing Chat messages to people is wanted and deferred past 1a. The Agents SDK stores a
role rather than a person, so this needs a field on the `UIMessage` or a parallel table.

### 4.9 Accept and Decline mean the same thing for a Note, an Offer, and a Proposal

The writer rules on all three the same way, so we use the same two words. The records still
differ in shape: an Offer starts `undecided`, a Note starts `proposed`, and a Proposal stores
no disposition and dies with its turn. Issue #79 asks whether to reconcile them.

## 5. Out of scope

- The tracking model: affirmed Boundaries and text-relocating operations, which would make
  Section membership a fact the app operates on rather than something the Guide infers.
- Multi-user scoping beyond one Team of two: House sharing, per-publication sets, and
  collaboration.
- Any harness that scores the Guide's output.
- The ideas parked in [`later.md`](./later.md).
