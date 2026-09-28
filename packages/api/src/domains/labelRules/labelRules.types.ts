import type { LabelRule } from "@myos/shared";
import type z from "zod";
import type { Equal, Expect, Override, RecordOf } from "../../types/type-assertions.js";
import type { labelRuleQuerySchema } from "./labelRules.query.js";
import type { labelRulePatchSchema, labelRulePostSchema, labelRuleRecordSchema } from "./labelRules.schemas.js";

export type LabelRulePost = z.infer<typeof labelRulePostSchema>;
export type LabelRulePatch = z.infer<typeof labelRulePatchSchema>;
export type LabelRuleRecord = z.infer<typeof labelRuleRecordSchema>;
export type LabelRuleQuery = z.infer<typeof labelRuleQuerySchema>;

export type LabelRuleEntity = Override<LabelRule, { lastMatchedAt?: Date; createdAt: Date; updatedAt: Date }>;

type _AssertLabelRuleRecordSchemaMatchesRecord = Expect<Equal<LabelRuleRecord, RecordOf<LabelRuleEntity>>>;
