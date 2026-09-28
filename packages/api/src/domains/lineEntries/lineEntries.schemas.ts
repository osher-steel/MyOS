import { LineEntryStatus, PlaidTransactionStatus } from "@myos/shared";
import z from "zod";
import { nonEmptyString } from "../../validators/common.js";
import { monthYearSchema } from "../budgets/budgets.schemas.js";

const dayDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a day in YYYY-MM-DD form.");
const label = z.string().trim().min(1).max(64);
const currency = z.string().trim().length(3);

export const lineEntryPostSchema = z
  .object({
    id: nonEmptyString,
    name: nonEmptyString,
    amount: z.number().int(),
    date: dayDate,
    currency: currency.default("USD"),
    label: label.optional(),
    pendingTransactionId: nonEmptyString.optional(),
    plaidStatus: z.enum(PlaidTransactionStatus),
  })
  .strict();

export const lineEntryPatchSchema = z
  .object({
    amount: z.number().int(),
    label,
    plaidStatus: z.enum(PlaidTransactionStatus),
    osStatus: z.enum(LineEntryStatus),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided." });

export const lineEntryRecordSchema = z
  .object({
    name: nonEmptyString,
    amount: z.number().int(),
    date: dayDate,
    monthYear: monthYearSchema,
    currency,
    label: label.optional(),
    pendingTransactionId: nonEmptyString.optional(),
    plaidStatus: z.enum(PlaidTransactionStatus),
    osStatus: z.enum(LineEntryStatus),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
