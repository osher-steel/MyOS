// Links a bank through Plaid Link in the browser and adds it to the token store:
//   pnpm api plaid:link <nickname> --book <bookId>
// It only changes the local store. `pnpm api deploy:functions` sends that store to production,
// replacing what's there, so the store has to already hold the existing links.
import { randomBytes } from "node:crypto";
import { existsSync, readFileSync, renameSync, writeFileSync } from "node:fs";
import { createServer } from "node:http";
import { homedir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";

const { values, positionals } = parseArgs({ allowPositionals: true, options: { book: { type: "string" }, port: { type: "string" } } });
const nickname = positionals[0];
const book = values.book;
const port = Number(values.port ?? 8765);
const plaidEnv = process.env.PLAID_ENV ?? "production";
const tokensFile = process.env.PLAID_TOKENS_FILE ?? join(homedir(), ".plaid", "tokens.json");

function fail(message: string): never {
  console.error(`Error: ${message}`);
  process.exit(1);
}

if (!nickname || !book) fail("Usage: pnpm api plaid:link <nickname> --book <bookId>");
if (!/^[a-z0-9][a-z0-9-]{0,40}$/.test(book)) fail(`"${book}" isn't a book id.`);
if (!existsSync(tokensFile)) {
  fail(`${tokensFile} doesn't exist. Restore the existing links first, or the next deploy would drop them from production.`);
}

type Store = { items?: Record<string, Record<string, unknown>> };
const readStore = () => JSON.parse(readFileSync(tokensFile, "utf8")) as Store;
if (readStore().items?.[nickname]) fail(`"${nickname}" is already in the token store. Pick another nickname.`);

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${plaidEnv}.plaid.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ client_id: process.env.PLAID_CLIENT_ID, secret: process.env.PLAID_CLIENT_SECRET, ...body }),
  });
  const data = (await res.json()) as T & { error_code?: string; error_message?: string };
  if (!res.ok) throw new Error(`Plaid ${path}: ${data.error_code} ${data.error_message}`);
  return data;
}

const { link_token: linkToken } = await plaid<{ link_token: string }>("/link/token/create", {
  client_name: "MyOS",
  language: "en",
  country_codes: ["US"],
  user: { client_user_id: `myos-${book}` },
  products: ["transactions"],
  transactions: { days_requested: 730 },
});

const nonce = randomBytes(16).toString("hex");
const page = `<!doctype html><meta charset="utf-8"><title>Link ${nickname}</title>
<body style="font-family:system-ui;padding:3rem"><h1>Link "${nickname}" to the ${book} book</h1><p id="status">Opening Plaid…</p>
<script src="https://cdn.plaid.com/link/v2/stable/link-initialize.js"></script>
<script>
const status = document.getElementById("status");
Plaid.create({
  token: ${JSON.stringify(linkToken)},
  onSuccess: async (public_token, metadata) => {
    status.textContent = "Saving…";
    const res = await fetch("/exchange", { method: "POST", headers: { "X-Nonce": ${JSON.stringify(nonce)} },
      body: JSON.stringify({ public_token, institution: metadata.institution && metadata.institution.name }) });
    status.textContent = res.ok ? "Linked. You can close this tab." : "Saving failed. See the terminal.";
  },
  onExit: (error) => { status.textContent = error ? "Plaid error: " + error.display_message : "Closed without linking. Reload to try again."; },
}).open();
</script>`;

const server = createServer((req, res) => {
  if (req.method === "GET" && req.url === "/") {
    res.setHeader("Content-Type", "text/html");
    return res.end(page);
  }
  if (req.method !== "POST" || req.url !== "/exchange" || req.headers["x-nonce"] !== nonce) {
    res.statusCode = 404;
    return res.end();
  }
  let raw = "";
  req.on("data", (chunk) => (raw += chunk));
  req.on("end", async () => {
    try {
      const { public_token, institution } = JSON.parse(raw) as { public_token: string; institution?: string };
      const { access_token, item_id } = await plaid<{ access_token: string; item_id: string }>("/item/public_token/exchange", { public_token });
      const store = readStore();
      store.items = { ...store.items, [nickname]: { access_token, item_id, institution: institution ?? nickname, env: plaidEnv, book } };
      const temp = `${tokensFile}.tmp`;
      writeFileSync(temp, JSON.stringify(store, null, 2), { mode: 0o600 });
      renameSync(temp, tokensFile);
      res.end();
      console.log(`Linked ${institution ?? nickname} as "${nickname}" in book "${book}". Deploy to send it to production.`);
      server.close(() => process.exit(0));
      server.closeAllConnections();
    } catch (error) {
      console.error(`Error: ${(error as Error).message}`);
      res.statusCode = 500;
      res.end();
      process.exitCode = 1;
    }
  });
});

server.listen(port, "127.0.0.1", () => console.log(`Open http://localhost:${port} to link "${nickname}" (${plaidEnv}, book ${book}).`));
