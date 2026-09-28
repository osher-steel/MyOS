# Personal OS

pnpm workspace. Apps in `apps/*`, libraries and services in `packages/*`.

```text
apps/web           Next.js dashboard (Today + Finance tabs)
packages/shared    @myos/shared — types, enums, RequestBuilder shared by web + api
packages/api       Express API on Firestore, deployable as a Firebase Function
docs/              product overview, API plan, architecture diagram
```

## Setup

```bash
pnpm install
cp .env.example .env          # then fill it in
pnpm --filter @myos/shared build
```

`apps/web/.env` is a symlink to the root `.env`, so keys live in exactly one
place. The API reads the same file through `--env-file`.

Authorize Spotify once — it opens a browser and stores a refreshing token in
`.spotify_tokens.json`:

```bash
python3 spotify_pkce.py
```

## Running

```bash
pnpm web dev        # http://localhost:3000
pnpm api dev        # http://localhost:8787
pnpm typecheck      # every package, via turbo
pnpm test           # api tests (node:test, no Firestore needed)
pnpm api daily      # sync Plaid and regenerate month reports once
```

`pnpm api deploy:daily` bundles the API and deploys only the `dailyRefresh`
scheduled function to Firebase (06:00 America/New_York). It writes the
function's env, including the Plaid tokens from `~/.plaid/tokens.json`, into
the gitignored `packages/api/deploy/.env`, so redeploy after linking a bank.
The HTTP API is not deployed.

`packages/api/scripts/install-daily.sh` installs the same run as a local
launchd agent instead. Remove it with
`launchctl bootout gui/$(id -u)/com.myos.daily`.

## Data sources (web)

| Section | Source | Notes |
| --- | --- | --- |
| Money | Plaid | Finance syncs every transaction into Firestore on load via `POST /line-entries/syncs`; reads every linked bank in `~/.plaid/tokens.json`; link one with `python3 ~/.claude/skills/plaid/link_server.py <bank>`. `PLAID_ENV=sandbox` mints a fake bank instead |
| News | NewsAPI | US top headlines |
| Music | Spotify | recently played + top artists, user-scoped via PKCE |
| Events | Ticketmaster | upcoming Miami events, recurring runs collapsed |

## API

See `packages/api/README.md` for auth levels, the domain recipe and query
syntax. Design rationale and build order are in `docs/api-implementation-plan.md`.
