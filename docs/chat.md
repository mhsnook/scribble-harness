# Chat, Offers, and Proposals

Client code in `src/client/chat/`; server code in `src/server/article-agent.ts`. The Plan ops
a Proposal carries are [`plan.md`](./plan.md).

The Article Agent extends `AIChatAgent` from `@cloudflare/ai-chat`. Importing
`agents/ai-chat-agent` throws, because the class moved. `AIChatAgent` routes a turn to
`onChatMessage`, and the Chat rides the socket the Plan and the RPC already share. The
transcript stays in the Agents SDK's own store.

`useArticleChat` holds the wiring — the transcript, the composer, and the two rulings — and
`ChatPanel` renders it, the way `PlanPanel` takes a Plan and one `edit`. Both the app and the
Storybook showcase call `ruleProposal`, so a story cannot rule differently from the product.

## The Offers Ledger

The Ledger is a view on the Chat's Offers. An Offer is Undecided, Accepted, or Declined, and
a Declined one can be restored. Accepting copies the Offer into the Plan as a Reference, and
the Ledger's job ends there.

The Plan's References are editable clones, so the Ledger does not track them afterwards.

Research rows arrive through the sync as the Guide commits them, so nothing announces them.
That is why `listOffers` is no longer `@callable`, and why the Chat no longer reloads the
Ledger from ids in the transcript. The Chat still reads the tool output to draw its Offer
cards.

`provenance` records `writer` or `offer`. It does not say whether the Chat searched for a
source or recalled it from memory; issue #40 covers marking that.

## Deduplication

We allow one Offer per source per Article. The fingerprint covers the type, the text, and the
source, and excludes the note. Neither check compares the Plan's content, because the writer
edits their copy and a content match breaks as soon as they do; to ask whether an Offer
already reached the Plan, compare Provenance.

`recordOffers` does the everyday work. It runs inside the Article Agent rather than over RPC,
because the writer never authors an Offer. It builds a fingerprint map from the table,
dedupes the incoming batch against it, and returns the existing row — with the disposition
the writer gave it — instead of writing a second one.

The UNIQUE index `offer_one_per_fingerprint` catches what the map cannot. `recordOffers` has
to reach `commit()`; party-db defers that commit to a microtask even against embedded SQLite,
and the AI SDK runs a step's parallel tool calls concurrently. Two calls in one step can
therefore both read the table before either writes, and the map cannot see an uncommitted
sibling. The index refuses the second write, and `recordOffers` then re-reads, re-dedupes
against what landed, and commits the remainder.

If the Offers stop syncing, the dedupe becomes a synchronous read-and-insert and the index
can go.

`planSchema` refuses a Plan holding two References copied from one Offer.
`referenceForOffer` returns the first match, which is what makes a retried Accept build no op.

## Accepting an Offer

`accept()` writes the Plan first and rules the Offer second, because the copy needs nothing
that the ruling returns.

If the ruling fails, the Offer stays Undecided and the writer can Accept again. If the ruling
ran first and the Plan write then failed, the Ledger would show a settled Offer with nothing
in the Plan, and no control re-runs the copy. `useOfferLedger` also stops on a refused copy
and shows the applier's sentence, for the same reason.

## Proposals

A Proposal is a change to the Plan that the writer rules on. Accepting one calls `edit(ops)`,
the same call every Plan edit makes.

A refused Accept leaves the card open and shows the applier's sentence. The writer can fix the
Plan and Accept again. Declining sends that sentence back, so the model learns that the Plan
moved rather than that the writer said no.

A Proposal is a tool with no `execute`, which under AI SDK v7 suspends for the client. Four
call-site details are easy to get wrong:

- Call `addToolOutput`, not the deprecated `addToolResult`, and call it without `await`. The
  docs warn twice about deadlock.
- Pass `part.approval.id` to `addToolApprovalResponse`, not `toolCallId`.
- Skip `needsApproval` and `toolApproval`. Both gate a server-side `execute` that this product
  does not have.
- A rejection returns `is_error: true` with the reason in the content.

The research tool does carry an `execute`, because an Offer is an inert row rather than
something the writer rules on mid-turn. Suspending that call would stall the Chat — a research
turn returns seventeen items, and nothing times out an unruled tool batch
([`carries.md`](./carries.md)). We decide suspend-or-execute per tool rather than for the
registry.

The client sends the Plan in `body` rather than `metadata`, because `metadata` persists on the
`UIMessage` and re-rides every turn, and the Plan is large and stale by the next turn. A small
value that should persist, such as a person id, is what `metadata` is for.
