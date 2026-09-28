import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { toCents, type Counterparty, type PlaidSyncDelta, type PlaidTransaction } from "@myos/shared";
import { ServiceUpstreamError } from "../core/errors/errors.js";

export type PlaidItem = { itemId: string; accessToken: string; institution: string };

type StoredItem = { access_token?: string; item_id?: string; institution?: string; env?: string };

type PlaidTransactionRow = {
  transaction_id: string;
  pending_transaction_id: string | null;
  account_id: string;
  name: string;
  merchant_name: string | null;
  merchant_entity_id: string | null;
  original_description: string | null;
  amount: number;
  date: string;
  authorized_date: string | null;
  iso_currency_code: string | null;
  pending: boolean;
  payment_channel: string | null;
  logo_url: string | null;
  website: string | null;
  location: { city: string | null; region: string | null } | null;
  personal_finance_category: { primary: string; detailed: string; confidence_level: string | null } | null;
  counterparties: Array<{ name: string; type: string; entity_id: string | null }> | null;
};

type SyncPage = {
  added: PlaidTransactionRow[];
  modified: PlaidTransactionRow[];
  removed: Array<{ transaction_id: string }>;
  next_cursor: string;
  has_more: boolean;
};

const SYNC_PAGE_SIZE = 500;
const MAX_PAGINATION_RESTARTS = 3;

const plaidEnv = () => process.env.PLAID_ENV ?? "production";

// Tokens are minted by the plaid skill's Link flow and shared with it.
const tokensFile = () => process.env.PLAID_TOKENS_FILE ?? join(homedir(), ".plaid", "tokens.json");

function storedItems(): Record<string, StoredItem> {
  // Deployed functions get the token store as env, since there is no file to read
  const encoded = process.env.PLAID_ITEMS_B64;
  try {
    const raw = encoded ? Buffer.from(encoded, "base64").toString("utf8") : readFileSync(tokensFile(), "utf8");
    return (JSON.parse(raw) as { items?: Record<string, StoredItem> }).items ?? {};
  } catch {
    return {};
  }
}

export function linkedItems(): PlaidItem[] {
  const items = storedItems();

  return Object.entries(items)
    .filter(([, item]) => item.access_token && (item.env ?? "production") === plaidEnv())
    .map(([nickname, item]) => ({
      itemId: item.item_id ?? nickname,
      accessToken: item.access_token!,
      institution: item.institution ?? nickname,
    }));
}

class PlaidApiError extends ServiceUpstreamError {
  constructor(
    path: string,
    public readonly plaidCode: string,
    message: string,
  ) {
    super(`Plaid ${path}: ${plaidCode} ${message}`, { plaidCode });
  }
}

async function plaid<T>(path: string, body: Record<string, unknown>): Promise<T> {
  const res = await fetch(`https://${plaidEnv()}.plaid.com${path}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      client_id: process.env.PLAID_CLIENT_ID,
      secret: process.env.PLAID_CLIENT_SECRET,
      ...body,
    }),
  });
  const data = (await res.json()) as T & { error_code?: string; error_message?: string };
  if (!res.ok) throw new PlaidApiError(path, data.error_code ?? `HTTP_${res.status}`, data.error_message ?? "");
  return data as T;
}

function present<T extends Record<string, unknown>>(fields: T): Partial<{ [K in keyof T]: NonNullable<T[K]> }> {
  return Object.fromEntries(Object.entries(fields).filter(([, value]) => value !== null && value !== undefined)) as Partial<{
    [K in keyof T]: NonNullable<T[K]>;
  }>;
}

function toCounterparties(rows: PlaidTransactionRow["counterparties"]): Counterparty[] {
  return (rows ?? []).map((row) => ({ name: row.name, type: row.type, ...(row.entity_id ? { entityId: row.entity_id } : {}) }));
}

function toTransaction(row: PlaidTransactionRow): PlaidTransaction {
  const category = row.personal_finance_category;
  return {
    id: row.transaction_id,
    name: row.name,
    amount: toCents(row.amount),
    date: row.date,
    currency: row.iso_currency_code ?? "USD",
    pending: row.pending,
    accountId: row.account_id,
    counterparties: toCounterparties(row.counterparties),
    ...present({
      pendingTransactionId: row.pending_transaction_id,
      merchantName: row.merchant_name,
      merchantEntityId: row.merchant_entity_id,
      originalDescription: row.original_description,
      categoryPrimary: category?.primary,
      categoryDetailed: category?.detailed,
      categoryConfidence: category?.confidence_level,
      paymentChannel: row.payment_channel,
      authorizedDate: row.authorized_date,
      logoUrl: row.logo_url,
      website: row.website,
      city: row.location?.city,
      region: row.location?.region,
    }),
  };
}

/** Every change since `cursor`, all pages collected before anything is applied. */
export async function syncTransactions(
  item: PlaidItem,
  cursor: string | undefined,
): Promise<{ delta: PlaidSyncDelta; nextCursor: string }> {
  for (let attempt = 0; ; attempt += 1) {
    const delta: PlaidSyncDelta = { added: [], modified: [], removed: [] };
    let pageCursor = cursor;
    try {
      for (;;) {
        const page = await plaid<SyncPage>("/transactions/sync", {
          access_token: item.accessToken,
          count: SYNC_PAGE_SIZE,
          options: { include_original_description: true },
          ...(pageCursor ? { cursor: pageCursor } : {}),
        });
        delta.added.push(...page.added.map(toTransaction));
        delta.modified.push(...page.modified.map(toTransaction));
        delta.removed.push(...page.removed.map((row) => row.transaction_id));
        pageCursor = page.next_cursor;
        if (!page.has_more) return { delta, nextCursor: pageCursor };
      }
    } catch (error) {
      // Plaid's documented recovery: restart the whole run from the original cursor
      const restartable =
        error instanceof PlaidApiError && error.plaidCode === "TRANSACTIONS_SYNC_MUTATION_DURING_PAGINATION";
      if (!restartable || attempt >= MAX_PAGINATION_RESTARTS) throw error;
    }
  }
}

type AccountsResponse = {
  accounts: Array<{ type: string; subtype: string | null; balances: { current: number | null } }>;
};

const LIQUID_SUBTYPES = new Set(["checking", "savings"]);

/** Cached balances from /accounts/get; /accounts/balance/get is billed per call. */
export async function liquidBalance(items: PlaidItem[]): Promise<number> {
  const responses = await Promise.all(
    items.map((item) => plaid<AccountsResponse>("/accounts/get", { access_token: item.accessToken })),
  );
  return responses
    .flatMap((response) => response.accounts)
    .filter((account) => account.type === "depository" && LIQUID_SUBTYPES.has(account.subtype ?? ""))
    .reduce((sum, account) => sum + toCents(account.balances.current ?? 0), 0);
}
