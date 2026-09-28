import { EXACT_ONLY_FIELDS, LabelRuleField, LabelRuleMatch, LabelRuleSource, normalizeRuleValue } from "@myos/shared";
import z from "zod";
import { nonEmptyString } from "../../validators/common.js";
import { labelName, tagList } from "../lineEntries/lineEntries.schemas.js";

const name = z.string().trim().min(1).max(100);
const exclude = z.literal(true);

type Outcome = { label?: string; exclude?: boolean; tags?: string[] };
const hasOutcome = (rule: Outcome) => Boolean(rule.label) || Boolean(rule.exclude) || Boolean(rule.tags?.length);

export const labelRulePostSchema = z
  .object({
    name: name.optional(),
    field: z.enum(LabelRuleField),
    match: z.enum(LabelRuleMatch).default(LabelRuleMatch.EXACT),
    value: nonEmptyString.max(200),
    label: labelName.optional(),
    exclude: exclude.optional(),
    tags: tagList.optional(),
    enabled: z.boolean().default(true),
  })
  .strict()
  .refine((rule) => rule.match === LabelRuleMatch.EXACT || !EXACT_ONLY_FIELDS.has(rule.field), {
    message: "Merchant ids and categories only match exactly.",
    path: ["match"],
  })
  .refine((rule) => normalizeRuleValue(rule.field, rule.value).length > 0, {
    message: "The value has no letters or digits to match on.",
    path: ["value"],
  })
  .refine(hasOutcome, { message: "A rule needs a label, exclude or tags." })
  .refine((rule) => !(rule.label && rule.exclude), { message: "A rule labels or excludes, not both." });

// What a rule matches is its id, so changing it means deleting and creating a rule
export const labelRulePatchSchema = z
  .object({
    name,
    label: labelName.nullable(),
    exclude: z.boolean(),
    tags: tagList,
    enabled: z.boolean(),
  })
  .partial()
  .strict()
  .refine((data) => Object.keys(data).length > 0, { message: "At least one field must be provided." })
  .refine((data) => !(data.label && data.exclude), { message: "A rule labels or excludes, not both." });

export const labelRuleApplicationSchema = z.object({ dryRun: z.boolean().default(false) }).strict();

export const labelRuleRecordSchema = z
  .object({
    name,
    field: z.enum(LabelRuleField),
    match: z.enum(LabelRuleMatch),
    value: nonEmptyString,
    label: labelName.optional(),
    exclude: exclude.optional(),
    tags: z.array(nonEmptyString).optional(),
    source: z.enum(LabelRuleSource),
    enabled: z.boolean(),
    learnedFrom: z.array(nonEmptyString).optional(),
    matchCount: z.number().int().min(0),
    lastMatchedAt: z.date().optional(),
    createdAt: z.date(),
    updatedAt: z.date(),
  })
  .strict()
  .refine(hasOutcome, { message: "A rule needs a label, exclude or tags." });

export { hasOutcome };
