# CLAUDE.md

## How to talk to me

The `Clear Technical` output style in `.claude/output-styles/clear-technical.md`
governs every string a human reads — chat, commit messages, PR bodies, code
comments, UI copy. The `prose-clarity` skill applies the same rules as a rewrite
pass over text that already exists.

## How to write a code comment

The subject of a code comment is the code. Open on what the code does.

A fact about the world outside this code — another module's behaviour, a browser
quirk, the shape an API returns — earns a place only when a conjunction joins it
to the code: **because**, **so that**, **as long as**, **in order to**. The
conjunction is the point. It tells the next reader when this code stops being
needed, or stops being correct.

A bare outside fact sitting next to a bare action cannot go stale visibly.
Change the fact and the comment is quietly wrong, and whoever trusts it writes
the bug. A colon is not a conjunction: it asserts adjacency where the reader
needs dependency.

```
❌ Accepted and resolved share the check; the strikethrough tells them apart.

✅ `accepted` and `resolved` share `Check`, so they are only told apart as long
   as `NoteCard` strikes a resolved body through.
```

Both carry the same information. Only the second stops someone deleting the
strikethrough.

Adding the conjunction is the floor, not the finish. Restructure the sentence
around the code's action once the link is there:

```
weak    the apple falls; its underside impacts the ground; we protect it
better  because the apple falls, its underside impacts the ground, so we shield it
best    when the apple falls, we protect its underside from hitting the ground
best    we protect the apple's underside, because it falls and may be damaged by
        impact with the ground
```

Short signposting is welcome and needs none of this. A one-liner marking a
transitional state — `// unused until phase 2` — says what it says and goes when
the state does.

## The screen we design for

We design for a laptop with a 1298px wide screen.
