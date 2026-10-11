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

`pnpm api deploy:functions` bundles the API and deploys the `api` HTTP function and the
`dailyRefresh` scheduled function (06:00 America/New_York, every book). The
Plaid tokens from `~/.plaid/tokens.json`, the Plaid secret and the system key
go to Secret Manager, so redeploy after linking a bank.

`packages/api/scripts/install-daily.sh` installs the same run as a local
launchd agent instead. Remove it with
`launchctl bootout gui/$(id -u)/com.myos.daily`.

## Books, sign-in and keys

Finance data lives in books (`personal`, `dibs`), each under
`books/{bookId}/…` in Firestore with its own members, budgets, rules, tags
and bank links. People sign in with Google; a book lets in the verified
emails in its `members`. The web app keeps a 14-day session cookie and a
chosen-book cookie and forwards both to the API.

- Scripts act on `MYOS_BOOK` (default `personal`).
- A book owner mints a book-scoped key with `POST /books/keys` (send
  `X-Book`). The key is shown once; use it as `Authorization: Bearer myos_<book>_…`
  for agents like Claude Code. It can only touch that book.
- `MYOS_API_KEY` is the system key: trusted across books, local only on the
  web side (a dev server with no session falls back to it).
- A bank link belongs to the book named by `"book"` on its entry in
  `~/.plaid/tokens.json`; entries without one are `personal`.

## Deploying

```bash
pnpm api deploy:functions     # api + dailyRefresh functions; secrets to Secret Manager
```

The web app deploys on Vercel with root directory `apps/web` (see
`apps/web/vercel.json`). It needs `MYOS_API_URL` (the `api` function URL) and
the `NEXT_PUBLIC_FIREBASE_*` values; enable Google sign-in in Firebase Auth
and add the Vercel domain to its authorized domains.

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
