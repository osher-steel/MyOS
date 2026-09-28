import { GoalAllocationReason } from "@myos/shared";
import z from "zod";
import { nonEmptyString } from "../../validators/common.js";
import { monthYearSchema } from "../budgets/budgets.schemas.js";

const cents = z.number().int("Amounts are whole cents.");
const note = z.string().trim().min(1).max(200);

// Only assignments are created directly; transfers, goal spends and releases have their own paths.
export const goalAllocationPostSchema = z
  .object({
    goalId: nonEmptyString,
    monthYear: monthYearSchema.optional(),
    amount: cents.refine((amount) => amount !== 0, "Amount must not be zero."),
    note: note.optional(),
  })
  .strict();

export const goalTransferSchema = z
  .object({
    fromGoalId: nonEmptyString,
    toGoalId: nonEmptyString,
    amount: cents.positive(),
    monthYear: monthYearSchema,
    note: note.optional(),
  })
  .strict();

export const goalAllocationRecordSchema = z
  .object({
    goalId: nonEmptyString,
    monthYear: monthYearSchema.optional(),
    amount: cents,
    reason: z.enum(GoalAllocationReason),
    transferId: nonEmptyString.optional(),
    lineEntryId: nonEmptyString.optional(),
    note: z.string().optional(),
    createdAt: z.date(),
  })
  .strict();
