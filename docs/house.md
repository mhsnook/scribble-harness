# The House

The writer's own standing material, held across every Article: the Lexicon, the standing
rules, the Skills, and the House Voice and Adjectives. One party-db room persisted to D1,
served by `src/server/house.ts` and read on the client through `src/client/house/`.
[ADR 0001](./adr/0001-phase-1-storage-shape.md) chose the home and
[ADR 0004](./adr/0004-the-house.md) chose the shape.

The House is not "everything that spans Articles". It holds what the writer authors and
reuses. Where accumulated research lives is issue #40, still open.

## Four collections

`src/shared/house.ts` declares them the way `src/shared/sync.ts` declares the Article
Agent's three: snake_case columns, JSON columns as the text they store, and one pair of
mappers each. The tables are `migrations/0002_house.sql`, because party-db's D1 adapter
CRUDs the app's tables and creates only its own `_oplog`.

| Collection | One row is                                                   |
| ---------- | ------------------------------------------------------------ |
| `lexicon`  | A term, its definition, and its Provenance                   |
| `rule`     | One standing rule, at a fractional `ord` the writer sets     |
| `skill`    | A saved review prompt, under a name                          |
| `tone`     | The House Voice and Adjectives — exactly one row, id `house` |

A Lexicon entry carries Provenance the way a Reference does, so an entry the writer accepted
from something the Chat turned up can say where it came from. Nothing builds one from an
Offer today, and every entry reads `{ type: 'writer' }`.

The standing rules are a list rather than one block of text. The writer adds, drops, and
reorders one rule without retyping the rest, and each rule reaches the guide as its own
line.

## The writer is the only writer

Every House row is the writer's to author, so the House uses party-db the way party-db is
meant to be used: `PartyDbServer.onRequest` forwards a write POST to `handleWrite`, and
nothing overrides it. This is the one room in the app that does. The Article Agent refuses
the same POST with a 403 and takes its writes on `@callable` RPC instead, because its rows
are guide-written and the rulings' guards live there (`sync.md`).

Nothing in the House reads an identity. Access gates the Worker, one Team holds two people,
and both may read everything — `architecture.md` §4.8. party-db enforces no per-row policy
either way (party-db#33), so a House that needed one could not have it here.

## How the House reaches the Guide

Two paths, and neither is a second socket into the Article Agent.

**The prompt packs.** `readHouse` in `src/server/house.ts` reads the three collections
straight off D1 — the same D1 the Article Agent is already bound to — once per Chat turn and
once per Review. `houseMessage` renders them in front of everything that changes:
the Lexicon entries in play, then the standing rules, then the House Tone. `llm.md` gives
the ordering and why it is a `user` message rather than a second system one.

**A term is in play when the turn invokes it.** `lexiconInPlay` matches a term whole and
case-insensitively against the turn's own material — the Plan and the conversation for a
Chat turn, the Plan, the Draft, the open Notes and the writer's prompt for a Review. A
Lexicon grows for as long as the writer uses the app, and a turn about one Article needs the
handful of terms that Article uses. The boundary is stated as "no letter or digit either
side" rather than as `\b`, so a term ending in punctuation — "C++" — still matches.

**The Scope resolver.** `resolveArticleScope` and `resolveNodeScope` have always taken a
`house: ScopeTerms` argument defaulting to empty; 1b passes one. `ScopeTerms` is
`Pick<OutlineNode, 'voice' | 'adjectives'>`, so the House cannot drift from the Article and
the Section as terms are added. The Plan Panel reads the House Tone through `useHouseStyle`
and hands it down; resolution still runs at read time and nothing stores a resolved value
(`plan.md`).

## Sync settings and carries

- `oplogRetention` is 200 against a default of 10,000, so a returning client takes the
  snapshot path. The Article Agent's core sets the same number, and the reasoning is in
  `sync.md`.
- **party-db does not compare `previousValue`**, so any concurrent write clobbers the whole
  row. A House row is small and single-purpose, which is the whole of what limits the blast
  radius.
- **An expired Access session answers with a redirect rather than a 1008 close**, so
  party-db's client reconnect-loops instead of firing `onAuthError`. The writer sees a room
  that never opens rather than a message saying to sign in again.
- One client for the whole session, in `src/client/lib/houseSync.ts`. There is one House, and
  the Notes Panel reads its Skills from inside an Article, so it opens on the first read and
  stays open. party-db exposes no way to close a transport (party-db#46) in any case.

## Skills

A Skill is saved from the Review composer and picked from the same place in any other
Article — `reviews.md`. Saving under a name that is taken replaces that Skill, and the
unique index on `name` is what makes two clients agree about which one survived.

Skills lived in `localStorage` until the House arrived, so a Skill saved on one machine was
not on the other. `carryOldSkills` moves those into the room once, on the first open, and
clears the key.

## Not built

The showcase's three settings mockups draw a richer House: a Voice as a named record with
its own prompt, its worked examples, and a paragraph you paste in to score against it. What
shipped is a Voice as a string the writer types, because that is what `plan.md` and
[ADR 0002](./adr/0002-the-plan-data-model.md) settled the Plan on. The library version wants
the exemplar pieces in `later.md` before it is worth building.

Also not built: a Lexicon entry accepted from an Offer, and any use of a Skill beyond a
Review prompt — `later.md` records why a Skill that rewrites prose is out of v1.
