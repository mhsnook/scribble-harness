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

The Notes Panel shows the same rows flattened into a queue. Ruling in either
place is one write, because both draw the same rows.

## Depth

`quick` or `thorough`, chosen beside the composer. It changes the reviewer's
instructions and nothing else — the writer's own prompt still does the finer
steering.

## Anchors

A Note points at the whole piece, one Section, or a run of Blocks. A run means
the span from its first Block to its last; the Guide names the ends, and the
stored anchor carries every Block in the span.

Anchors are **stored as ids and read as positions**: the record holds a Block id,
and the card shows "¶3". The ids survive the prose moving; the positions do not.

An anchor is settled once, when the Note is written, against the Plan and Draft
the model was shown. One naming something that was never there falls back to the
whole piece. A Block deleted later drops out of the run and the rest still hold,
so a Note on ¶3–¶5 reads as ¶3–¶4 once ¶5 goes. A Note whose every Block is
gone, or whose Section is, reads as orphaned — the writer may undo the deletion,
and the Note is still theirs to resolve.

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

A saved review prompt, picked from the composer. It lives in the House's `skill`
collection, so a Skill saved on one machine is on the other —
[`house.md`](./house.md). Saving under a name that is taken replaces that Skill.

They lived in `localStorage` until the House arrived; those are carried into the
room once, on the first open.

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

A Note's anchor is settled once, at write time, against the Plan and Draft the model was
shown. An anchor the client cannot resolve reads as the whole piece and breaks nothing, so we
take the write and settle the anchor rather than refusing the Note (issue #42).

## Not built

A Review does not stream, and it should. Its Notes arrive live as rows, but the Round's prose
lands whole. The streaming version is `streamObject` over the Agent's `onRequest` (issue #77),
and it costs less than it looks, because the Round is durable — the wait is a row rather than
a call held open.

Also open: scoping a Review to one Section (#78), notes drawn beside the prose (#81), the
last-save gap (#82), and grouping the queue by Section (#83).
