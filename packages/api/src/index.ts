// MUST be first: side-effect import that populates process.env before
// ./app.js -> config/firebase.ts initializes the admin SDK.
import "./load-env.js";

import { defineSecret } from "firebase-functions/params";
import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { app } from "./app.js";
import { forEachBook } from "./services/books.js";
import { refreshLedger } from "./services/ledgerRefresh.js";

// Firestore triggers get re-exported here as domains grow, exactly like the
// monorepo: `export * from "./domains/<domain>/triggers/<file>.js";`

// Bank tokens and keys live in Secret Manager, injected as env only into these functions
const secrets = [defineSecret("PLAID_ITEMS"), defineSecret("PLAID_CLIENT_SECRET"), defineSecret("MYOS_API_KEY")];

// Public at the edge: the app itself checks the session, book key or system key on every route
export const api = onRequest({ memory: "256MiB", invoker: "public", secrets }, app);

export const dailyRefresh = onSchedule(
  { schedule: "0 6 * * *", timeZone: "America/New_York", memory: "256MiB", timeoutSeconds: 300, secrets },
  async () => {
    for (const { bookId, result } of await forEachBook(() => refreshLedger())) {
      logger.info("daily refresh", { bookId, items: result.items, reports: result.reports });
    }
  },
);
