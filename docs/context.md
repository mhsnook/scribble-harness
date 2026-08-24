# Scribble Harness

A writing harness where the writer writes the prose and an AI acts as a guide. What is
true now is [docs/architecture.md](./architecture.md), and what is deferred is
[docs/later.md](./later.md); this file fixes the words, and nothing else.

## The app

**Team**:
The people who may read the same material, and the Area where the writer manages them.
There is one Team in v1, holding two people. It is the privacy boundary, and nothing
else is.
_Avoid_: room (party-db's word for its own sync unit, not ours), organisation, tenant,
workspace, account

**House** (or house style):
The writer's own material, held across every Article — the Lexicon, the standing rules,
the Skills, and the writing samples. Named for house style, and reached from its own
top-level entry point rather than from inside an Article.
_Avoid_: layer 4, global settings, user settings, workspace

## The Article and its Panels

**Article**:
One piece of writing, and the container for its Chat, its Plan, its Draft, and its Notes,
plus a title, a status, and a word-count target.
_Avoid_: project, document, piece (except in prose about the writing itself)

**Panel**:
One of the columns of the Article screen, and the material it shows. Four today: Chat,
Plan, Draft, Notes. On a narrow screen the Panels become tabs.
_Avoid_: layer, pane, section (a Section is part of the Article), stage (the writer owns
their own process, and we do not name it for them), rail (a rail is a collapsed Panel,
not a different thing)

**Chat**:
The dialogue between the writer and the guide about one Article.
_Avoid_: conversation, thread

**Plan**:
The structured plan for one Article — its Sections, its Tone, its word-count targets, and
the References the writer has Accepted. It is what the Chat and the writer co-construct,
and it plays the role a plan plays in an agentic coding tool.
_Avoid_: **brief** (see below), outline (the Outline is one part of the Plan), context
stash, spec

**Draft**:
The Article's prose, which they draft in Panel 3. One continuous text, written by the writer.
_Avoid_: document, content, body

**Notes** (or review notes):
The guide's accumulated observations about one Article. Some arrive alongside the Draft
as the writer works, and some arrive in batches from a Review.
_Avoid_: feedback, comments, findings, suggestions, review (a Review produces Notes)

## Inside the Plan

**Outline** (or article outline):
The Plan's ordered tree of Sections, and the Panel material the writer rearranges. One
part of the Plan rather than another word for it.
_Avoid_: structure, TOC, table of contents

**Section**:
The unit the writer works in — one stretch of the Article, planned in the Outline and
written in the Draft. Its plan side is stored, carrying a stable ID, a title, an intent
note, and optionally a word-count target and a Tone. Its prose side is the run of Blocks
that serves it, inferred rather than stored (see **Boundary**). One word for both, because
the writer has one thing in mind.
_Avoid_: node (a Node is the code word — see below), item, heading, bullet, chapter (a
Chapter is a longer work's unit, and v1 has none)

**Subsection**:
A Section nested one level inside another. Two levels is what the interface offers.
Anything deeper wants a word writers already hold — Chapter, for a book — rather than a
more recursive one, and we would rather add that word later than ask a writer to think in
trees.

**Node** (or section node):
The code word for the recursive unit a Section and a Subsection are both instances of, and
the name it keeps in the schema: `OutlineNode` in `src/shared/plan`. Depth picks the word
the writer reads — 0 is a Section and 1 is a Subsection.
_Avoid_: the word "node" anywhere the writer can read it

**Tone**:
The Voice and the Adjectives together — everything saying how the writing should sound, as
against what it should say. A Section's Tone is its resolved Voice plus its accumulated
Adjectives, so Tone names the pair and never one of them.
_Avoid_: Tone for a Voice alone or an Adjective alone, style, register

**Voice**:
The register the writing is in — "reported feature", "clean and professional",
"academic". **One applies at a time.** Voices do not compose: switching from one to
another for a passage replaces it, because blending two registers makes mud rather than a
third register.
_Avoid_: tone (a Tone is the Voice and the Adjectives together), style, register, mode

**Adjective**:
A descriptive term the writing should answer to — "funny", "somber", "high energy",
"well researched". **Adjectives compose**, within a Scope and across Scopes, so a funny
piece can have a somber middle that still carries a few jokes. Some come from the
Lexicon and some are free-form.
_Avoid_: tone word, tag, chip (a chip is how one is rendered), trait

**Scope**:
Which level a Voice, an Adjective, or a Reference is attached to — House, Article, or
Section. Resolution runs House first and the Section last: the nearest Voice wins
outright, and Adjectives accumulate in that order. Resolved when read, never stored
resolved.
_Avoid_: level, tier, inheritance chain

## Offers and the Ledger

**Offer** (or reference offer):
Something the Chat turns up and hands to the writer to rule on. Two types so far, Links
and Quotes, and Offers stay flat — two Quotes from one publication are two Offers, not a
Quote nested in something else.
_Avoid_: offering, result, finding, suggestion, candidate, card

**Reference**:
The umbrella, and never a type of its own: **every Reference is a Link or a Quote.** It
carries a **text** — a passage pulled from the source, whether a quotation, a clip, or a
key pullout — or a **source** — the attribution, with a title, an author or publication, a
year, and a url, each of them optional. At least one of the two is present; an entry with
neither is nothing.
_Avoid_: Reference for a Link (that is what made "a Reference of type reference" a
tautology), source (a source is the attribution _inside_ a Reference), citation, cite

**Link**:
A Reference of type Link — something the writer is drawing on, named rather than quoted.
Most carry a url and some do not: a print citation with an author, a publication, and a
year is a Link, and so is a broadcast nobody has put online. Naming them for the common
case is deliberate, and the field that holds the address is the **url**, so the two never
share a word.
_Avoid_: reference (see above), source, citation, cite, bookmark

**Quote**:
A Reference of type Quote — a passage pulled from the source rather than the attribution
alone. Not a separate entity from a Link: one structure carries both, and the type says
which. A Quote carries a text, and a Link may carry one without being a Quote, because
the type is stored on the record rather than read off the text. That is what stops the
Offer ledger and the Plan Panel naming one item two ways.
_Avoid_: excerpt, passage, snippet, pull quote

**Ledger** (or offer ledger):
The View of an Article's Offers and what the writer decided about each — a query over
Offers, not a store of its own. Name it the **Offer ledger** wherever the phrase stands on
its own, in a heading, a story name, or a menu item: a bare "Ledger" makes the reader
supply the noun, and the qualifier costs one word. Drop to "the Ledger" only in running
prose that has already named it.
_Avoid_: source ledger (a source is the attribution inside a Reference), inbox, tray,
queue, history

**Undecided** (or undecided offer):
The disposition of an Offer the writer has not ruled on. The starting state.
_Avoid_: pending, new, unread

**Accepted**:
The disposition of an Offer, a Proposal, or a Note the writer has taken on.
_Avoid_: kept, approved, selected, promoted

**Declined**:
The disposition of an Offer, a Proposal, or a Note the writer has ruled out. Restorable —
nothing is deleted.
_Avoid_: cut (the writer cuts their own prose), rejected, dismissed, discarded, ignored

**Provenance** (or a reference's provenance):
Where a record came from. An Accepted Offer is **copied** into the Plan as a new,
editable record that keeps its Provenance — so the Plan's copy is the writer's to change,
and the Offer keeps what was actually turned up. A Lexicon entry carries Provenance the
same way.
_Avoid_: back-ref, origin, source, lineage

**Ready** (Phase 2):
Describes an Accepted Offer the writer has placed in a Section but not yet worked into
the Draft.
_Avoid_: pending, staged, assigned

**Used** (Phase 2):
Describes an Accepted Offer that appears in the Draft.
_Avoid_: applied, written, done

## Inside the Draft

**Transition** (or transition block):
The connective prose between two Sections, belonging to neither.

**Boundary** (or section boundary):
The place where one Section's prose ends and the next begins. Inferred lazily (for now)
and reported approximately — the Draft is stored as a flat run of Blocks, so which Section
a Block serves is read out rather than written down.

**Block** (or text block):
The unit the Draft is stored and synced in, usually one paragraph. Blocks settle lazily
and hold loosely — a paragraph the writer is in the middle of splitting may stay one
Block until they move on, and the structure is never enforced against them mid-flow.
_Avoid_: row, chunk, node (a Node is the code word for a Section)

## The guide and its output

**Guide** (or review guide):
The AI in its ambient role, reading the Draft against the Plan and writing Guidance
notes. The same model in dialogue is the Chat.
_Avoid_: coach, assistant, agent (an Agent is a Durable Object class)

**Note** (or review note):
One observation from the Guide — a type, an anchor to a Section or a paragraph range,
and a body of one or two sentences. The unit that fills the Notes Panel.
_Avoid_: finding, suggestion, comment, tip, feedback

**Proposed** (or proposed note):
The disposition of a Note the writer has not ruled on. The starting state, where an Offer's
is Undecided. Whether the two should be one word is open — issue #79.
_Avoid_: pending, new, unread

**Resolved** (or resolved note):
Describes an accepted Note the writer has dealt with. It leaves the queue and is reachable
again by asking for it.
_Avoid_: done (a Done Article is a different thing), closed, fixed, complete

**Anchor** (or note anchor):
Where a Note points — the whole piece, one Section, or a run of Blocks. Stored as ids and
read as positions: the writer sees "§2" and "¶3–¶5".
_Avoid_: target, location, range, selection

**Orphaned** (or orphaned note):
Describes a Note whose anchor names a Block or a Section that is gone.
_Avoid_: stale (a stale Proposal is a different thing), broken, dangling, lost

**Depth** (or review depth):
How hard one Review works — quick or thorough.
_Avoid_: effort, mode, level, thoroughness

**Type**:
What sort of thing a record is, named after the record it belongs to — an Offer type, a
note type, a refusal type. For a Guidance note: structure, tone drift, citations,
repetition, budget, pacing, plan divergence — illustrative rather than a fixed taxonomy,
and the Notes Panel groups by it. A note about the Voice and a note about an Adjective are
both tone drift, because the writer reads them the same way. For a Reference and for an
Offer: Link, Quote, and whatever comes later. The field is `type` throughout, and it reads the way the
phrase does: `offer.type`, not "the kind of an Offer".
_Avoid_: kind, category, tag, label

**Review**:
An intentional pass by the Guide over the whole Article or a chosen Scope, producing a
batch of Guidance notes at once. Distinct from the ambient Notes that arrive while the
writer works.
_Avoid_: audit, check, pass, analysis

**Round**:
One numbered Review of an Article, and the written response it produced. Rounds accumulate,
so the writer can see what a Review said before the last set of changes.
_Avoid_: run, iteration, version

**Skill** (or review skill):
An editorial routine the writer authors in the app as natural-language instructions, saved
by name and picked from the Notes Panel. Held in the House.
_Avoid_: command, macro, prompt (a prompt is what the writer types; a Skill is one they
kept), action

**Proposal**:
A change to the Plan that the Chat offers and the writer Accepts or Declines. The writer
rules on it the same way they rule on an Offer, but it is not one: a Proposal lives in
the Chat turn that made it, goes Stale, and leaves no record, where an Offer is a row that
keeps its disposition until the writer changes it.
_Avoid_: suggestion, offer, edit, tool call, patch

**Stale**:
Describes a Proposal whose target text has changed since the Proposal was generated. A
stale Proposal is refused, not merged.
_Avoid_: conflicted, out of date, diverged (Divergence is a Plan-versus-Draft term)

**Lexicon entry**:
A named term with the writer's definition of it, held in the House and injected into the
Guide's context whenever the term is invoked.

## Homes and lifecycle

**Article Agent**:
The Durable Object that hosts one Article — its Chat, its Plan, its Notes, and its Offers.
Always name it in full: an unqualified "agent" could be this object, the Guide, or the
Chat.
_Avoid_: room, agent (unqualified), DO

**Article Agent state**:
The one whole-blob record the Article Agent replaces on every write, holding the Plan.
The Article Agent's other material — Notes, Rounds, and Offers — is in its SQLite
tables instead, because a whole-blob store can only have one owner.
_Avoid_: agent state (unqualified), the blob, the document

**Done**:
Describes an Article the writer has finished writing. Independent of Archived — a Done
Article stays on the Board until it is Archived.
_Avoid_: complete, published, finished

**Final**:
The finished text of a Done Article, kept whole and readable without restoring anything.
Not every Article has one.
_Avoid_: output, export (an export is a file the writer takes away), published version

**Archived**:
Describes an Article the writer has put away. Nothing is destroyed, and the Plan, the
Draft, and the Final stay readable — only the Chat goes to cold storage, and
un-archiving asks the writer whether to bring it back whole or truncate it.
_Avoid_: deleted, removed, trashed, closed
