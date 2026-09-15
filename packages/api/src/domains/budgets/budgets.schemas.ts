import { BudgetGroup, isMonthYear } from "@myos/shared";
import z from "zod";

const categoryName = z.string().trim().min(1, "Category name is required.").max(64);
const amount = z.number().finite().min(0);

/** Category name → amount allocated. Amounts are non-negative numbers. */
export const budgetAllocationsSchema = z.record(categoryName, amount);

export const monthYearSchema = z
  .string()
  .trim()
  .refine(isMonthYear, "Must be a month in YYYY-MM form.");

const groups = {
  [BudgetGroup.NEEDS]: budgetAllocationsSchema,
  [BudgetGroup.WANTS]: budgetAllocationsSchema,
  [BudgetGroup.SAVINGS]: budgetAllocationsSchema,
};

type Groups = Partial<Record<BudgetGroup, Record<string, number>>>;

/**
 * A category name must live in exactly one group — line entries reference a
 * label by name alone, so "Groceries" under both needs and wants would be
 * ambiguous.
 */
export function duplicateCategories(budget: Groups): string[] {
  const seen = new Map<string, number>();
  for (const group of Object.values(BudgetGroup)) {
    for (const name of Object.keys(budget[group] ?? {})) {
      seen.set(name, (seen.get(name) ?? 0) + 1);
    }
  }
  return [...seen.entries()].filter(([, count]) => count > 1).map(([name]) => name);
}

/** Sum of every allocation across all groups. */
export function totalAllocated(budget: Groups): number {
  return Object.values(BudgetGroup)
    .flatMap((group) => Object.values(budget[group] ?? {}))
    .reduce((sum, value) => sum + value, 0);
}

/**
 * Rules that span fields. Shared by the create schema and the patch hook,
 * which runs them against the merged result. Returns human messages.
 */
export function budgetRuleErrors(budget: Groups & { income?: number }): string[] {
  const errors: string[] = [];
  const duplicates = duplicateCategories(budget);
  if (duplicates.length > 0) {
    errors.push(`Category appears in more than one group: ${duplicates.join(", ")}.`);
  }
  if (budget.income !== undefined && totalAllocated(budget) > budget.income) {
    errors.push(`Allocations (${totalAllocated(budget)}) exceed income (${budget.income}).`);
  }
  return errors;
}

const applyRules = (data: Groups & { income?: number }, ctx: z.RefinementCtx) => {
  for (const message of budgetRuleErrors(data)) {
    ctx.addIssue({ code: "custom", message });
  }
};

/** POST /budgets — month defaults to the current one; the id is derived, not supplied. */
export const budgetPostSchema = z
  .object({
    monthYear: monthYearSchema.optional(),
    income: amount,
    ...groups,
  })
  .strict()
  .superRefine(applyRules);

/** PATCH /budgets/:id — each group given replaces that group wholesale. */
export const budgetPatchSchema = z
  .object({ income: amount, ...groups })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, {
    message: "At least one field must be provided.",
  });

/** What is stored. Timestamps are server-set in the domain hooks. */
export const budgetRecordSchema = z
  .object({
    createdAt: z.date(),
    updatedAt: z.date(),
    income: amount,
    ...groups,
  })
  .strict();
