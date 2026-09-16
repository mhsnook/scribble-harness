# Reviews and Notes

## The loop

The writer types what a Review should look for and runs it. The Guide reads the
Draft against the Plan and writes back a **Round** — a response the writer reads
top to bottom. Each Round carries **Notes**: short markers pinned to a place in
the piece. The writer accepts or declines each one, and resolves an accepted one
once they have dealt with it.

No transcript accumulates between Reviews. Each is handed only the Draft, the
Plan with its References, the writer's prompt, and the Notes accepted from
earlier Rounds. The Notes Panel is one ask and one answer, not a conversation.

## A Round is a written response

Its body is an ordered run of **passages**, each a passage of the Guide's prose
and then the Notes that passage produced. The prose carries the argument, so a
Note can be short — roughly 15 to 35 words, because the writer has just read the
case for it.

## The Panel shows one Round, and the ledger shows them all

The Notes Panel works the way the Chat Panel works. An ask makes a Round the way
a message makes a turn, and the Panel shows the newest one: its prose, and the
Notes each passage produced. Asking again moves the Panel onto the Round it
started, running and all. A picker in the header reads an earlier Round.

The other view is the **ledger** — every Note on the Article, newest Round
first, in a drawer over the Round the Panel is showing. It is the sibling of the
Offer ledger in `chat.md`, down to leaving the composer uncovered.

The ledger grades rather than filters. Nothing is hidden, and how much room a
Note takes says how much is left to do with it:

- **proposed** — a card, with accept and decline.
- **accepted** and **resolved** — one line, opening back into the card.
- **declined** — a count per Round, opening into lines.

Ruling in the Round, in the ledger, or beside the prose is one write, because
all three draw the same rows.

## Accepted Notes are drawn beside the prose

An accepted Note pointing at paragraphs also appears in the Draft's margin,
level with the first paragraph it names, with a rule down that paragraph's left
— issue #81, screen 3(d). It is there whether the Notes Panel is open or not,
because what the writer still owes the piece belongs next to the piece.

Two cards that would overlap are pushed down rather than drawn over each other,
so a card can sit below its own paragraph. They are placed by measuring, since
the prose and the margin are columns of different lengths.

**The rule is drawn, never stored.** It is a ProseMirror decoration, which
`docs/adr/0003` reserves for exactly this: something drawn with the prose and
kept out of it, so it never syncs and never reaches the Final. Reading the
document's own children to place it also settles #54's trap, where a bare
`[data-block-id]` matches a paragraph nested in a list item.

A Note about the whole piece has no paragraph to sit beside and stays in the
Panel.

## Depth

`quick` or `thorough`, chosen beside the composer. It changes the reviewer's
instructions and nothing else — the writer's own prompt still does the finer
steering.

## Anchors

A Note points at a run of Blocks or at the whole piece. A run means the span
from its first Block to its last; the Guide names the ends, and the stored
anchor carries every Block in the span.

There is no Section anchor. An observation about a Section lands on the
paragraphs the Draft wrote for it, or on the whole piece where the Draft has not
written it yet. Every anchor resolves against the Draft alone.

Anchors are **stored as ids and read as positions**: the record holds a Block id,
and the card shows "¶3". The ids survive the prose moving; the positions do not.

An anchor is settled once, when the Note is written, against the Draft the model
was shown. One naming a Block that was never there falls back to the whole
piece. A Block deleted later drops out of the run and the rest still hold, so a
Note on ¶3–¶5 reads as ¶3–¶4 once ¶5 goes. A Note whose every Block is gone
reads as orphaned — the writer may undo the deletion, and the Note is still
theirs to resolve.

### The Guide names a paragraph by its number

The Draft in the prompt is numbered — ¶1, ¶2 — and a Note names those numbers.
`anchorFor` reads them back into Block ids against the very Blocks the prompt
numbered, and the id is what gets stored, so the anchor still survives the
paragraph moving.

**The Guide never sees a Block id.** It already writes "¶5" in the body of a
Note it means for ¶5, so asking it to also copy a 36-character id for that same
paragraph was a second chance to get it wrong.

### What the Guide writes is not the shape that is stored

`writtenNoteSchema` in `shared/review.ts` is flat: one object, with a required
`paragraphs` array that is empty for a Note about the whole piece.

The stored anchor is a union, and a union reaches a model as a JSON Schema
`oneOf` — here one whose whole-piece branch needs a single field where its
run-of-Blocks branch needs two. Under the constrained decoding Workers AI runs,
that is a thumb on the scale for the branch that says nothing, and it showed:
Reviews came back naming the paragraph in the body text — "¶5 states 2+2=17" —
while anchoring to the whole piece. Saying it more firmly in the prompt did not
move it. With one shape and one array, naming no paragraph is as deliberate an
act as naming one.

A Note the Guide addressed to the whole piece and a Note whose paragraphs the
Draft does not carry draw the same card, so a lost anchor is invisible on
screen. The Article Agent logs one warning naming what the Guide asked for,
which is how a Review that keeps missing is told apart from one answering
broadly.

## Dispositions

- **proposed** — what the Guide wrote.
- **accepted** — the writer means to act on it. This is what they still owe the
  piece, and what the next Review is told about.
- **declined** — ruled out.
- **resolved** — an accepted Note they have dealt with. Hidden until asked for.

Restoring undoes the last move. Each settled disposition has exactly one place it
came from, so undoing needs no history.

**A Review is told about the accepted Notes only.** Re-raising something the
writer is already working on is noise. Whether it should also see the declined
ones is open — the current answer is no.

## Skills

A saved review prompt, picked from the composer. It belongs in the House, which
arrives at 1b; until then it lives in `localStorage`, so a Skill saved on one
machine is not on the other.

## What a Review reads

The Draft as it was last saved. The Draft's flush lives inside the Draft Panel,
so a Review run mid-keystroke can miss the last sentence. The Notes Panel numbers
its anchors off the same read, so "¶3" on a card is the paragraph the model saw.

## The Article Agent runs the Review, not the client

A Review runs long and produces a batch, so a client-run Review would be lost the moment the
writer closed the tab (issue #11). `startReview` writes a Round row, answers with it, and
carries on under `waitUntil`. Two rules follow.

First, `state` is a column rather than a field. `running` has to survive the writer leaving,
and a Review that fails with nobody connected has to leave its reason on the row rather than
on a call. A `running` row seen at wake belongs to a Review a restart cut off — the Review
itself holds the Agent awake — so `onStart` fails it and frees the guard below.

Second, one Review runs at a time per Article. A partial unique index allows at most one
`running` row. The pre-check in `startReview` gives the friendly refusal, and the index holds
when two calls interleave across an `await` (#9). A field could not do this: in-memory state
does not survive hibernation, and a check-then-write races itself.

A Note's anchor is settled once, at write time, against the Draft the model was shown. An
anchor the client cannot resolve reads as the whole piece and breaks nothing, so we take the
write and settle the anchor rather than refusing the Note (issue #42).

## Not built

A Review does not stream, and it should. Its Notes arrive live as rows, but the Round's prose
lands whole. The streaming version is `streamObject` over the Agent's `onRequest` (issue #77),
and it costs less than it looks, because the Round is durable — the wait is a row rather than
a call held open.

Also open: scoping a Review to one Section (#78), the last-save gap (#82), and grouping
the ledger by Section (#83).
