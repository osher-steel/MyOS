# Personal OS

A personal dashboard pulling money, news, music and events into one editorial view.
Part 1 scope and design direction live in [`docs/product_overview.md`](docs/product_overview.md).

## Layout

```text
apps/web/          Next.js 16 · React 19 · TypeScript · Tailwind 4
  src/lib/         one module per data source (plaid, news, spotify, ticketmaster)
  src/components/  editorial primitives (Section, Entry)
  src/app/         globals.css holds every design token
spotify_pkce.py    one-time Spotify login (Authorization Code + PKCE, stdlib only)
```

## Setup

Create `.env` in the repo root:

```env
PLAID_CLIENT_ID=…
PLAID_CLIENT_SECRET=…          # sandbox secret
NEWS_API_KEY=…
SPOTIFY_CLIENT_ID=…
SPOTIFY_CLIENT_SECRET=…        # unused by the app; PKCE needs no secret
TICKETMASTER_API_KEY=…
```

Authorize Spotify once — it opens a browser and stores a refreshing token in
`.spotify_tokens.json`:

```bash
./spotify_pkce.py login
```

This requires `http://127.0.0.1:8888/callback` to be registered as a Redirect URI
on the Spotify app (loopback is allowed; no public site needed).

Then:

```bash
cd apps/web && npm install && npm run dev
```

`apps/web/.env` is a symlink to the root `.env`, so keys live in exactly one place.

## Data sources

| Section | Source | Notes |
| --- | --- | --- |
| Money | Plaid **sandbox** | mints and caches its own access token on first request |
| News | NewsAPI | US top headlines |
| Music | Spotify | recently played + top artists, user-scoped via PKCE |
| Events | Ticketmaster | upcoming Miami events, recurring runs collapsed |

Each source is fetched in a server component, so no key reaches the browser. A
failing source degrades to a note in place of its section rather than taking the
page down.

## Design

Every color, type size and spacing value is a CSS custom property at the top of
`apps/web/src/app/globals.css`, exposed to Tailwind via `@theme`. Restyling means
editing that block — components reference tokens only.

## Not included yet

No auth, no database, no persistence beyond the local token caches. Reads only.
