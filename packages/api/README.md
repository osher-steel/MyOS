# `api`

Express API for Personal OS, deployable as a Firebase Function. Same shape as
the DIBS monorepo's `packages/api`: `core/` primitives, `domains/` verticals,
one-line route mounts.

```bash
pnpm api dev          # http://localhost:8787, reloads on change
pnpm api test         # node:test, no Firestore needed
pnpm api typecheck
pnpm api lint
```

## Environment

Read from the repo-root `.env` (see `.env.example`). Firestore + Auth need
a service account (`APP_FIREBASE_*`); `MYOS_API_KEY` is the `myos_`-prefixed
system key for scripts and local tools.

## Books and auth

Every route except `/books` and `/sessions` acts inside one book, named by the
`X-Book` header (or implied by a book key), and its data lives under
`books/{bookId}/…`. Repos and services resolve their collections per call
from that book, so nothing can read across books.

| `permission` | Who gets through |
| --- | --- |
| `"none"` | anyone; a valid credential still resolves `client` |
| `"auth"` | any signed-in Google user, a book key or the system key |
| `"owner"` | a member of the request's book, its book key, or the system key |
| `"bookOwner"` | an owner of the request's book, or the system key |

Credentials: `X-Session` (a session cookie from `POST /sessions`, used by the
web app), `Authorization: Bearer <Firebase ID token>`, `Bearer myos_<book>_…`
(a book key from `POST /books/keys`), or `Bearer <MYOS_API_KEY>`.
`resolvePermission` throws `ServiceForbiddenError`; the builder turns it into
`403 { error, code }`.

## Adding a domain

Four files under `src/domains/<name>/`, then one `defineResource` + one mount
in `src/routes/index.ts`:

| File | Holds |
| --- | --- |
| `<name>.query.ts` | `defineListQuery([...])` → `schema` + `filterFields` |
| `<name>.schemas.ts` | zod `create` / `patch` / `record` schemas |
| `<name>.types.ts` | `z.infer` types + the `Expect<Equal<Record, RecordOf<Entity>>>` guard |
| `<name>.domain.ts` | `FirestoreRepo` instance + `DomainInner` (schemas + hooks) |

Entity interfaces live in `@myos/shared` so the web app sees the same types.

Every request runs: `resolvePermission → parse (zod) → [fetch :id] → hooks →
repo write → envelope`. Success bodies are `{ data }` or `{ data, cursor, total }`;
failures are `{ error, code, details? }` with the status from the thrown
`AppError` subclass.

## List queries

`?field=value`, `?field[op]=value`, `?field[in]=a,b`, plus `limit`, `cursor`,
`sortField`, `sortDir`, `includeTotal`. Build them from the web app with
`RequestBuilder` from `@myos/shared`. A query that needs a composite index
Firestore doesn't have yet returns `500 missing_index` and records the console
URL under `firestoreIndexRequests` — read it at `/firestore-index-requests`.
