// IMPORTANT: This module must be the FIRST import in src/index.ts.
// ESM imports are evaluated depth-first before any top-level statement in the
// importing module, so process.env has to be populated here — not in the body
// of index.ts — for ./app.js -> config/firebase.ts -> initializeApp to see it.
//
// `pnpm api dev` already passes --env-file, in which case this is a no-op.
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const runtimeEnvironment = process.env.ENV ?? (process.env.K_SERVICE ? "production" : "local");
process.env.RUNTIME_ENV = runtimeEnvironment;

if (!process.env.APP_FIREBASE_PROJECT_ID) {
  try {
    const here = dirname(fileURLToPath(import.meta.url));
    const envPath = resolve(here, "../../../.env");
    process.loadEnvFile(envPath);
    console.log("[ENV_LOAD] Loaded:", envPath);
  } catch {
    // Deployed functions have no .env on disk — env comes from the runtime.
  }
}

// Lets a one-off script talk to another project kept in .env under a prefix, e.g. FIREBASE_ENV_PREFIX=OG_
const prefix = process.env.FIREBASE_ENV_PREFIX;
if (prefix) {
  for (const key of ["APP_FIREBASE_PROJECT_ID", "APP_FIREBASE_CLIENT_EMAIL", "APP_FIREBASE_PRIVATE_KEY"]) {
    const value = process.env[`${prefix}${key}`];
    if (!value) throw new Error(`FIREBASE_ENV_PREFIX=${prefix} but ${prefix}${key} is not set`);
    process.env[key] = value;
  }
}
