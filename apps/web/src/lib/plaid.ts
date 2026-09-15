import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { homedir } from "node:os";
import { dirname, join } from "node:path";
import type { MonthYear, PlaidTransaction } from "@myos/shared";
import { env } from "./env";

/**
 * PLAID_ENV picks the API host. Production is the default; set
 * PLAID_ENV=sandbox (with a sandbox secret) to fall back to fake banks.
 */
const PLAID_ENV = process.env.PLAID_ENV ?? "production";
const BASE = `https://${PLAID_ENV}.plaid.com`;

/**
 * Access tokens are shared with the `plaid` skill, which owns the one-time
 * Plaid Link browser flow that production tokens require:
 *
 *   python3 ~/.claude/skills/plaid/link_server.py <bank-nickname>
 *
 * Every Item in the store that matches PLAID_ENV is read and merged.
 */
const TOKENS_FILE = process.env.PLAID_TOKENS_FILE ?? join(homedir(), ".plaid", "tokens.json");
const SANDBOX_INSTITUTION = "ins_109508"; // First Platypus Bank

type Item = { access_token: string; item_id?: string; institution?: string; env?: string };
type TokenStore = { items?: Record<string, Item> };

export type Account = {
  name: string;
  mask: string | null;
  type: string;
  current: number | null;
  available: number | null;
  currency: string;
  bank: string;
};

export type Transaction = {
  name: string;
  amount: number;
  date: string;
  currency: string;
};

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`${BASE}${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    cache: "no-store",
    body: JSON.stringify({
      client_id: env("PLAID_CLIENT_ID"),
      secret: env("PLAID_CLIENT_SECRET"),
      ...body,
    }),
  });
  const data = await res.json();
  if (!res.ok) {
    throw new Error(`Plaid ${path} ${res.status}: ${data.error_code} ${data.error_message}`);
  }
  return data as T;
}

function readStore(): TokenStore {
  try {
    return JSON.parse(readFileSync(TOKENS_FILE, "utf8")) as TokenStore;
  } catch {
    return {};
  }
}

/** Sandbox Items are disposable, so a missing one is minted on the spot. */
async function mintSandboxItem(): Promise<Item> {
  const { public_token } = await plaid<{ public_token: string }>("/sandbox/public_token/create", {
    institution_id: SANDBOX_INSTITUTION,
    initial_products: ["transactions"],
  });
  const { access_token, item_id } = await plaid<{ access_token: string; item_id: string }>(
    "/item/public_token/exchange",
    { public_token },
  );
  const item: Item = {
    access_token,
    item_id,
    institution: `sandbox:${SANDBOX_INSTITUTION}`,
    env: "sandbox",
  };

  const store = readStore();
  store.items = { ...store.items, sbox: item };
  mkdirSync(dirname(TOKENS_FILE), { recursive: true });
  writeFileSync(TOKENS_FILE, JSON.stringify(store, null, 2), { mode: 0o600 });
  return item;
}

async function linkedItems(): Promise<Array<[string, Item]>> {
  const items = Object.entries(readStore().items ?? {}).filter(
    ([, item]) => item.access_token && (item.env ?? "production") === PLAID_ENV,
  );
  if (items.length > 0) {
    return items;
  }
  if (PLAID_ENV === "sandbox") {
    return [["sbox", await mintSandboxItem()]];
  }
  throw new Error(
    `No ${PLAID_ENV} bank linked in ${TOKENS_FILE}. ` +
      "Run: python3 ~/.claude/skills/plaid/link_server.py <bank-nickname>",
  );
}

export async function getAccounts(): Promise<Account[]> {
  const items = await linkedItems();
  const perItem = await Promise.all(
    items.map(async ([nickname, item]) => {
      const data = await plaid<{
        accounts: Array<{
          name: string;
          mask: string | null;
          subtype: string | null;
          type: string;
          balances: {
            current: number | null;
            available: number | null;
            iso_currency_code: string | null;
          };
        }>;
      }>("/accounts/balance/get", { access_token: item.access_token });

      return data.accounts.map((account) => ({
        name: account.name,
        mask: account.mask,
        type: account.subtype ?? account.type,
        current: account.balances.current,
        available: account.balances.available,
        currency: account.balances.iso_currency_code ?? "USD",
        bank: item.institution ?? nickname,
      }));
    }),
  );
  return perItem.flat();
}

export async function getTransactions(limit = 8): Promise<Transaction[]> {
  const items = await linkedItems();
  const perItem = await Promise.all(
    items.map(([, item]) =>
      plaid<{
        added: Array<{ name: string; amount: number; date: string; iso_currency_code: string | null }>;
      }>("/transactions/sync", { access_token: item.access_token, count: 100 }),
    ),
  );

  return perItem
    .flatMap((data) => data.added)
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((tx) => ({
      name: tx.name,
      amount: tx.amount,
      date: tx.date,
      currency: tx.iso_currency_code ?? "USD",
    }));
}

type PlaidTransactionRow = {
  transaction_id: string;
  pending_transaction_id: string | null;
  name: string;
  amount: number;
  date: string;
  iso_currency_code: string | null;
  pending: boolean;
};

type TransactionsPage = { transactions: PlaidTransactionRow[]; total_transactions: number };

const PAGE_SIZE = 500;

function monthBounds(monthYear: MonthYear): { start_date: string; end_date: string } {
  const [year, month] = monthYear.split("-").map(Number) as [number, number];
  const lastDay = new Date(year, month, 0).getDate();
  return { start_date: `${monthYear}-01`, end_date: `${monthYear}-${String(lastDay).padStart(2, "0")}` };
}

async function itemTransactionsInMonth(accessToken: string, monthYear: MonthYear): Promise<PlaidTransactionRow[]> {
  const bounds = monthBounds(monthYear);
  const rows: PlaidTransactionRow[] = [];
  let total = Infinity;
  while (rows.length < total) {
    const page = await plaid<TransactionsPage>("/transactions/get", {
      access_token: accessToken,
      ...bounds,
      options: { count: PAGE_SIZE, offset: rows.length },
    });
    rows.push(...page.transactions);
    total = page.total_transactions;
    if (page.transactions.length === 0) break;
  }
  return rows;
}

export async function getTransactionsInMonth(monthYear: MonthYear): Promise<PlaidTransaction[]> {
  const items = await linkedItems();
  const perItem = await Promise.all(items.map(([, item]) => itemTransactionsInMonth(item.access_token, monthYear)));

  return perItem.flat().map((tx) => ({
    id: tx.transaction_id,
    name: tx.name,
    amount: tx.amount,
    date: tx.date,
    currency: tx.iso_currency_code ?? "USD",
    pending: tx.pending,
    ...(tx.pending_transaction_id ? { pendingTransactionId: tx.pending_transaction_id } : {}),
  }));
}
