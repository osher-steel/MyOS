import { writeFileSync } from "node:fs";
import { join } from "node:path";
import { env, readRootJson, REPO_ROOT } from "./env";

const BASE = "https://sandbox.plaid.com";
const TOKEN_FILE = ".plaid_sandbox.json";
const SANDBOX_INSTITUTION = "ins_109508"; // First Platypus Bank

export type Account = {
  name: string;
  mask: string | null;
  type: string;
  current: number | null;
  available: number | null;
  currency: string;
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

/**
 * Sandbox items are disposable, so the whole Link flow collapses into two
 * calls. The resulting token is cached so restarts reuse the same fake bank.
 */
async function accessToken(): Promise<string> {
  const cached = readRootJson<{ access_token: string }>(TOKEN_FILE);
  if (cached?.access_token) {
    return cached.access_token;
  }

  const { public_token } = await plaid<{ public_token: string }>("/sandbox/public_token/create", {
    institution_id: SANDBOX_INSTITUTION,
    initial_products: ["transactions"],
  });
  const { access_token } = await plaid<{ access_token: string }>("/item/public_token/exchange", {
    public_token,
  });

  writeFileSync(join(REPO_ROOT, TOKEN_FILE), JSON.stringify({ access_token }, null, 2), {
    mode: 0o600,
  });
  return access_token;
}

export async function getAccounts(): Promise<Account[]> {
  const data = await plaid<{
    accounts: Array<{
      name: string;
      mask: string | null;
      subtype: string | null;
      type: string;
      balances: { current: number | null; available: number | null; iso_currency_code: string | null };
    }>;
  }>("/accounts/balance/get", { access_token: await accessToken() });

  return data.accounts.map((account) => ({
    name: account.name,
    mask: account.mask,
    type: account.subtype ?? account.type,
    current: account.balances.current,
    available: account.balances.available,
    currency: account.balances.iso_currency_code ?? "USD",
  }));
}

export async function getTransactions(limit = 8): Promise<Transaction[]> {
  const data = await plaid<{
    added: Array<{ name: string; amount: number; date: string; iso_currency_code: string | null }>;
  }>("/transactions/sync", { access_token: await accessToken(), count: 100 });

  return data.added
    .sort((a, b) => b.date.localeCompare(a.date))
    .slice(0, limit)
    .map((tx) => ({
      name: tx.name,
      amount: tx.amount,
      date: tx.date,
      currency: tx.iso_currency_code ?? "USD",
    }));
}
