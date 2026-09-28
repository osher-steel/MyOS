import {
  GOAL_ALLOCATIONS_COLLECTION,
  GOALS_COLLECTION,
  GoalAllocationReason,
  monthSavingsShares,
  type MonthReport,
  type MonthYear,
} from "@myos/shared";
import { db } from "../config/firebase.js";
import { newGoalRecord } from "../domains/goals/goals.domain.js";

const goals = db.collection(GOALS_COLLECTION);
const allocations = db.collection(GOAL_ALLOCATIONS_COLLECTION);

export async function recomputeGoalBalances(goalIds: Iterable<string>): Promise<void> {
  for (const goalId of new Set(goalIds)) {
    const ledger = await allocations.where("goalId", "==", goalId).get();
    const amountSaved = ledger.docs.reduce((sum, doc) => sum + (doc.get("amount") as number), 0);
    await goals.doc(goalId).update({ amountSaved, updatedAt: new Date() });
  }
}

async function goalIdsByName(names: string[]): Promise<Map<string, string>> {
  const ids = new Map((await goals.get()).docs.map((doc) => [doc.get("name") as string, doc.id]));
  for (const name of names) {
    if (ids.has(name)) continue;
    const ref = goals.doc();
    await ref.create(newGoalRecord({ name }));
    ids.set(name, ref.id);
  }
  return ids;
}

/** Replaces the month's savings allocations with the report's shares; covers and manual moves stay. */
export async function allocateMonthSavings(monthYear: MonthYear, report: MonthReport): Promise<void> {
  const shares = monthSavingsShares(report);
  const ids = await goalIdsByName(shares.map((share) => share.name));
  const previous = await allocations
    .where("monthYear", "==", monthYear)
    .where("reason", "==", GoalAllocationReason.MONTH_SAVINGS)
    .get();

  const now = new Date();
  const batch = db.batch();
  for (const doc of previous.docs) batch.delete(doc.ref);
  for (const share of shares) {
    batch.set(allocations.doc(), {
      goalId: ids.get(share.name)!,
      monthYear,
      amount: share.amount,
      reason: GoalAllocationReason.MONTH_SAVINGS,
      createdAt: now,
    });
  }
  await batch.commit();

  await recomputeGoalBalances([
    ...previous.docs.map((doc) => doc.get("goalId") as string),
    ...shares.map((share) => ids.get(share.name)!),
  ]);
}

export async function deficitCoveredIn(monthYear: MonthYear): Promise<number> {
  const covers = await allocations
    .where("monthYear", "==", monthYear)
    .where("reason", "==", GoalAllocationReason.DEFICIT_COVER)
    .get();
  return covers.docs.reduce((sum, doc) => sum - (doc.get("amount") as number), 0);
}
