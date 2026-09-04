# User Interface & Design

This document is a sibling to [`architecture.md`](./architecture.md), a place to explain
decisions we make about the UI and design, as opposed to technical, cross-module
architectural decisions that go in the other doc.

## The screen we design for

Our target screen is 1298px wide. That is the starting value for the `lg` breakpoint, and
wherever possible we configure Storybook to use this width.

## The UI showcase

We are generally a very "Storybook First" project, so every wireframe and component is
built with real components but mock data.

Mostly our design "rules" can be found in the storybook files themselves, so the easiest
way to get a look at them is to run Storybook and click through the first section. e.g.
the accent rule is in `src/client/foundations/Accent.mdx`.

```bash
pnpm storybook        # http://localhost:6006
```

Screens keep their number when the route that replaces it lands and its name
changes to `context.md`'s word: e.g. the deck's "Desk" is now the "Articles Area". Screens are
superseded as those routes arrive, so none is worth preserving out of politeness, and a
wired one renders the live component against mock data rather than a copy of it. The
components live in the app rather than in a package of their own, which is what lets
Tailwind scan them with no configuration.

## Markdown in the Chat

A guide turn is markdown, and it is rendered as markdown. The renderer is
[`react-markdown`](https://github.com/remarkjs/react-markdown) with
[`remark-gfm`](https://github.com/remarkjs/remark-gfm) for tables, strikethrough and
task lists, and [`remend`](https://streamdown.ai/docs/termination) to close a mark the
turn has not finished typing yet — without it a `**` sits on screen as two asterisks
until its partner arrives, so a streaming turn flickers.

Three decisions worth keeping:

- **The writer's own message is left as they typed it.** The asterisks they pasted in
  are part of what they said, and a message that restyles itself on send is one they
  have to read twice. The rule lives in `ChatMessage`: a guide turn given text renders
  it as markdown, and yours is shown verbatim.
- **No raw HTML.** react-markdown drops it unless `rehype-raw` is added, and a model's
  output is not markup we trust.
- **The blocks are styled by `.prose-chat` in `theme.css`**, the way the draft is styled
  by `.prose-draft`. react-markdown renders plain tags, so the styling stays in one
  place rather than spreading through component props.

It costs about 50 kB gzipped on the Article route's chunk, which is what a real markdown
parser weighs. `streamdown` is the same idea packaged whole, and it was passed over
because it hard-depends on Mermaid and ships its own Tailwind palette.

## The four Panels

The Article screen shows four Panels — Chat, Plan, Draft, and Notes — which become tabs on a
narrow screen. Each is its own small interface, and the interactions between them are
specific, explicit, and user-gated.

`usePanels` holds which Panels are open and keeps them in one order, drawn by a `Rail`
component in the navbar. It also sets the widths: Notes takes a fixed slice as the margin
rail, and the Draft takes twice what a supporting Panel does out of what remains, so the prose
keeps its room whatever sits beside it.

## Show a Loading state rather than an empty value

An empty title, a zero count, and four empty columns are answers. A screen that shows one
before it has read anything has said something untrue. Use `Skeleton` where the shape is
known, a sentence like "Opening the Plan…" where it is not, and a route's `pendingComponent`
where the whole screen is waiting.

This is why the Article bar takes `title: string | null`. `''` is the title the writer
cleared, so it cannot also mean "not read yet".

## Navigate with `Link`

TanStack Router's `Link`, with `defaultPreload: 'intent'`. A hover then triggers work such as
waking a different Article Agent's Durable Object, which improves loading times.

## A card the writer cannot Accept explains itself

Whole-field comparison is conservative, so it refuses a Proposal against any field the writer
has since touched ([`plan.md`](./plan.md)). A Stale card therefore says why rather than
greying out. A refused Accept behaves the same way: the card stays open with the applier's
sentence, and the writer can fix the Plan and Accept again.
