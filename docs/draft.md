# The Draft

Phase 2, at low resolution. Decided now so 1a cannot paint itself into a corner. The Draft
is built and persists; the Guide, the ambient half of the Notes Panel, and everything else
that reads the prose are not. The editor decision is
[ADR 0003](./adr/0003-the-draft-editor.md).

## Storage

- **One row per Block**, meaning per paragraph. Not one row for the whole Draft, and not one
  row per Section — a row per Section would make Section Boundaries a storage fact, and they
  are approximate and inferred. A list or a blockquote is one Block too: a Block is a
  top-level child of the document, whatever kind it is.
- **The Draft is edited locally** and persisted to the server. A server-authoritative
  ProseMirror step stream is ruled out — the client is the Draft's only writer, the same way
  it is the Plan's.
- **A Block is a row in the Article Agent's SQLite**, written over `@callable` RPC, and **a
  save carries a delta** rather than the whole Draft. The delta is what bounds a stale tab: a
  client can only name a Block it has already seen, so a paragraph written somewhere else is
  not one it can delete.
- **The Draft is not synced, and can move onto a party-db collection later without changing
  shape** ([`sync.md`](./sync.md)). Until then two tabs on one Draft is last-write-wins per
  Block, which is what "one editor at a time" costs. Findings #7 and #18 stand and are not
  load-bearing yet.

## The editor

**The Draft is a ProseMirror document, built with TipTap.** The reason is narrow: a
decoration is **drawn as part of the document's layout while staying out of its content**,
which is what the Guide needs for anything it shows beside the prose without writing it.
Marks decide nothing — every candidate stores a comment as one.

So **a Proposal is a decoration and an accepted annotation is a mark**: a proposed section
break parts the paragraphs and reaches no stored row, while a comment rides in the prose,
because a mark is what survives the writer rewriting around it in a session that never drew
the note. And **a comment is not a Block reference** — it is a set of marked runs spanning
any number of Blocks, targeting the span from its first to its last.

**The writer types their own headings and section breaks.** Boundaries are inferred, so
nothing can place a title automatically; writer control is the tiebreaker, and what the
writer typed is then the strongest hint the inference has.

## The guide loop

**The guide loop is client-initiated, and v1 carries no server-side timer.** The client knows
when typing stopped; the server cannot tell "still thinking" from "left the room." An alarm
earns its place when work must happen while nobody is connected, and there is no such work
yet. A stale Proposal or an orphaned tool batch expires lazily on read.

**Guidance notes do not stream.** A Review is the thing that should —
[`reviews.md`](./reviews.md).
