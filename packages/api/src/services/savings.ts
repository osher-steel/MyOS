import {
  budgetId,
  GOAL_ALLOCATIONS_COLLECTION,
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
import { budgetRepo, budgetUserId } from "../domains/budgets/budgets.domain.js";
import { totalAllocated } from "../domains/budgets/budgets.schemas.js";
import type { BudgetEntity } from "../domains/budgets/budgets.types.js";
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
 * Opening savings is what the linked accounts hold minus everything the start
 * month's budget allocates, i.e. money that was already there before the plan.
 */
export async function computeOpening(): Promise<SavingsState> {
  const state = await loadSavingsState();
  if (!state) throw new Error("Savings has no start month yet.");
  const budget = (await budgetRepo.get(budgetId(budgetUserId(), state.startMonth))) as BudgetEntity;
  const balance = await liquidBalance(linkedItems());
  const allocated = totalAllocated(budget);
  const next = { ...state, opening: { amount: balance - allocated, balance, allocated, computedAt: new Date() } };
  await stateRef.set(next);
  return next;
}

/** Runs from the daily refresh: records the opening once the start month has begun and has a budget. */
export async function ensureOpening(): Promise<boolean> {
  const state = await loadSavingsState();
  if (!state || state.opening || state.startMonth > toMonthYear()) return false;
  const budget = await db.collection("budgets").doc(budgetId(budgetUserId(), state.startMonth)).get();
  if (!budget.exists) return false;
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
