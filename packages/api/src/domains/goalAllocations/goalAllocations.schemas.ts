import { GoalAllocationReason } from "@myos/shared";
import z from "zod";
import { nonEmptyString } from "../../validators/common.js";
import { monthYearSchema } from "../budgets/budgets.schemas.js";

const cents = z.number().int("Amounts are whole cents.");

// Month savings are written only by report generation.
const manualReason = z.enum([GoalAllocationReason.DEFICIT_COVER, GoalAllocationReason.MANUAL]);

export const goalAllocationPostSchema = z
  .object({
    goalId: nonEmptyString,
    monthYear: monthYearSchema,
    amount: cents.refine((amount) => amount !== 0, "Amount must not be zero."),
    reason: manualReason,
    note: z.string().trim().min(1).max(200).optional(),
  })
  .strict();

export const goalAllocationRecordSchema = z
  .object({
    goalId: nonEmptyString,
    monthYear: monthYearSchema,
    amount: cents,
    reason: z.enum(GoalAllocationReason),
    note: z.string().optional(),
    createdAt: z.date(),
  })
  .strict();
