# The House: four collections, and a message in front of the pack

Status: accepted

[ADR 0001](./0001-phase-1-storage-shape.md) put the House in one party-db room over D1 and
left its shape open. Issue #53 named that shape as 1b's one genuinely unspecified thing:
what collections the House defines, and how its material reaches the Guide's context.
Defining the collections is the API, so this decides both at once.

## Four collections, not one document

`lexicon`, `rule`, `skill`, and `tone`. The first three are lists the writer adds to and
drops from; the fourth is exactly one row.

**The standing rules are a list of rules rather than one text.** Either would reach the
model as a block of lines. The list wins on editing: the writer drops the second rule
without retyping the other four, and reorders them without a merge. It costs a table where
a column on `tone` would have done, and it buys a rule its own id — which is what a later
"where did this Note come from" would need.

**The House Tone is one row rather than a row per term.** A Voice is a single value and
Adjectives are a list, so a row per term would need a `kind` column and would let two rows
claim to be the Voice. `ScopeTerms` is `Pick<OutlineNode, 'voice' | 'adjectives'>`, and one
row maps onto it directly.

**A Lexicon entry carries Provenance**, the way a Reference does — `context.md` says so, and
this is where it lands. Nothing builds an entry from an Offer today, so every entry reads
`{ type: 'writer' }` and the column is a JSON text like `offer.source`. It is here rather
than deferred because the alternative is a migration on a table the writer already has rows
in.

## The House takes client writes

The Article Agent refuses a party-db write POST with a 403: its rows are guide-written, and
the rulings' guards live on `@callable` RPC. The House is the opposite case — every row is
the writer's to author and no guard sits between them and it — so `PartyDbServer.onRequest`
forwards to `handleWrite` unchanged.

This is what makes the House cheap. There is no endpoint, no query key, and no
invalidation: `collection.insert(row)` is the write, and the row coming back down the socket
is the read.

## The House reaches the Guide as one message, not as a system prompt

`docs/llm.md` orders the stable prefix: the system prompt, then the Lexicon entries in play,
then the standing rules. Two ways to honour that, and we take the second.

**Rejected: build the House into the system prompt.** It reads best — the standing rules are
instructions, and instructions belong in a system message. But the system prompt is
identical on every turn of every Article today, which is the property that makes it a cached
prefix worth having, and a system message after the first is not portable across providers
(the reason `planMessage` is already a `user` message).

**Taken: one `user` message in front of everything volatile.** `houseMessage` renders the
Lexicon entries in play, the standing rules, and the House Tone, and both packs put it
first. The House changes rarely, so the prefix is still stable per writer rather than per
turn. It is null where the House is empty, so a writer who has authored nothing pays no
tokens.

## A term is in play when the turn invokes it

`context.md` says a Lexicon entry is injected "whenever the term is invoked", and
`lexiconInPlay` is that rule: a whole-word, case-insensitive match against the turn's own
material. The alternative is sending the whole Lexicon on every turn, which is stabler for
caching and grows without bound — a Lexicon accumulates for as long as the writer uses the
app, and a piece about batteries does not need the term they defined for obituaries.

The cost is real and worth stating: the House message now varies with the Article, so the
prefix caches per Article rather than per writer. The standing rules and the Tone do not
vary, and they are the larger half of the message for most writers.

## Consequences

- **Two Durable Object classes exist**, which ADR 0001 predicted. Phase 2 adds the Draft to
  a party-db setup that already runs.
- **The Article Agent reads the House over D1, not over a socket.** It needs the House once
  per turn and holds no view of it between turns, and the tables are in the D1 it is already
  bound to. A second sync client inside the Durable Object would buy nothing.
- **The Scope resolver's `house` argument is now passed.** It was written to take one from
  the first commit, so 1b changed no shape.
- **Skills move out of `localStorage`**, and a Skill saved on one machine is now on the
  other. The old key is carried across once and cleared.
- **A House row has no per-row access control**, and cannot have one while party-db has none
  (party-db#33). This survives while both people may read everything, and stops surviving the
  moment that changes.
