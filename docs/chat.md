# The Chat, Offers, and Proposals

What the Chat is and how it behaves, both halves — `src/client/chat/` for the Panel and the
Ledger, `src/server/article-agent.ts` for `recordOffers` and the tool registry. The
cross-module rules it obeys are [`architecture.md`](./architecture.md); the Plan ops a
Proposal carries are [`plan.md`](./plan.md); the words are [`context.md`](./context.md).

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

## The Offers Ledger

The Chat turns up Offers — Links and Quotes — as rows in the Article Agent's `offer`
collection, synced to every connected client ([`sync.md`](./sync.md)). The **Ledger** is a
View over all the Offers surfaced in this Chat. Offers can be **Undecided**, **Accepted**,
or **Declined** (restorable).

The Ledger is a sibling to the chat transcript rather than a replacement for it, toggled on
or off within the Chat Panel to see something specific about the Chat. It does not do the
job of another Panel: when an Offer is Accepted it is promoted into the Plan as a new
Reference, and the Ledger's job ends there. It throws the new Reference over the wall to the
next Panel, moving curated pieces of knowledge from the first Panel to the second. The Plan
Panel's References are their own editable clones, so the Offers do not have to track them.

**The writer pastes their own References straight into the Plan**, and those carry
`provenance: { type: 'writer' }` rather than an Offer id. They do not enter the Ledger: an
Offer is something the Chat turned up and handed over to rule on, and there is nothing to
rule on in a passage the writer typed.

**Nothing announces a research turn's rows.** They land through the sync as the Guide
commits them, on the Ledger of every connected client — which is what deleted `listOffers`
as a `@callable`, the Ledger's load-once contract, and the reload the Chat threaded through
when it read fresh ids out of the transcript. The Chat still reads that tool output, for the
Offer cards it draws in the transcript.

**A retrieved Offer is the same row as a recalled one.** `provenance` is `writer` or `offer`
and says nothing about whether the Chat looked the source up or remembered it. How to mark
that on an Offer and on the Reference it becomes is open, and waits on #40.

## Deduplication

**One Offer per source per Article**, and neither half of the check compares the Plan's
content. Asking whether an Offer is already in the Plan runs on the Provenance instead: the
writer edits their copy, and content stops matching the moment they do.

The fingerprint is the type, the text, and the source, and not the note. Two mechanisms
carry the constraint, and both are load-bearing:

- **The map in `recordOffers` is the working path.** It runs inside the Article Agent rather
  than over RPC — the writer never authors an Offer, so nothing on the client may. It builds
  a fingerprint map from the table, dedupes the incoming batch against it, and hands back
  the row already there rather than writing a second one, still carrying the disposition the
  writer gave it.
- **`offer_one_per_fingerprint` is the guard the map cannot be.** `recordOffers` has to
  reach `commit()`; party-db's queue defers the commit to a microtask even against embedded
  SQLite, and the AI SDK runs a step's parallel tool calls concurrently — so two calls of one
  step can both read before either wrote, and the map is built from the table, so an
  uncommitted call is invisible to the one beside it. A UNIQUE index over a stored
  `fingerprint` column refuses the second write. `recordOffers` then re-reads, re-dedupes
  against what landed, and commits the remainder.

This is `round_one_running` one table over ([`reviews.md`](./reviews.md)), on a sharper
constraint: the Review guard needs a hibernation to race, and this one needs only an await.
If the Offers stop syncing, the dedupe is a synchronous read-and-insert again and the index
can go.

**One Offer becomes one Reference**, and `planSchema` refuses a Plan carrying two copies of
one. `referenceForOffer` answers with the first match on the strength of it, and that answer
is what makes a retried Accept build no op — so a second copy would turn every retry into
another copy.

## Accepting an Offer

**Accepting is two writes against two stores, and nothing makes them atomic.** The copy goes
first, with a `createReference` op through the applier like every other Plan edit, then
`setOfferDisposition` over RPC. This way round a failure does not create an unrecoverable
middle state. The Plan write is local, so as long as it succeeds the RPC can fail and the
only consequence is an Undecided Offer in the Ledger. If the writer Accepts again,
`acceptOffer` returns `null` and builds no op at all.

**The other order strands the writer, which is why the order is fixed.** Ruling first leaves
the row reading Accepted with the Plan holding nothing. That state is invisible on the
Ledger, because the Ledger shows a ruled Offer as settled and does not read the Plan to
check. It is also unfixable from the Ledger, because no control re-runs the copy for an
Offer already Accepted. Nothing recovers it, and nothing surfaces it.

**A refused copy stops the ruling for the same reason.** `edit` hands back the applier's
refusal, and `useOfferLedger` reads it: sending the ruling anyway would land the app in
exactly that stranded state. The writer gets the applier's sentence instead, built at the
edge from `refusal.reason` like every other one ([`plan.md`](./plan.md)).

## Proposals

**Proposals are not Offers.** An Offer is a piece of research to rule on; a Proposal is a
change to the Plan to rule on. The Chat can make Proposals, and the writer applies them —
Accepting is `edit(ops)`, the same call every Plan edit makes.

**A refused Accept answers nothing and leaves the card open.** The card shows the applier's
sentence, the writer may fix the Plan and Accept again, and Declining sends that sentence
back — so the model learns the Plan moved rather than that the writer said no.

**Proposals are `execute`-less tools** (AI SDK v7). A tool with no `execute` suspends for the
client, which is the Proposal. Four call-site details, each easy to get wrong:

- Use `addToolOutput`, not the deprecated `addToolResult`, and call it **without `await`** —
  the docs warn twice about deadlock.
- `addToolApprovalResponse` takes `part.approval.id`, not `toolCallId`.
- `needsApproval` and `toolApproval` both gate a server-side `execute` this product does not
  have, so neither does anything here.
- A rejection returns `is_error: true` with the reason in the content.

**The research tool carries an `execute`, where the Proposal tool does not.** An Offer is an
inert row rather than something the writer rules on mid-turn, so suspending the call would
buy nothing and cost the turn — a research turn returns seventeen items, and an unruled tool
batch stalls the Chat with no orphan timeout ([`carries.md`](./carries.md)). Suspend-or-execute
is decided per tool rather than for the registry.

**The Plan goes in `body` rather than `metadata`.** `body` is request-only and does not enter
the transcript; `metadata` persists on the `UIMessage` and re-rides every turn, and the Plan
is both large and stale by the next turn. A small value that should persist — a person id,
say — is what `metadata` is for.
