# Sync

party-db (`mhsnook/party-db`, checked out at `~/code/party-db`) runs inside the Article Agent
and serves the `note`, `round` and `offer` collections. Issue #92 set these rules. The House
is the other room, and [`house.md`](./house.md) has the rules that are its own.

## Hosting

The Article Agent cannot subclass `PartyDbServer`, because it already extends `AIChatAgent`.
It holds a `PartyDbCore` built over its own SQLite instead (party-db#43), so no room Durable
Object sits beside it. The House is a room of its own and does subclass `PartyDbServer`,
over D1 rather than over its object's storage.

Four seams hold that composition together, all keyed on party-db's `?proto=party-db` marker:

- `partyTransport` opens a second socket to the same Durable Object over partyserver's
  `/parties/article-agent/:name` route, beside the `useAgent` socket. A reconnecting client
  passes `?since` and gets the delta it missed; a fresh one gets a snapshot.
- `shouldSendProtocolMessages` turns the identity, state, and MCP frames off for marked
  connects, so those go to the core and skip the Agents SDK handshake.
- The Agent overrides `broadcast` to exclude sync subscribers. `broadcast` is the one path the
  SDK's own frames (state sync, Chat streams) and the app's (`plan_refused`) both take, so a
  sync subscriber hears `SequencedBatch` frames and nothing else.
- `onRequest` answers a party-db write POST with 403. Rulings are server-side state-machine
  moves, and party-db has no per-row policy layer to hold their guards yet (party-db#33).
  Forwarding to `handleWrite` is the whole change when a client-authored collection arrives —
  which is exactly what the House does, and it overrides nothing to do it.

## Writing

To reach an already-connected client, a server write to a synced table must go through
`commit()`. Only the oplog feeds the stream, so a raw write reaches a fresh snapshot and
nothing else. Reads stay plain SQL — including the fingerprint dedupe in `recordOffers` —
because the oplog carries writes.

Batch what a subscriber should see together. The Guide writes a Round's Notes and its settle
in one commit, so a subscriber that hears the Round settle already holds its Notes. A research
turn commits its Offers in one batch, so a turn that found seventeen things costs one batch
rather than seventeen.

Rulings stay on `@callable` RPC, because that is where their guards live, and they call
`commit()` so the ruled row syncs. The rows landing is the announcement, which is why we
deleted the `review_finished` frame, the Notes Panel's poll and reload counter, and the
Ledger's.

party-db runs one call's ops in a single transaction, with the oplog's compaction inside it,
so the oplog never has a torn floor. A half-landed batch would leave a subscriber's delta
describing rows the table does not have. The cost falls on the two batched writes above: one
refused row takes the call's other rows with it, so a caller that meets a rejection re-decides
the whole batch. `recordOffers` re-dedupes against what landed and commits the remainder.
Per-op rejection in party-db would turn that loop back into a catch.

A refused commit gets re-read rather than parsed. `commit()` throws the adapter's error as it
comes, because party-db classifies rejections only on its HTTP write path and its embedded
SQLite adapter implements none of the optional `classifyError` hook that the Postgres one
fills in. Matching a SQLite message string in app code would break when the adapter changes.
So `recordOffers` and `createRound` both re-read and let the table say who won, and so should
the next guard. A typed rejection out of `commit()` retires this.

## Schemas

`src/shared/sync.ts` declares the three collections as the columns stand — snake_case, and
JSON columns as the text they store — and owns the one mapping to the shapes the app reads.
JSON-typed fields would arrive unparsed anyway, because party-db's column codec reads Zod v3
internals and this repo is on Zod v4 (party-db#45). `src/shared/house.ts` declares the
House's four the same way.

## Migrations

The House migrates through `wrangler`, because its tables are D1: they are
`migrations/0002_house.sql`, they go out with `pnpm db:migrate`, and party-db's D1 adapter
CRUDs them without creating anything but its own `_oplog`. The rest of this section is about
the Article Agent's own storage, which has none of that.

A Durable Object's SQLite migrates on the wake. `migrations_dir` in `wrangler.jsonc` belongs
to the D1 binding, and there are as many Article databases as there are Articles, so no
wrangler mechanism reaches inside one. `onStart` is the only code that runs against them all,
and it runs on every wake. A new table therefore needs only `IF NOT EXISTS`, while a new
column needs a `pragma_table_info` guard.

## Settings and carries

- Set `oplogRetention` to about 200, against a default of 10,000. For a hot row the reconnect
  delta measured 400× the snapshot, and party-db has no large-delta bail-out, so low retention
  pushes a returning client onto the cheap snapshot path. The Article Agent's core and the
  House's room both set 200.
- `articleSync` caches one client per Article for the session and holds a standing
  subscription per collection. party-db exposes no way to close a transport (party-db#46), and
  a collection that restarts after TanStack DB's GC gets no second snapshot (party-db#47).
  Both carries undo when the upstream teardown lands. `houseSync` keeps its one client for
  the session outright, since there is one House and every screen may read it.
- party-db does not compare `previousValue`, so any concurrent write clobbers the whole row.
  The Block shape limits the blast radius; nothing removes it.
- party-db has no per-row access control. `src/server/access.ts` warns that `access` and
  `ownerColumn` are unenforced (party-db#33). This survives while both people may read
  everything, and stops surviving the moment that changes.
- An expired Access session answers with a redirect rather than a 1008 close, so party-db's
  client reconnect-loops instead of firing `onAuthError`.
