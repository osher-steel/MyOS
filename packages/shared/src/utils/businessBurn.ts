import { LineEntryStatus, PlaidTransactionStatus, type LineEntryView } from "../types/interfaces/finance.js";

export enum BusinessFlow {
  EXPENSE = "expense", // counts toward burn
  REVENUE = "revenue", // offsets net burn only
  FINANCING = "financing", // investor money: never revenue, never offsets burn
  INTERNAL = "internal", // moving the company's own money: card payoffs and the like
}

// Every other label is a monthly burn line, named however the budget names it
export const BUSINESS_CATEGORIES: ReadonlyArray<{ name: string; flow: BusinessFlow }> = [
  { name: "Lysted payouts", flow: BusinessFlow.REVENUE },
  { name: "Stripe payouts", flow: BusinessFlow.REVENUE },
  { name: "Other revenue", flow: BusinessFlow.REVENUE },
  { name: "Investment", flow: BusinessFlow.FINANCING },
  { name: "Internal transfer", flow: BusinessFlow.INTERNAL },
];

const BUSINESS_BOOKS: ReadonlySet<string> = new Set(["dibs"]);
export const isBusinessBook = (bookId: string) => BUSINESS_BOOKS.has(bookId);

const FLOW_BY_NAME = new Map(BUSINESS_CATEGORIES.map(({ name, flow }) => [name, flow]));

export const businessFlowOf = (label: string): BusinessFlow => FLOW_BY_NAME.get(label) ?? BusinessFlow.EXPENSE;

export type BurnLine = { name: string; amount: number; count: number };

/** What one allocation paid for in a month, by the label each transaction carries. */
export type PoolSpend = { goalId: string; amount: number; count: number; lines: BurnLine[] };

export type MonthBurn = {
  monthYear: string;
  grossBurn: number; // cents, refunds netted against their category
  revenue: number;
  netBurn: number; // grossBurn - revenue; negative means the month made money
  financing: number;
  internal: number;
  expenses: BurnLine[]; // largest first
  revenues: BurnLine[]; // largest first
  pools: PoolSpend[]; // paid from an allocation (a goal) instead of the monthly budget; largest first
  unclassified: LineEntryView[]; // no business category or pool yet, so in none of the figures above
};

/** Amounts use Plaid's sign, positive is money out. Only what has a business category is counted. */
export function monthBurn(entries: LineEntryView[], monthYear: string): MonthBurn {
  const lines = new Map<string, BurnLine>();
  const unclassified: LineEntryView[] = [];
  const pools = new Map<string, PoolSpend>();
  let financing = 0;
  let internal = 0;

  for (const entry of entries) {
    if (entry.monthYear !== monthYear || entry.plaidStatus === PlaidTransactionStatus.REMOVED) continue;
    if (entry.osStatus === LineEntryStatus.EXCLUDED) continue;
    if (entry.goalId) {
      const pool = pools.get(entry.goalId) ?? { goalId: entry.goalId, amount: 0, count: 0, lines: [] };
      const name = entry.label ?? "Uncategorized";
      const line = pool.lines.find((row) => row.name === name) ?? pool.lines[pool.lines.push({ name, amount: 0, count: 0 }) - 1]!;
      line.amount += entry.amount;
      line.count += 1;
      pool.amount += entry.amount;
      pool.count += 1;
      pools.set(entry.goalId, pool);
      continue;
    }
    const flow = entry.label ? businessFlowOf(entry.label) : undefined;
    if (!flow) {
      unclassified.push(entry);
    } else if (flow === BusinessFlow.FINANCING) {
      financing -= entry.amount;
    } else if (flow === BusinessFlow.INTERNAL) {
      internal += entry.amount;
    } else {
      const line = lines.get(entry.label!) ?? {
        name: entry.label!,
        amount: 0,
        count: 0,
      };
      line.amount += flow === BusinessFlow.REVENUE ? -entry.amount : entry.amount;
      line.count += 1;
      lines.set(entry.label!, line);
    }
  }

  const ofFlow = (flow: BusinessFlow) =>
    [...lines.values()].filter((line) => businessFlowOf(line.name) === flow).sort((a, b) => b.amount - a.amount);
  const total = (rows: BurnLine[]) => rows.reduce((sum, row) => sum + row.amount, 0);
  const expenses = ofFlow(BusinessFlow.EXPENSE);
  const revenues = ofFlow(BusinessFlow.REVENUE);
  const grossBurn = total(expenses);
  const revenue = total(revenues);

  return {
    monthYear,
    grossBurn,
    revenue,
    netBurn: grossBurn - revenue,
    financing,
    internal,
    expenses,
    revenues,
    pools: [...pools.values()]
      .map((pool) => ({ ...pool, lines: pool.lines.sort((a, b) => b.amount - a.amount) }))
      .sort((a, b) => b.amount - a.amount),
    unclassified,
  };
}

export type BudgetLine = {
  name: string;
  budgeted: number;
  actual: number;
  left: number; // below zero is over budget
};

export type BurnVsBudget = {
  lines: BudgetLine[];
  budgeted: number;
  actual: number;
  left: number;
  overCount: number;
};

/** Each expense category's monthly budget against what it actually burned. Pool spending isn't in it. */
export function burnVsBudget(allocations: Record<string, number>, burn: Pick<MonthBurn, "expenses">): BurnVsBudget {
  const actualByName = new Map(burn.expenses.map((line) => [line.name, line.amount]));
  const names = [...new Set([...Object.keys(allocations), ...actualByName.keys()])];
  const lines = names
    .map((name) => {
      const budgeted = allocations[name] ?? 0;
      const actual = actualByName.get(name) ?? 0;
      return { name, budgeted, actual, left: budgeted - actual };
    })
    .sort((a, b) => b.budgeted - a.budgeted || b.actual - a.actual);
  const budgeted = lines.reduce((sum, line) => sum + line.budgeted, 0);
  const actual = lines.reduce((sum, line) => sum + line.actual, 0);
  return {
    lines,
    budgeted,
    actual,
    left: budgeted - actual,
    overCount: lines.filter((line) => line.left < 0).length,
  };
}
