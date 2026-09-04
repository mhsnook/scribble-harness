# The article index

The list of Articles at `/` and the Board View at `/board`, over one D1 table read through
Hono routes in the same Worker. The rule that binds it to the Article Agent is
[`architecture.md`](./architecture.md). Issue #29 built it.

**It is a list, not a store.** One row carries `{ id, title, status, createdAt, updatedAt,
archivedAt }` and nothing else, so the Article Agent stays the source of truth for the
contents of an Article, and nothing on the index path reaches into one.

**It does not wait for the House.** An Article created on one machine appears on the other,
which is what makes the index worth having at all.

**`status` is the writer's word, not an inference.** 1a has no Draft to measure, so the
Article screen carries the one control that sets it and the Board View reads it.

**`updatedAt` is when the row last changed** — a rename, a status, or Archiving — and not
when the Article was last worked on, because a Plan edit goes to the Article Agent and never
touches this table.

**An Archived Article stays on the same table** and says so with `archivedAt`, rather than
moving to one of its own. Both Views filter the one list the index answers with: the list
shows Archived Articles as a group at its foot, and the Board View leaves them out.

**Archive is a soft delete, and only the Chat goes cold.** The Plan, the Draft, and the Final
move to plain D1 tables and stay readable; the Chat goes to R2, and un-archiving asks the
writer whether to bring it back whole or truncate it. Not built in v1, and independent of the
`archivedAt` flag.

**Both Views read one index call**, under a pathless layout route that holds them.
