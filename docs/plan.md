# The Plan

The Plan is one JSON blob in Article Agent state. This file is the module: the shape,
the ops that change it, and the applier that refuses a bad change. The cross-module
rules — who may write the blob, and how a Proposal reaches it — are
[`architecture.md`](./architecture.md). The decision record is
[ADR 0002](./adr/0002-the-plan-data-model.md).

The code is `src/shared/plan/` (schema, ops, applier, Scope resolver, word-count
arithmetic) and `src/client/plan/` (the edits, the writer, the refusal text).

## Shape

```
plan: {
  title, totalTarget,
  voice, adjectives: [],
  outline: [ { id, title, intent?, target?, voice?, adjectives?: [], children: [] } ],
  references: [ { id, type, provenance, text?, source?, nodeId, note? } ],
}
```

- **The Outline is a nested tree**, sibling order carried by array position, every Section
  with a stable ID that stays put for the life of the Section. What the writer reads is that
  position, worked out in `outlineEntries`: the bare `ordinal` for a gutter of them and for a
  phrase that composes one ("Section 2"), and `sectionLabel` for the standalone form ("§2").
  Both come from the one walk, so no two Panels can number a Section differently.
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

## One spelling per state

A field that may be absent says "nothing here" by being absent, and not also by an empty
string or an empty list. The blob is written whole, compared whole-field by a Proposal's
`expected`, and sent whole in every prompt pack, so two Plans that mean the same thing
should be the same, field for field. The schema enforces this today: an empty `adjectives`
on a Section is refused.

Some fields always carry their key and indicate "nothing here" with a value; others are
absent when empty. **Choosing for a new field: a question the record is always asked carries
its key and answers with a value, and a Section's own refinement is absent until it is set.**
`nodeId`, `totalTarget`, and `children` are the first kind — every Reference has a placement
even when unplaced. `intent`, `target`, and `voice` are the second. Read which one a field
takes off `src/shared/plan/schema.ts` rather than from a list here.

## The schema guards client writes

`validateStateChange` parses the whole Plan on every write. The model's outputs do not go
through it — the Chat proposes and the client applies, so the blob holds client writes only.
What the model does meet are the **piece** schemas, `outlineNodeSchema`, `referenceSchema`,
and `sourceSchema`, reused inside a Proposal's op payloads.

Four invariants sit above the object shape, checked in the same parse:

1. A Section id is unique among Sections.
2. A Reference id is unique among References.
3. No two References were copied from one Offer.
4. A placed Reference names a node that exists.

The last one means an op that deletes a node unplaces its References in the same Proposal,
because the Plan is written whole and validated whole.

## Size

A normal Plan runs about 40 KB. The soft ceiling is around 100 KB, where re-broadcasting on
every write gets noticeable; the hard wall is 2 MB, the Durable Object limit on a single row
or value. Growth comes from References carrying long passages. The relief valve is moving
References into SQLite rows, which is the phase 2 move anyway. **Debounce `setState` while
the writer types**, or 40 KB goes over the wire per keystroke.

## Proposal shape

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
- **If any op's `expected` fails, the whole Proposal is Stale.** Whole-field comparison is
  conservative and will refuse a Proposal against a field the writer has since touched, so
  the card says why — [`ui.md`](./ui.md).

**Staleness is not a multi-client problem.** It comes from the gap between generating a
Proposal and applying it, and inference is slower than typing, so it exists with one writer
in one tab. We are strict about marking Proposals Stale today, and heuristics that forgive
more are open.

## The ops

**Thirteen**, in `src/shared/plan/ops.ts`: `createNode`, `moveNode`, `mergeNodes`,
`deleteNode`, `setTitle`, `setIntent`, `setTarget`, `setVoice`, `setAdjectives`,
`placeReference`, `createReference`, `deleteReference`, `setReference`.

**The Chat is offered ten of them.** The three Reference ops are how the writer pastes a
Reference in themselves, and `chatProposalSchema` leaves them out of the tool the model
sees — research reaches the Plan by being Accepted from an Offer, and handing a model
`createReference` would be a way round the Ledger. The applier takes all thirteen, because
the writer's own paste goes through it too.

A content op reads `nodeId: null` as the Article Scope, so setting the Article's Voice and
setting one node's Voice are one op rather than two. Two ops carry a consequence worth
stating:

- **`deleteNode` unplaces every Reference placed at the node it removes or at any node
  below it**, because the Plan is written whole and a Reference naming a node that is gone
  does not parse.
- **`mergeNodes` keeps the target's own fields**, moving the source's children and placed
  References onto it, so a Proposal that wants the source's intent note carried over says so
  with a `setIntent` op in the same batch.

**The op payloads are strict, and a rejected tool call retries with the validation error.**
The piece schemas the payloads reuse are `strictObject`, so a model that adds one field
fails the whole tool call rather than having the field stripped. Stripping would produce a
Proposal the model did not make, and the writer would rule on it without seeing what was
dropped. The cost is real: a model that adds the same field every time thrashes the retry
instead of converging, and the answer to that is naming the field in the schema, not
loosening every payload to strip.

## The applier refuses with a reason

`applyProposal` in `src/shared/plan/apply.ts` returns either a new Plan or a refusal naming
which op failed, its position in the Proposal, and what it expected against what it found.
It sorts refusals into four types, listed on `RefusalType` where they cannot drift away from
the union. It also parses the Plan it produces, so a Proposal the Article Agent would reject
is refused here, where there is a reason to show, rather than there, where there is none.

**A refusal has two readers, the LLM and the human.** `refusal.message` is for the model's:
a Declined Proposal sends it back, so it names the op and the ids and may run long. The
writer's sentence is built at the edge from `refusal.reason` — a closed code naming exactly
what went wrong — plus the records it is about, in `src/client/plan/refusalText.ts`. The
Panel that shows it holds the Plan, so it can name a Section the way the Outline numbers it,
where the applier only has an id.

Two things follow. **One English string lives in `src/shared`**, aimed at an LLM. The
writer's half is a table over a closed union, so a second language would be a second table
rather than a sweep through the applier. `refusalText.ts` is total over `RefusalReason`, so
a new refusal site stops it compiling until it says what the new one reads as.

## The client's own edits

**The Plan Panel's edits are ops, and the applier applies them.** A field the writer types
in builds the same op a Proposal would carry, `src/client/plan/edits.ts` reads its
`expected` out of the Plan on screen, and `applyProposal` produces the Plan that goes to
`setState`. One write path means the Panel cannot make a change the applier would refuse,
and a structural edit gets the consequences the ops already state — deleting a Section
unplaces its References. The writer's own edits do not go Stale: staleness is the gap
between generating a Proposal and applying it, and there is no gap here.

**One writer holds the Plan and the debounce**, in `src/client/plan/writer.ts`. It applies
each edit locally, sends after a pause for the four ops a keystroke produces, and sends at
once for everything else. An update arriving from the Article Agent over an unsent edit is
the echo of an older write and is dropped — the client is the Plan's only writer, so there
is nothing else it can be.
