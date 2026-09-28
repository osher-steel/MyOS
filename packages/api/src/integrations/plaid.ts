import { readFileSync } from "node:fs";
import { homedir } from "node:os";
import { join } from "node:path";
import { toCents, type PlaidSyncDelta, type PlaidTransaction } from "@myos/shared";
import { ServiceUpstreamError } from "../core/errors/errors.js";

export type PlaidItem = { itemId: string; accessToken: string; institution: string };

type StoredItem = { access_token?: string; item_id?: string; institution?: string; env?: string };

type PlaidTransactionRow = {
  transaction_id: string;
  pending_transaction_id: string | null;
  name: string;
  amount: number;
  date: string;
  iso_currency_code: string | null;
  pending: boolean;
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

export function linkedItems(): PlaidItem[] {
  let items: Record<string, StoredItem>;
  try {
    items = (JSON.parse(readFileSync(tokensFile(), "utf8")) as { items?: Record<string, StoredItem> }).items ?? {};
  } catch {
    items = {};
  }

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

function toTransaction(row: PlaidTransactionRow): PlaidTransaction {
  return {
    id: row.transaction_id,
    name: row.name,
    amount: toCents(row.amount),
    date: row.date,
    currency: row.iso_currency_code ?? "USD",
    pending: row.pending,
    ...(row.pending_transaction_id ? { pendingTransactionId: row.pending_transaction_id } : {}),
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
