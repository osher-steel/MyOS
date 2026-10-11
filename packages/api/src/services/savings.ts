import {
  GOAL_ALLOCATIONS_COLLECTION,
  LINE_ENTRIES_COLLECTION,
  netPostedInflow,
  type LineEntryView,
  GOALS_COLLECTION,
  MONTH_REPORTS_COLLECTION,
  savingsSummary,
  toMonthYear,
  type GoalAllocation,
  type MonthYear,
  type SavingsState,
  type SavingsSummary,
  type StoredMonthReport,
} from "@myos/shared";
import { db } from "../config/firebase.js";
import { budgetUserId } from "../domains/budgets/budgets.domain.js";
import { effectiveBudget } from "./budgets.js";
import { linkedItems, liquidBalance } from "../integrations/plaid.js";

const stateRef = db.collection("savings").doc("state");

export async function loadSavingsState(): Promise<SavingsState | null> {
  const doc = await stateRef.get();
  return doc.exists ? (doc.data() as SavingsState) : null;
}

export async function startSavings(startMonth: MonthYear): Promise<SavingsState> {
  const state = { startMonth };
  await stateRef.set(state);
  return state;
}

/**
 * Opening savings is what the liquid accounts held as the start month began:
 * today's balance with every posted movement on them since then undone. Each
 * month's result then adds entry minus spending on top.
 */
export async function computeOpening(): Promise<SavingsState> {
  const state = await loadSavingsState();
  if (!state) throw new Error("Savings has no start month yet.");
  const { balance, accountIds } = await liquidBalance(linkedItems());
  const since = await db.collection(LINE_ENTRIES_COLLECTION).where("date", ">=", `${state.startMonth}-01`).get();
  const movedSince = netPostedInflow(
    since.docs.map((doc) => doc.data() as LineEntryView),
    accountIds,
  );
  const next = { ...state, opening: { amount: balance - movedSince, balance, movedSince, computedAt: new Date() } };
  await stateRef.set(next);
  return next;
}

/** Runs from the daily refresh: records the opening once the start month has begun and has a budget. */
export async function ensureOpening(): Promise<boolean> {
  const state = await loadSavingsState();
  if (!state || state.opening || state.startMonth > toMonthYear()) return false;
  if (!(await effectiveBudget(budgetUserId(), state.startMonth))) return false;
  await computeOpening();
  return true;
}

export async function loadSavingsSummary(): Promise<SavingsSummary> {
  const [state, reports, allocations, goals] = await Promise.all([
    loadSavingsState(),
    db.collection(MONTH_REPORTS_COLLECTION).get(),
    db.collection(GOAL_ALLOCATIONS_COLLECTION).get(),
    db.collection(GOALS_COLLECTION).get(),
  ]);
  return savingsSummary(
    state,
    reports.docs.map((doc) => doc.data() as StoredMonthReport),
    allocations.docs.map((doc) => doc.data() as GoalAllocation),
    goals.docs.map((doc) => doc.get("amountSaved") as number),
  );
}
