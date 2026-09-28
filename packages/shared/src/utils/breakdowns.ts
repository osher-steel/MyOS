import { LineEntryStatus, PlaidTransactionStatus, type LineEntryView } from "../types/interfaces/finance.js";

export type Tally = { count: number; amount: number };

export interface LineEntryBreakdowns {
  byLabel: Record<string, Tally>;
  byTag: Record<string, Tally>;
  byCategory: Record<string, Tally>;
  byMerchant: Record<string, Tally>;
}

function add(tallies: Record<string, Tally>, key: string | undefined, amount: number): void {
  if (!key) return;
  const tally = (tallies[key] ??= { count: 0, amount: 0 });
  tally.count += 1;
  tally.amount += amount;
}

/** Amounts keep Plaid's sign: refunds net out of their tally, and income labels tally negative. */
export function lineEntryBreakdowns(rows: LineEntryView[]): LineEntryBreakdowns {
  const breakdowns: LineEntryBreakdowns = { byLabel: {}, byTag: {}, byCategory: {}, byMerchant: {} };
  for (const row of rows) {
    if (row.plaidStatus === PlaidTransactionStatus.REMOVED || row.osStatus === LineEntryStatus.EXCLUDED) continue;
    add(breakdowns.byLabel, row.label, row.amount);
    add(breakdowns.byCategory, row.categoryDetailed, row.amount);
    add(breakdowns.byMerchant, row.merchantName ?? row.descriptionKey ?? row.name, row.amount);
    for (const tag of row.tags ?? []) add(breakdowns.byTag, tag, row.amount);
  }
  return breakdowns;
}
