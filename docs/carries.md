# Carries

Settings we have to hold and defects we have to work around. None is a decision to make; all
are things to get right. party-db's own carries are [`sync.md`](./sync.md).

- **An abandoned tool batch parks indefinitely.** Cloudflare's `ai-chat` enforces batch
  completeness server-side with no orphan timeout, so a Proposal the writer neither Accepts
  nor Declines stalls the Chat silently. The composer counts the suspended calls and says
  what it is waiting on rather than sitting dead; nothing expires them.
- **`@callable` needs the `agents/vite` plugin, in both Vite configs.** The reasoning, and
  the warning about `experimentalDecorators`, are comments in `vite.config.ts` beside the
  plugin they are about.
- **Local development is half solved.** `pnpm db:migrate` puts the article index's schema
  into the local D1, and the worker tests apply the same files themselves, so a build ticket
  can run what it writes against a real table. What is missing is seeded data: an Article
  with a Plan and a transcript already in it, so a screen can be opened rather than built up
  by hand every time.
