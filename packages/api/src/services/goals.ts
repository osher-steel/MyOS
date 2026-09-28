import {
  GOAL_ALLOCATIONS_COLLECTION,
  GOALS_COLLECTION,
  GoalAllocationReason,
  GoalStatus,
  LINE_ENTRIES_COLLECTION,
  PlaidTransactionStatus,
  transferErrors,
  type LineEntryView,
  type MonthYear,
} from "@myos/shared";
import { db } from "../config/firebase.js";
import { activeGoal, goalRulesError } from "../domains/goals/goals.domain.js";
import type { GoalEntity } from "../domains/goals/goals.types.js";

const goals = db.collection(GOALS_COLLECTION);
const allocations = db.collection(GOAL_ALLOCATIONS_COLLECTION);
const lineEntries = db.collection(LINE_ENTRIES_COLLECTION);

export async function recomputeGoalBalances(goalIds: Iterable<string>): Promise<void> {
  for (const goalId of new Set(goalIds)) {
    const ledger = await allocations.where("goalId", "==", goalId).get();
    const amountSaved = ledger.docs.reduce((sum, doc) => sum + (doc.get("amount") as number), 0);
    await goals.doc(goalId).update({ amountSaved, updatedAt: new Date() });
  }
}

export async function assignedIn(monthYear: MonthYear): Promise<number> {
  const assigned = await allocations
    .where("monthYear", "==", monthYear)
    .where("reason", "==", GoalAllocationReason.ASSIGNMENT)
    .get();
  return assigned.docs.reduce((sum, doc) => sum + (doc.get("amount") as number), 0);
}

const spendId = (lineEntryId: string) => `spend_${lineEntryId}`;

/** Keeps one goal_spend allocation per goal-labelled transaction, keyed by the transaction id. */
export async function syncGoalSpends(lineEntryIds: Iterable<string>): Promise<void> {
  const touchedGoals = new Set<string>();
  for (const id of new Set(lineEntryIds)) {
    const [entryDoc, spendDoc] = await Promise.all([lineEntries.doc(id).get(), allocations.doc(spendId(id)).get()]);
    const entry = entryDoc.exists ? (entryDoc.data() as LineEntryView) : null;
    const previousGoal = spendDoc.exists ? (spendDoc.get("goalId") as string) : undefined;
    if (previousGoal) touchedGoals.add(previousGoal);

    if (!entry?.goalId || entry.plaidStatus === PlaidTransactionStatus.REMOVED) {
      if (spendDoc.exists) await spendDoc.ref.delete();
      continue;
    }
    touchedGoals.add(entry.goalId);
    await spendDoc.ref.set({
      goalId: entry.goalId,
      monthYear: entry.monthYear,
      amount: -entry.amount,
      reason: GoalAllocationReason.GOAL_SPEND,
      lineEntryId: id,
      createdAt: spendDoc.exists ? spendDoc.get("createdAt") : new Date(),
    });
  }
  await recomputeGoalBalances(touchedGoals);
}

export type TransferInput = { fromGoalId: string; toGoalId: string; amount: number; monthYear: MonthYear; note?: string };

/** Both legs share a transferId so undoing one undoes the pair; month reports are never touched. */
export async function transferBetweenGoals(input: TransferInput): Promise<string> {
  const [from, to] = await Promise.all([activeGoal(input.fromGoalId), activeGoal(input.toGoalId)]);
  const errors = transferErrors({
    amount: input.amount,
    fromName: from.name,
    fromBalance: from.amountSaved,
    sameGoal: from.id === to.id,
  });
  if (errors.length > 0) throw goalRulesError(errors);

  const transferId = allocations.doc().id;
  const leg = (goalId: string, amount: number) => ({
    goalId,
    monthYear: input.monthYear,
    amount,
    reason: GoalAllocationReason.TRANSFER,
    transferId,
    ...(input.note ? { note: input.note } : {}),
    createdAt: new Date(),
  });
  const batch = db.batch();
  batch.set(allocations.doc(), leg(from.id, -input.amount));
  batch.set(allocations.doc(), leg(to.id, input.amount));
  await batch.commit();
  await recomputeGoalBalances([from.id, to.id]);
  return transferId;
}

export async function deleteTransfer(transferId: string): Promise<void> {
  const legs = await allocations.where("transferId", "==", transferId).get();
  const batch = db.batch();
  for (const doc of legs.docs) batch.delete(doc.ref);
  await batch.commit();
  await recomputeGoalBalances(legs.docs.map((doc) => doc.get("goalId") as string));
}

/** Leftover goes back to unassigned savings; an overdrawn goal must be topped up first. */
export async function completeGoal(goalId: string): Promise<GoalEntity> {
  const goal = await activeGoal(goalId);
  if (goal.amountSaved < 0) throw goalRulesError([`${goal.name} is overdrawn; move funds in before completing it.`]);

  const now = new Date();
  if (goal.amountSaved > 0) {
    await allocations.doc().set({
      goalId,
      amount: -goal.amountSaved,
      reason: GoalAllocationReason.RELEASE,
      createdAt: now,
    });
  }
  await goals.doc(goalId).update({ status: GoalStatus.COMPLETED, completedAt: now, updatedAt: now });
  await recomputeGoalBalances([goalId]);
  return { ...goal, amountSaved: 0, status: GoalStatus.COMPLETED, completedAt: now, updatedAt: now };
}
