// MUST be first: side-effect import that populates process.env before
// ./app.js -> config/firebase.ts initializes the admin SDK.
import "./load-env.js";

import { onRequest } from "firebase-functions/v2/https";
import { app } from "./app.js";

// Firestore triggers get re-exported here as domains grow, exactly like the
// monorepo: `export * from "./domains/<domain>/triggers/<file>.js";`

export const api = onRequest({ memory: "256MiB" }, app);
