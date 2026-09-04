# Sync

How party-db runs inside the Article Agent, and what a caller has to do to get a write onto
every connected client. The rules that bind other modules to this one are
[`architecture.md`](./architecture.md); the features that ride it are
[`reviews.md`](./reviews.md) and [`chat.md`](./chat.md). Issue #92 is the pilot that set
these.

party-db is `mhsnook/party-db`, checked out at `~/code/party-db`.

## Hosting

**Notes, Rounds and Offers are party-db collections, hosted by the Article Agent itself.**
This is #84's hosting question, answered: the Agent cannot subclass `PartyDbServer` — it
already extends `AIChatAgent` — so it holds a `PartyDbCore` built over its own SQLite
(party-db#43). No room Durable Object sits beside it. The House at 1b gets a room of its own.

The composition is four seams, all keyed on party-db's own `?proto=party-db` marker:

- **A second socket, not a shared one.** `partyTransport` connects to the same Durable
  Object over partyserver's `/parties/article-agent/:name` route, beside the `useAgent`
  socket. A reconnecting client passes `?since` and gets the delta it missed; a fresh one
  gets a snapshot.
- **Marked connects go to the core and skip the Agents SDK handshake** —
  `shouldSendProtocolMessages` turns the identity/state/MCP frames off for them.
- **Every broadcast leaves sync subscribers out.** The Agent overrides `broadcast`, which is
  the one path the SDK's own frames (state sync, Chat streams) and the app's
  (`plan_refused`) all pass through. A sync subscriber hears `SequencedBatch` frames and
  nothing else.
- **The client write path is closed.** A party-db write POST answers 403: rulings are
  server-side state-machine moves, and party-db has no per-row policy layer to hold their
  guards yet (party-db#33). Forwarding to `handleWrite` is the whole change when a
  client-authored collection arrives.

## Writing

**Every server write to a synced table goes through `commit()` rather than raw SQL.** A raw
write reaches a fresh snapshot and never an already-connected client, because only the oplog
feeds the stream. Reads stay plain SQL — the fingerprint dedupe in `recordOffers` among
them — because the oplog carries writes.

Batch what a subscriber should see together. The Guide writes a Round's Notes and its settle
in one commit, and a research turn commits its Offers in one too: a subscriber that hears
the Round settle already holds its Notes, and a turn that found seventeen things costs one
batch rather than seventeen.

Rulings stay `@callable` RPC for their guards on all three types, implemented over `commit()`
so the ruled row syncs. Nothing announces a Review settling or a turn recording any more —
the rows landing is the announcement, which is what deleted the `review_finished` frame, the
Notes Panel's poll, its reload counter, and the Ledger's.

**One call is one transaction, so a batch recovers whole and not by the row.** party-db runs
a call's ops in one transaction, with the oplog's compaction inside it, so the oplog never
has a torn floor — a half-landed batch would leave a subscriber's delta describing rows the
table does not have. The cost falls on the two batched writes above: one refused row takes
the call's other rows with it, so a caller that meets a rejection re-decides the whole batch.
`recordOffers` re-dedupes against what landed and commits the remainder. Per-op rejection in
party-db would make that loop a catch again.

**A refused commit is re-read, not parsed.** `commit()` throws the adapter's error as it
comes — party-db classifies rejections only on its HTTP write path, and its embedded SQLite
adapter implements none of the optional `classifyError` hook the Postgres one fills in. The
alternative is matching a SQLite message string in app code, which changes with the adapter.
So `recordOffers` and `createRound` both re-read and let the table say who won, and so
should the next guard. A typed rejection out of `commit()` retires this.

## The wire rows are the table rows

`src/shared/sync.ts` declares the three collections' schemas as the columns stand —
snake_case, JSON columns as the text they store — and owns the one mapping to the shapes the
app reads. JSON-typed fields would arrive unparsed anyway: party-db's column codec reads Zod
v3 internals and this repo is on Zod v4 (party-db#45).

## Migrations

**A Durable Object's SQLite migrates on the wake.** `migrations_dir` in `wrangler.jsonc`
belongs to the D1 binding, and there are as many Article databases as there are Articles. No
wrangler mechanism reaches inside one, so `onStart` is the only code that runs against them
all — and it runs on every wake, which is what makes a new column need a `pragma_table_info`
guard where a new table needs only `IF NOT EXISTS`.

## Settings and carries

- **Set `oplogRetention` low, around 200** against its default of 10,000. For a hot row the
  reconnect delta measured 400× the snapshot, and party-db has no large-delta bail-out. Low
  retention pushes a returning client onto the cheap snapshot path. The Article Agent's core
  sets 200; the House's room should too.
- **The per-Article sync client is cached for the session, and its collections are pinned.**
  party-db exposes no way to close a transport (party-db#46), and a collection that restarts
  after TanStack DB's GC gets no second snapshot (party-db#47) — so `articleSync` holds one
  client per Article and a standing subscription per collection. Both carries undo when the
  upstream teardown lands.
- **party-db does not compare `previousValue`.** Any concurrent write clobbers the whole row.
  The Block shape limits the blast radius; nothing removes it.
- **party-db has no per-row access control.** `src/server/access.ts` warns that `access` and
  `ownerColumn` are unenforced (party-db#33). Survivable while both people may read
  everything, and not survivable the moment that stops being true.
- **An expired Access session answers with a redirect rather than a 1008 close**, so
  party-db's client reconnect-loops instead of firing `onAuthError`.
