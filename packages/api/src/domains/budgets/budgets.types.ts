import type { Budget } from "@myos/shared";
import type z from "zod";
import type { Equal, Expect, Override, RecordOf } from "../../types/type-assertions.js";
import type { budgetQuerySchema } from "./budgets.query.js";
import type { budgetPatchSchema, budgetPostSchema, budgetRecordSchema } from "./budgets.schemas.js";

export type BudgetPost = z.infer<typeof budgetPostSchema>;
export type BudgetPatch = z.infer<typeof budgetPatchSchema>;
export type BudgetRecord = z.infer<typeof budgetRecordSchema>;
export type BudgetQuery = z.infer<typeof budgetQuerySchema>;

// FirestoreRepo converts Timestamps to Dates on read, so the API-side entity
// narrows the shared FireTimestampLike to Date.
export type BudgetEntity = Override<Budget, { createdAt: Date; updatedAt: Date }>;

type _AssertBudgetRecordSchemaMatchesRecord = Expect<
  Equal<BudgetRecord, RecordOf<BudgetEntity>>
>;
