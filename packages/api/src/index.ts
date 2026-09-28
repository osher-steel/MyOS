// MUST be first: side-effect import that populates process.env before
// ./app.js -> config/firebase.ts initializes the admin SDK.
import "./load-env.js";

import { logger } from "firebase-functions/v2";
import { onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { app } from "./app.js";
import { refreshLedger } from "./services/ledgerRefresh.js";

// Firestore triggers get re-exported here as domains grow, exactly like the
// monorepo: `export * from "./domains/<domain>/triggers/<file>.js";`

export const api = onRequest({ memory: "256MiB" }, app);

export const dailyRefresh = onSchedule(
  { schedule: "0 6 * * *", timeZone: "America/New_York", memory: "256MiB", timeoutSeconds: 300 },
  async () => {
    const { items, reports } = await refreshLedger();
    logger.info("daily refresh", { items, reports });
  },
);
