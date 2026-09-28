import { LabelSource, LineEntryStatus, PlaidTransactionStatus } from "@myos/shared";
import z from "zod";
import { nonEmptyString } from "../../validators/common.js";
import { monthYearSchema } from "../budgets/budgets.schemas.js";
import { tagName } from "../tags/tags.schemas.js";

const dayDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Must be a day in YYYY-MM-DD form.");
export const labelName = z.string().trim().min(1).max(64);
const label = labelName;
const currency = z.string().trim().length(3);
export const tagList = z
  .array(tagName)
  .max(10)
  .transform((values) => [...new Set(values)].sort());
const tags = tagList;
const counterparty = z.object({ name: nonEmptyString, type: nonEmptyString, entityId: nonEmptyString.optional() }).strict();

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
    goalId: nonEmptyString,
    tags,
    plaidStatus: z.enum(PlaidTransactionStatus),
    osStatus: z.enum(LineEntryStatus),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided." })
  .refine((data) => !(data.label && data.goalId), { message: "A transaction is paid from a category or a goal, not both." })
  .refine((data) => data.osStatus !== LineEntryStatus.EXCLUDED || (!data.label && !data.goalId), {
    message: "An excluded transaction has no label or goal.",
  });

export const lineEntryRecordSchema = z
  .object({
    name: nonEmptyString,
    amount: z.number().int(),
    date: dayDate,
    monthYear: monthYearSchema,
    currency,
    label: label.optional(),
    goalId: nonEmptyString.optional(),
    labelSource: z.enum(LabelSource).optional(),
    ruleId: nonEmptyString.optional(),
    tags: tags.optional(),
    tagSource: z.enum(LabelSource).optional(),
    pendingTransactionId: nonEmptyString.optional(),
    plaidStatus: z.enum(PlaidTransactionStatus),
    osStatus: z.enum(LineEntryStatus),
    accountId: nonEmptyString.optional(),
    merchantName: nonEmptyString.optional(),
    merchantEntityId: nonEmptyString.optional(),
    originalDescription: nonEmptyString.optional(),
    descriptionKey: nonEmptyString.optional(),
    marketplace: nonEmptyString.optional(),
    counterparties: z.array(counterparty).optional(),
    categoryPrimary: nonEmptyString.optional(),
    categoryDetailed: nonEmptyString.optional(),
    categoryConfidence: nonEmptyString.optional(),
    paymentChannel: nonEmptyString.optional(),
    authorizedDate: dayDate.optional(),
    logoUrl: nonEmptyString.optional(),
    website: nonEmptyString.optional(),
    city: nonEmptyString.optional(),
    region: nonEmptyString.optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict();
