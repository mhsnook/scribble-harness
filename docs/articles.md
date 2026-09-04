# The article index

One D1 table, read through Hono routes in the same Worker, backing the list at `/` and the
Board View at `/board`. Both Views read one index call under a pathless layout route. Issue
#29 built it.

A row carries `{ id, title, status, createdAt, updatedAt, archivedAt }` and nothing else, so
the Article Agent stays the source of truth for an Article's contents and nothing on the index
path reaches into one.

The index is its own D1 table rather than a House collection. ADR 0001 put it in the House,
and #29 shipped it ahead of one; keeping it there costs a party-db room nothing and keeps the
Article list off the sync path. An Article created on one machine appears on the other either
way, which is what makes the index worth having.

`status` records the writer's word rather than an inference. 1a has no Draft to measure, so
the Article screen carries the one control that sets it and the Board View reads it.

`updatedAt` records when the row last changed — a rename, a status, or Archiving. It does not
record when the writer last worked on the Article, because a Plan edit goes to the Article
Agent and never touches this table.

An Archived Article stays on this table and says so with `archivedAt`, rather than moving to a
table of its own. Both Views filter the one list: the list shows Archived Articles as a group
at its foot, and the Board View leaves them out.

Archiving is a soft delete, and only the Chat goes cold. The Plan, the Draft, and the Final
move to plain D1 tables and stay readable. The Chat goes to R2, and un-archiving asks the
writer whether to bring it back whole or truncate it. This is not built in v1 and is
independent of the `archivedAt` flag.
