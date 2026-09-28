import {
  assignmentErrors,
  GOAL_ALLOCATIONS_COLLECTION,
  GoalAllocationReason,
  monthReportId,
  toMonthYear,
} from "@myos/shared";
import { ServiceNotFoundError } from "../../core/errors/errors.js";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner, WriteChange } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { assignedIn, deleteTransfer, recomputeGoalBalances } from "../../services/goals.js";
import { loadSavingsState, loadSavingsSummary } from "../../services/savings.js";
import { budgetUserId } from "../budgets/budgets.domain.js";
import { activeGoal, goalRulesError } from "../goals/goals.domain.js";
import { monthReportRepo } from "../monthReports/monthReports.domain.js";
import type { MonthReportEntity } from "../monthReports/monthReports.types.js";
import { goalAllocationQueryFilterFields, goalAllocationQuerySchema } from "./goalAllocations.query.js";
import { goalAllocationPostSchema, goalAllocationRecordSchema } from "./goalAllocations.schemas.js";
import type {
  GoalAllocationEntity,
  GoalAllocationPost,
  GoalAllocationQuery,
  GoalAllocationRecord,
} from "./goalAllocations.types.js";

export const goalAllocationRepo = new FirestoreRepo<
  FirestoreRepoTypeSet<GoalAllocationEntity, GoalAllocationRecord, GoalAllocationQuery, GoalAllocationRecord>
>(GOAL_ALLOCATIONS_COLLECTION, goalAllocationQueryFilterFields);

async function monthRemaining(monthYear: string): Promise<number> {
  const state = await loadSavingsState();
  if (!state) throw goalRulesError(["Savings tracking hasn't started yet."]);
  if (monthYear < state.startMonth) throw goalRulesError([`Savings tracking starts in ${state.startMonth}, so ${monthYear} isn't counted.`]);
  if (monthYear >= toMonthYear()) throw goalRulesError([`${monthYear} isn't finished yet.`]);
  let report: MonthReportEntity;
  try {
    report = await monthReportRepo.get(monthReportId(budgetUserId(), monthYear));
  } catch (error) {
    if (error instanceof ServiceNotFoundError) throw goalRulesError([`${monthYear} has no report yet.`]);
    throw error;
  }
  return report.savingsResult - (await assignedIn(monthYear));
}

export async function buildAssignmentRecord(input: GoalAllocationPost): Promise<GoalAllocationRecord> {
  const goal = await activeGoal(input.goalId);
  const errors = assignmentErrors({
    amount: input.amount,
    goalName: goal.name,
    goalBalance: goal.amountSaved,
    monthRemaining: input.monthYear ? await monthRemaining(input.monthYear) : undefined,
    unassigned: input.monthYear ? 0 : (await loadSavingsSummary()).unassigned,
  });
  if (errors.length > 0) throw goalRulesError(errors);
  return { ...input, reason: GoalAllocationReason.ASSIGNMENT, createdAt: new Date() };
}

/** Assignments and transfers can be undone; goal spends follow their transaction and releases their goal. */
export async function reverseAllocation(allocation: GoalAllocationEntity): Promise<void> {
  if (allocation.reason === GoalAllocationReason.TRANSFER && allocation.transferId) {
    await deleteTransfer(allocation.transferId);
    return;
  }
  if (allocation.reason !== GoalAllocationReason.ASSIGNMENT) {
    throw goalRulesError(["Only assignments and transfers can be undone."]);
  }
  await goalAllocationRepo.delete(allocation.id);
  await recomputeGoalBalances([allocation.goalId]);
}

export const goalAllocationDomain: DomainInner = {
  resourceName: "goalAllocation",
  repo: goalAllocationRepo,
  schemas: { query: goalAllocationQuerySchema, create: goalAllocationPostSchema, record: goalAllocationRecordSchema },
  buildCreateRecord: (input) => buildAssignmentRecord(input as GoalAllocationPost),
  afterWrite: async ({ after, before }: WriteChange) => {
    await recomputeGoalBalances([((after ?? before) as GoalAllocationEntity).goalId]);
  },
};
