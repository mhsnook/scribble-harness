# Deployment configuration

What has to be set outside the repository for a deploy to work, and the traps in
setting it. Not architecture — nothing here coordinates two modules — but each
one is a thing that goes wrong silently.

## A push to main deploys

**Cloudflare's git integration watches this repository and builds and deploys on
every push to `main`.** Merging a pull request ships it — there is no separate
deploy gate, and the CI workflow in `.github/workflows/ci.yml` only checks; it
does not deploy. `pnpm deploy` exists for a deploy from a machine, beside the
automatic one.

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

## The local database

`pnpm db:migrate` puts the article index's schema into the local D1;
`pnpm db:migrate:remote` does the deployed one. The worker tests apply the same
files themselves.
