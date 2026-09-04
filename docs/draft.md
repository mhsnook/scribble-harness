# The Draft

Phase 2, at low resolution, decided now so 1a cannot paint itself into a corner. The Draft is
built and persists. The Guide, the ambient half of the Notes Panel, and everything else that
reads the prose are not. Editor decision in [ADR 0003](./adr/0003-the-draft-editor.md).

## Storage

The Draft stores one row per Block, meaning per paragraph. A row per Section would make
Section Boundaries a storage fact, and they are approximate and inferred. A list or a
blockquote is also one Block: a Block is a top-level child of the document, whatever kind it
is.

The client edits the Draft locally and persists it to the server. We ruled out a
server-authoritative ProseMirror step stream, because the client is the Draft's only writer,
the same way it is the Plan's.

A Block is a row in the Article Agent's SQLite, written over `@callable` RPC. A save carries a
delta rather than the whole Draft, which is what bounds a stale tab: a client can only name a
Block it has already seen, so it cannot delete a paragraph written somewhere else.

The Draft is not synced, and it can move onto a party-db collection later without changing
shape ([`sync.md`](./sync.md)). Until then, two tabs on one Draft give last-write-wins per
Block, which is what one-editor-at-a-time costs. Findings #7 and #18 stand and are not
load-bearing yet.

## The editor

The Draft is a ProseMirror document built with TipTap. The reason is narrow: ProseMirror draws
a decoration as part of the document's layout while keeping it out of the document's content,
which is what the Guide needs to show anything beside the prose without writing it. Marks
decide nothing, because every candidate editor stores a comment as one.

So a Proposal is a decoration and an accepted annotation is a mark. A proposed section break
parts the paragraphs and reaches no stored row. A comment rides in the prose, because a mark
survives the writer rewriting around it in a session that never drew the note.

A comment is not a Block reference. It is a set of marked runs spanning any number of Blocks,
targeting the span from its first to its last.

The writer types their own headings and section breaks. Boundaries are inferred, so nothing
can place a title automatically, and writer control is the tiebreaker. What the writer typed
then becomes the strongest hint the inference has.

## The guide loop

The client initiates the guide loop, and v1 carries no server-side timer. The client knows
when typing stopped; the server cannot tell "still thinking" from "left the room." An alarm
earns its place when work must happen while nobody is connected, and no such work exists yet.
A stale Proposal or an orphaned tool batch expires lazily on read.

Guidance notes do not stream. A Review is the thing that should — [`reviews.md`](./reviews.md).
