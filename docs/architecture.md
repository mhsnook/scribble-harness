# Architecture

This document records the patterns that bind more than one module. A rule earns a place here
when it can be written as: _this module does that, so this other one has to do this, or that
breaks._ Written that way a constraint carries its own expiry — when the first half stops
being true, the second half is up for review.

A fact about one module's insides goes in that module's file. A convention with no failure
behind it is a helper function or a lint rule, not an entry here. The reasoning behind each
decision lives in the wayfinding map, issue #5, and its closed tickets.

## The doc map

| File                           | Holds                                                               |
| ------------------------------ | ------------------------------------------------------------------- |
| [`context.md`](./context.md)   | The vocabulary, which governs the code, the UI, and every file here |
| [`plan.md`](./plan.md)         | The Plan blob, the ops, the applier, the refusals                   |
| [`chat.md`](./chat.md)         | The Chat, the Offers Ledger, the Proposal tool machinery            |
| [`reviews.md`](./reviews.md)   | Reviews, Rounds, and Notes                                          |
| [`draft.md`](./draft.md)       | The Draft and the guide loop — phase 2                              |
| [`articles.md`](./articles.md) | The article index and the two Article Views                         |
| [`sync.md`](./sync.md)         | party-db inside the Article Agent                                   |
| [`llm.md`](./llm.md)           | The model, search, and the prompt packs                             |
| [`ui.md`](./ui.md)             | UI decisions, and the Storybook stories it includes by reference    |
| [`carries.md`](./carries.md)   | Settings we hold and defects we work around                         |
| [`deploy.md`](./deploy.md)     | What has to be set outside the repository                           |
| [`adr/`](./adr/)               | Decision records for the storage shape, the Plan, and the editor    |
| [`later.md`](./later.md)       | Parked ideas. Use sparingly                                         |

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

Phase 2 is decided at low resolution now so 1a cannot paint itself into a corner —
[`draft.md`](./draft.md).

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

**Cloudflare throughout.** Workers, Durable Objects, D1, R2, Workers AI.

**One Article Agent per Article**, built on the Cloudflare Agents SDK. It holds everything
about one Article. It is named in full as "Article Agent" to distinguish it from the general
term or a different agent we might add later.

**House Style** arrives at 1b as a single party-db room persisted to D1, holding the writer's
own standing material — the Lexicon, the standing rules, the Skills, and House-scoped Voice
and Adjectives. It is small, read frequently, and simple CRUD over a few collections, so its
API is the PartyDB collections talking to a `PartyDbServer`. What the House is for is
[`context.md`](./context.md).

**Plain D1 tables** hold Archived Plans, Drafts, and Finals, read through a Worker endpoint
rather than synced. D1 also carries the backup story, because a Durable Object's storage has
no export path and D1 has `wrangler d1 export`.

**Hono serves the HTTP** in the same Worker: the Agents SDK's chat route, the article index,
party-db's lobby and write path at 1b, archived reads, and export.

**React + Vite with TanStack Router**, served as static assets from the Worker. **TanStack
Start does not join it** — its value is a typed server boundary in both directions, and the
Agents SDK owns the actions while the two sockets own the reads, leaving about five HTTP
calls in total. **TanStack Query** serves the article index and the archived and export
reads; live data is already reactive through Article Agent state and party-db's TanStack DB
collections.

Recorded in [ADR 0001](./adr/0001-phase-1-storage-shape.md).

## 3. Where writes go

1. **Article Agent state holds the Plan, and the client is its writer.** `setState` replaces
   the entire blob, so a write meant to change one Section rewrites every field from whatever
   version the client last read. A second writer's changes vanish with no conflict and no
   error, which is what keeps the blob to one writer.
2. **Every other per-Article record is a SQLite row in the Article Agent**, read and written
   over `@callable` RPC on the WebSocket the client already holds. That covers the Draft's
   Blocks, and Offers, Notes, and Rounds. Row writes touch named columns, so the Guide can
   append a Round while the writer Declines an Offer and neither erases the other. Adding a
   per-Article record type needs no endpoint, no store, and no sync library.
3. **A request is an action when it runs a model, and CRUD otherwise.** Actions: sending a
   Chat turn, running a Review, running research. CRUD: editing a Section, editing a
   Reference, Accepting a Proposal, Declining an Offer, retitling the Article. Accepting is
   CRUD even though a model produced the thing being accepted, because applying it is a plain
   write.
4. **The blob is a reactive store; a table is on-demand until it is published as a party-db
   collection.** A bare row in a Durable Object's SQLite has no sync — `@callable` RPC is
   request and response, so nothing tells a client it changed. That still suits Blocks, which
   the client both writes and reads. Notes, Rounds and Offers are published as party-db
   collections instead: reads are synced live queries, the Guide's writes go through
   `commit()`, and rule 2's write path still holds for what the writer sends up — rulings stay
   RPC. Which table joins them next is decided per table; the Draft is the one left, and
   [`draft.md`](./draft.md) says why it can wait.

## 4. The seams

Each entry names two sides and what has to hold between them.

### 4.1 The model proposes; the client applies

The Chat surfaces Proposals and the writer rules on them. Accepting is `edit(ops)`, the same
call every Plan edit makes, and the ops go through `createPlanWriter` rather than a `setState`
of their own. The writer holds the Plan the writer sees, so the Plan gets updated in a way
that makes sense to the writer even when server and client have drifted apart (§3, rule 1).

This is the shape we reach for across the app: **pass work from server to client as notes,
Offers, and Proposals, and let the client write them into the record.** It is a UX answer
where the alternative is a conflict-resolution answer, and it buys the reader two fewer
decisions — how to surface the change, and how to merge it — for the price of one pattern.

Two consequences worth stating here rather than in a module:

- **The applier is the one write path**, so a Panel cannot make a change the applier would
  refuse, and a structural edit carries the consequences the ops already state.
- **`chatProposalSchema` leaves the three Reference ops out of the tool the model sees.**
  Research reaches the Plan by being Accepted from an Offer, so handing a model
  `createReference` would be a way round the Ledger. The applier takes all thirteen ops,
  because the writer's own paste goes through it too.

The ops, the applier, and the refusal types are [`plan.md`](./plan.md).

### 4.2 A refusal has two readers

The applier lives in `src/shared`, so its refusal has to serve the model and the writer at
once. `refusal.message` is the model's, sent back with a Decline. The writer's sentence is
built at the edge from `refusal.reason`, a closed code, plus the records it is about — the
Panel holds the Plan, so it can name a Section the way the Outline numbers it, where the
applier only has an id.

So **one English string lives in `src/shared`**, aimed at an LLM, and the writer's half is a
table over a closed union. `refusalText.ts` is total over `RefusalReason`, so a new refusal
site stops it compiling until it says what the new one reads as.

### 4.3 The Article Agent syncs over a second socket

The `useAgent` socket carries `cf_agent_*` control frames for state, RPC, and scheduling,
which the SDK's own client handles. Namespacing party-db frames onto it was the expensive
alternative, so the sync traffic rides a second socket to the same Durable Object instead.
Two sockets cost nothing that multiplexing would not.

Four seams hold that composition together, and **every server write to a synced table goes
through `commit()`** — a raw write reaches a fresh snapshot and never an already-connected
client, because only the oplog feeds the stream. Both are [`sync.md`](./sync.md).

### 4.4 One connection per Article, opened above the Panels

`useArticleAgent` makes the single `useAgent` call and hands out three things: the Plan
channel, the Offer store built on the same socket's RPC, and the client itself, which is what
`useAgentChat` takes. The Panels read it through `ArticleProvider` rather than connecting
themselves. A Panel opening its own would be a second socket, a second `createPlanWriter`, and
a second debounce timer against a blob whose whole design is that it has one writer.

### 4.5 An Accepted Offer is copied, and the Provenance is the link

The Plan's copy is the writer's to edit; the original Offer stays as the record of what was
produced. A later correction therefore arrives as a new Proposal rather than silently
rewriting a citation the writer already approved. Asking whether an Offer is already in the
Plan runs on the Provenance rather than on content, because the writer edits their copy and
content stops matching the moment they do.

**Accepting is two writes against two stores, and nothing makes them atomic**, so the order is
fixed: the Plan copy first, then the ruling. A failed second write leaves an Undecided Offer,
which the writer can Accept again. The other order leaves the row reading Accepted with the
Plan holding nothing — invisible on the Ledger and unrecoverable from it. Details in
[`chat.md`](./chat.md).

### 4.6 The title lives in two places, and the Plan write goes first

The Plan holds the real title; the article index holds a copy written by the same client
action that renames the Article — `useTitleCopy`, debounced beside the Plan's own writer. A
Plan that lands with a failed copy leaves a stale row that the next rename corrects. The other
order would leave the list ahead of the Plan with nothing to walk it back.

That is §4.5's argument applied to the second pair of writes in the app. The index itself is
[`articles.md`](./articles.md).

### 4.7 `src/shared` is the contract, and it imports neither side

**Three source roots**: `src/client`, `src/server`, and `src/shared` for the modules both
sides import — the Plan schema, the Proposal ops, and the applier. Nothing in `src/shared`
touches a Worker binding or React, and each tsconfig lists the root once rather than naming
each domain. The Article Agent validates the same Plan the client does, off the same file, so
a Proposal the Agent would reject is refused at the edge where there is a reason to show.

`src/shared/sync.ts` is the other half of this: the wire rows are the table rows, declared
once ([`sync.md`](./sync.md)).

### 4.8 Auth gates the edge, and identity arrives at 1b

**Cloudflare Access** gates the Worker at the edge, so an unauthenticated request does not
arrive. **1a is single-author and its auth is zero code** — one Team, both people read
everything, no per-user records, so nothing parses a token.

**We avoid reading `Cf-Access-Jwt-Assertion` while we can**, because localhost has no Access
gate and so no header, which keeps development simple. The DX can change later.

**Identity arrives at 1b**, when party-db's `authorize` runs in the partyserver lobby and
needs a verified identity before the object wakes. Access injects the assertion as a header
where party-db expects `?token=` on connect, so `authorize` reads the header. Whether the
header survives a WebSocket upgrade into the Durable Object is unproven — issue #12. If it
fails, WorkOS is the documented upgrade.

**Attributing Chat messages to people is wanted and deferred past 1a.** The Agents SDK stores
a role, not a person, so it needs a field on the `UIMessage` or a parallel table. A stable
person id is small and should persist, which is what `metadata` is for
([`chat.md`](./chat.md)).

### 4.9 Accept and Decline are the same two words everywhere

A Note, an Offer, and a Proposal are all things the writer rules on, so they are ruled on with
the same two words. The three records still differ in shape — an Offer starts `undecided`, a
Note starts `proposed`, and a Proposal stores no disposition at all and dies with its turn —
and whether that is worth reconciling is issue #79.

## 5. Out of scope

- **The tracking model** — affirmed Boundaries and text-relocating operations, which would
  make Section membership a fact the app operates on rather than something the Guide infers.
- **Multi-user scoping beyond one Team of two** — House sharing, per-publication sets,
  collaboration.
- **Any harness that evaluates the Guide's output.** The Guide writes Guidance notes, and v1
  ships nothing that scores them.
- **Future ideas** parked in [`later.md`](./later.md): the public showcase, the arc note,
  Review lenses, exemplar pieces, a copy-edit pass, and Transition word-count attribution.
