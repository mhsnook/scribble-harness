# The Plan

One JSON blob in Article Agent state. Code in `src/shared/plan/` and `src/client/plan/`;
decision record in [ADR 0002](./adr/0002-the-plan-data-model.md).

```
plan: {
  title, totalTarget,
  voice, adjectives: [],
  outline: [ { id, title, intent?, target?, voice?, adjectives?: [], children: [] } ],
  references: [ { id, type, provenance, text?, source?, nodeId, note? } ],
}
```

## Shape

The Outline is a nested tree. Array position carries sibling order, and every Section keeps a
stable ID for its lifetime. `outlineEntries` walks the tree once and produces both forms the
writer reads: `ordinal` for a gutter and for a composed phrase ("Section 2"), and
`sectionLabel` for the standalone form ("§2"). One walk means two Panels cannot number a
Section differently.

References are flat and carry an optional `nodeId`, so an Accepted Reference can sit at a
Section or nowhere yet.

A Reference has type Link or Quote. We assign the type rather than deriving it from the
contents, so an Offer and the Reference it becomes carry the same `type`. Amended in
[ADR 0002](./adr/0002-the-plan-data-model.md).

Voice cascades and Adjectives compose. Both resolve at read time down the same path — House,
then Article, then Section. The nearest Voice wins outright. Adjectives accumulate instead, so
a "slow" Section inside a "fast" Article carries both; the resolved list runs widest first, so
the nearest term lands last and reads as the strongest. Restating a term moves it to the end,
which lets the writer repeat it for emphasis.

We store the word-count total rather than summing it. The parts may disagree with the whole,
and that gap tells the writer about under- or over-allocation.

## One spelling per state

A field that may be absent says "nothing here" by being absent, and not also by an empty
string or an empty list. Two Plans that mean the same thing must match field for field,
because we write the blob whole, compare it whole-field against a Proposal's `expected`, and
send it whole in every prompt pack. The schema enforces this today by refusing an empty
`adjectives` on a Section.

Some fields always carry their key and answer with a value; others are absent until set. To
choose for a new field: a question the record is always asked carries its key, and a Section's
own refinement stays absent until the writer sets it. `nodeId`, `totalTarget`, and `children`
take the first form, because every Reference has a placement even when unplaced. `intent`,
`target`, and `voice` take the second. Read `src/shared/plan/schema.ts` for which form a field
takes.

## Validation

`validateStateChange` parses the whole Plan on every client write. Model output never reaches
it, because the Chat proposes and the client applies. The model meets the piece schemas
instead — `outlineNodeSchema`, `referenceSchema`, and `sourceSchema` — which a Proposal's op
payloads reuse.

The same parse checks four invariants above the object shape:

1. A Section id is unique among Sections.
2. A Reference id is unique among References.
3. No two References were copied from one Offer.
4. A placed Reference names a node that exists.

Invariant 4 means an op that deletes a node must unplace its References in the same Proposal,
because we write and validate the Plan whole.

## Size

A normal Plan runs about 40 KB. Above roughly 100 KB, re-broadcasting on every write gets
noticeable. The hard wall is 2 MB, the Durable Object limit on one row or value. Growth comes
from References carrying long passages, and the relief valve is moving References into SQLite
rows, which is the phase 2 move anyway.

`setState` is debounced while the writer types. Without that, 40 KB goes over the wire per
keystroke.

## Proposals

A Proposal is a list of ops, applied all-or-nothing.

```
proposal: [
  { op: 'createNode', parentId, beforeId, node: { id, title, intent, children: [] } },
  { op: 'setTarget',  nodeId, expected: null, value: 400 },
]
```

`expected` names the value the Proposal thinks is in the field, rather than a version. We
compare it whole-field, because Plan fields are short. If any op's `expected` fails, the whole
Proposal is Stale, and the card says why ([`ui.md`](./ui.md)).

Structural ops anchor on IDs and carry no `expected`. Each takes exactly one of `afterId` or
`beforeId`, so the model anchors to whichever neighbour its insertion relates to: a Section
leading into §3 says `before: §3` and survives §2 being deleted. `afterId: null` means first
child; `beforeId: null` means last child.

Staleness comes from the gap between generating a Proposal and applying it. Inference is
slower than typing, so staleness exists with one writer in one tab and is not a multi-client
problem. We are strict about it today, and more forgiving heuristics are open.

## The ops

Thirteen, in `src/shared/plan/ops.ts`: `createNode`, `moveNode`, `mergeNodes`, `deleteNode`,
`setTitle`, `setIntent`, `setTarget`, `setVoice`, `setAdjectives`, `placeReference`,
`createReference`, `deleteReference`, `setReference`.

`chatProposalSchema` offers the model ten of them. It withholds `createReference`,
`deleteReference`, and `setReference`, which are how the writer pastes a Reference in
themselves, so that research reaches the Plan only by being Accepted from an Offer. The
applier takes all thirteen, because the writer's own paste goes through it.

A content op reads `nodeId: null` as the Article Scope, so setting the Article's Voice and
setting one node's Voice use one op rather than two.

Two ops carry a consequence worth stating. `deleteNode` unplaces every Reference placed at the
node it removes or at any node below it, because a Reference naming a deleted node does not
parse. `mergeNodes` keeps the target's own fields and moves the source's children and placed
References onto it, so a Proposal that wants the source's intent note must add a `setIntent`
op to the same batch.

The op payloads are `strictObject`. A model that invents one field fails the whole tool call
and retries with the validation error. Stripping the field instead would hand the writer a
Proposal the model did not make, with no sign of what was dropped. The cost is real: a model
that adds the same field every time thrashes the retry rather than converging, and the fix
for that is naming the field in the schema, not loosening every payload.

## Refusals

`applyProposal` in `src/shared/plan/apply.ts` returns either a new Plan or a refusal naming
the op that failed, its position in the Proposal, and what it expected against what it found.
`RefusalType` lists the four kinds, in the union so they cannot drift. `applyProposal` also
parses the Plan it produces, so a Proposal the Article Agent would reject gets refused here,
where there is a reason to show.

One refusal serves two readers. `refusal.message` goes back to the model with a Decline, so it
names the op and the ids and may run long. `src/client/plan/refusalText.ts` builds the writer's
sentence from `refusal.reason` — a closed code — plus the records it names. The Panel holds
the Plan, so it can name a Section the way the Outline numbers it, where the applier has only
an id.

So `src/shared` carries one English string, aimed at the model, and the writer's half is a
table over a closed union. A second language would be a second table rather than a sweep
through the applier. `refusalText.ts` is total over `RefusalReason`, so a new refusal site
stops it compiling until it says what the new one reads as.

## The client's own edits

A field the writer types builds the same op a Proposal would carry.
`src/client/plan/edits.ts` reads `expected` from the Plan on screen, and `applyProposal`
produces the Plan that goes to `setState`. One write path means the Panel cannot make a change
the applier would refuse, and a structural edit gets the consequences the ops already state.
The writer's own edits never go Stale, because there is no gap between generating and applying
them.

`src/client/plan/writer.ts` holds the Plan and the debounce. It applies each edit locally,
sends after a pause for the four ops a keystroke produces, and sends at once for everything
else. It drops an update that arrives from the Article Agent over an unsent edit, because the
client is the Plan's only writer and that update can only be an echo of an older write.
