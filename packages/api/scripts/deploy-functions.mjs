import { spawnSync } from "node:child_process";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const apiDir = join(dirname(fileURLToPath(import.meta.url)), "..");
const rootDir = join(apiDir, "..", "..");
const outDir = join(apiDir, "deploy");

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: "inherit" });
  if (result.status !== 0) process.exit(result.status ?? 1);
}

process.loadEnvFile(join(rootDir, ".env"));
const plaidEnv = process.env.PLAID_ENV ?? "production";
const store = JSON.parse(readFileSync(process.env.PLAID_TOKENS_FILE ?? join(homedir(), ".plaid", "tokens.json"), "utf8"));
const items = Object.fromEntries(
  Object.entries(store.items ?? {}).filter(([, item]) => (item.env ?? "production") === plaidEnv),
);
if (Object.keys(items).length === 0) throw new Error(`No ${plaidEnv} Plaid items to deploy`);

rmSync(outDir, { recursive: true, force: true });
mkdirSync(outDir);

// tsup bundles devDependencies, so workspace-only @myos/shared ships inside index.js
run("pnpm", ["exec", "tsup", "src/index.ts", "--format", "esm", "--platform", "node", "--target", "node22",
  "--out-dir", outDir, "--no-splitting"], apiDir);

const pkg = JSON.parse(readFileSync(join(apiDir, "package.json"), "utf8"));
writeFileSync(
  join(outDir, "package.json"),
  JSON.stringify({ name: "myos-functions", private: true, type: "module", main: "index.js", engines: { node: "22" },
    dependencies: pkg.dependencies }, null, 2),
);

const env = {
  PLAID_ENV: plaidEnv,
  PLAID_CLIENT_ID: process.env.PLAID_CLIENT_ID,
  PLAID_CLIENT_SECRET: process.env.PLAID_CLIENT_SECRET,
  PLAID_ITEMS_B64: Buffer.from(JSON.stringify({ items })).toString("base64"),
  MYOS_OWNER_UID: process.env.MYOS_OWNER_UID,
  TZ: "America/New_York",
};
writeFileSync(join(outDir, ".env"), Object.entries(env).map(([key, value]) => `${key}=${value}`).join("\n") + "\n", {
  mode: 0o600,
});

run("npm", ["install", "--omit=dev", "--no-audit", "--no-fund"], outDir);
run("firebase", ["deploy", "--only", "functions:dailyRefresh", "--project", process.env.APP_FIREBASE_PROJECT_ID,
  "--force"], rootDir);
