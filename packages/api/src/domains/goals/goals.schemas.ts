import { GoalStatus } from "@myos/shared";
import z from "zod";

const cents = z.number().int("Amounts are whole cents.");
const name = z.string().trim().min(1).max(64);

export const goalPostSchema = z
  .object({ name, targetAmount: cents.min(1).optional() })
  .strict();

// The name is fixed: it is how monthly savings categories find their goal.
export const goalPatchSchema = z.object({ targetAmount: cents.min(1) }).strict();

export const goalRecordSchema = z
  .object({
    name,
    targetAmount: cents.min(1).optional(),
    amountSaved: cents,
    status: z.enum(GoalStatus),
    completedAt: z.date().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
