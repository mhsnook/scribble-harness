# Carries

Settings we hold and defects we work around. party-db's own carries are
[`sync.md`](./sync.md).

- Nothing expires an abandoned tool batch. Cloudflare's `ai-chat` enforces batch completeness
  server-side with no orphan timeout, so a Proposal the writer neither Accepts nor Declines
  stalls the Chat silently. The composer counts the suspended calls and says what it is
  waiting on, rather than sitting dead.
- `@callable` needs the `agents/vite` plugin in both Vite configs. `vite.config.ts` carries
  the reasoning and the warning about `experimentalDecorators`, beside the plugin.
- Local development has no seed data. `pnpm db:migrate` puts the article index's schema into
  the local D1, and the worker tests apply the same files themselves, so a build ticket can
  run what it writes against a real table. What is missing is an Article with a Plan and a
  transcript already in it, so a screen can be opened rather than built up by hand.
