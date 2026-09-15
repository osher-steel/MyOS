# `@myos/shared`

Shared types, enums and helpers for the Personal OS web app and API.

Consumed through the pnpm workspace protocol — `"@myos/shared": "workspace:*"`.
No registry, no auth.

```bash
pnpm --filter @myos/shared build     # writes dist/, which consumers import
pnpm --filter @myos/shared typecheck
```

What lives here:

| Path | Contents |
| --- | --- |
| `types/interfaces/` | one file per domain contract, re-exported from `index.ts` |
| `query/` | `RequestBuilder` + `toQueryString` — build `field[op]=value` list queries the API understands |
| `constants/` | collection names and other literals both sides agree on |
| `utils/` | pure helpers (`toMonthYear`, `previousMonthYear`) |

Rebuild after editing `src/` — consumers resolve `dist/`, not `src/`.
