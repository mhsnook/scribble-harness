# Deployment configuration

What has to be set outside the repository for a deploy to work, and the traps in
setting it. Not architecture — nothing here coordinates two modules — but each
one is a thing that goes wrong silently.

## The AI Gateway

**It attaches to the Workers AI calls for logging.** Inference runs on
Cloudflare, so there is no external provider and no key to manage.

**Response caching stays off for guide passes**, or near-identical requests
against different Drafts return stale Notes.

**The Gateway is named by the `AI_GATEWAY_ID` var, set from the CLI rather than
checked in.** A var declared in `wrangler.jsonc` overwrites the deployed value on
every `wrangler deploy`, so declaring it there even as a placeholder wipes it.
Unset attaches no Gateway. Its type is in `src/server/env.d.ts`, and
`llm/model.ts` is the only thing that reads it.

**Leave the Gateway unauthenticated.** `GatewayOptions` carries an id and cache
settings and has nowhere to put a token, because a Workers AI binding call is
same-account and authenticates itself. Turn authentication on and these calls
have no way to present the header it wants.

## Search

**`EXA_API_KEY` is a Worker secret.** Search does not route through the AI
Gateway, which proxies inference rather than an arbitrary API, so the rule above
about leaving the Gateway unauthenticated is unaffected.

**No key means no search tool**, and the guide is told to answer from memory
instead — `src/server/llm/search.ts`.

## The database name

**D1 does not rename a database.** `database_name` in `wrangler.jsonc` reads
`scribble`, and the database the deploy binds was created under the project's
previous name, so `wrangler d1 list` shows a name the config does not.

**Nothing breaks while the two disagree.** `database_id` is what wrangler
resolves, and `pnpm db:migrate` names the `DB` binding rather than either one, so
the label is cosmetic.

**Settling it takes a new database and a copy**, because there is nothing else to
rename with. The export names the database by the id in `database_id` rather than
by a name, because the deployed one does not answer to the name beside it:

```sh
pnpm wrangler d1 export <the database_id in wrangler.jsonc> --remote --output=index.sql
pnpm wrangler d1 create scribble
pnpm wrangler d1 execute scribble --remote --file=index.sql
```

Then paste the id `d1 create` prints into `database_id`, and the config and the
account agree. The export is one point in time, so run it while nothing is
writing, and keep the old database until the new one has served.

## The local database

`pnpm db:migrate` puts the article index's schema into the local D1;
`pnpm db:migrate:remote` does the deployed one. The worker tests apply the same
files themselves.
