import { budgetId, parseBudgetId, type EffectiveBudget, type MonthYear } from "@myos/shared";
import { db, FieldPath } from "../config/firebase.js";
import { convertTimestampsToDates } from "../core/firestore/firestoreData.js";
import type { BudgetEntity } from "../domains/budgets/budgets.types.js";

/** A month without a budget of its own runs on the latest earlier one until it is edited. */
export async function effectiveBudget(ownerUid: string, monthYear: MonthYear): Promise<(EffectiveBudget & BudgetEntity) | null> {
  const snapshot = await db
    .collection("budgets")
    .where(FieldPath.documentId(), ">=", `${ownerUid}_`)
    .where(FieldPath.documentId(), "<=", budgetId(ownerUid, monthYear))
    .get();
  const doc = snapshot.docs.at(-1); // a descending id sort needs a composite index; one budget a month keeps this small
  if (!doc) return null;
  const budget = { ...convertTimestampsToDates(doc.data() as Omit<BudgetEntity, "id">), id: doc.id };
  const source = parseBudgetId(doc.id)?.monthYear;
  return source && source !== monthYear ? { ...budget, carriedFrom: source } : budget;
}
