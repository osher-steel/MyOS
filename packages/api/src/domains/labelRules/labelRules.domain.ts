import { LABEL_RULES_COLLECTION, LabelRuleSource, labelRuleId, normalizeRuleValue, type MonthYear } from "@myos/shared";
import { FieldValue } from "../../config/firebase.js";
import { ServiceValidationError } from "../../core/errors/errors.js";
import { FirestoreRepo, type FirestoreRepoTypeSet } from "../../core/firestore/firestoreRepo.js";
import type { DomainInner, WriteChange } from "../../core/resourceBuilder/resourceBuilder.types.js";
import { autoLabelAll, relabelRuleEntries } from "../../services/autoLabel.js";
import { regeneratePastReports } from "../../services/monthReports.js";
import { assertKnownTags } from "../tags/tags.domain.js";
import { labelRuleQueryFilterFields, labelRuleQuerySchema } from "./labelRules.query.js";
import { hasOutcome, labelRulePatchSchema, labelRulePostSchema, labelRuleRecordSchema } from "./labelRules.schemas.js";
import type { LabelRuleEntity, LabelRulePatch, LabelRulePost, LabelRuleQuery, LabelRuleRecord } from "./labelRules.types.js";

export const labelRuleRepo = new FirestoreRepo<
  FirestoreRepoTypeSet<LabelRuleEntity, LabelRuleRecord, LabelRuleQuery, LabelRulePatch>
>(LABEL_RULES_COLLECTION, labelRuleQueryFilterFields);

export function buildLabelRuleCreateRecord(input: LabelRulePost): LabelRuleRecord {
  const now = new Date();
  const value = normalizeRuleValue(input.field, input.value);
  const { tags, ...rest } = input;
  return {
    ...rest,
    name: input.name ?? value,
    value,
    ...(tags?.length ? { tags } : {}),
    source: LabelRuleSource.MANUAL,
    matchCount: 0,
    createdAt: now,
    updatedAt: now,
  };
}

// Editing a learned rule makes it yours, so hand corrections stop retraining it
export function buildLabelRulePatchRecord(existing: LabelRuleEntity, patch: LabelRulePatch): Record<string, unknown> {
  const label = patch.label === undefined ? existing.label : (patch.label ?? undefined);
  const exclude = patch.exclude ?? (patch.label ? false : existing.exclude);
  const tags = patch.tags ?? existing.tags;
  if (!hasOutcome({ label, exclude, tags })) {
    throw new ServiceValidationError("Invalid label rule patch.", { formErrors: ["A rule needs a label, exclude or tags."], fieldErrors: {} });
  }
  return {
    ...(patch.name ? { name: patch.name } : {}),
    ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
    ...(patch.label !== undefined ? { label: patch.label ?? FieldValue.delete() } : {}),
    ...(exclude ? { exclude: true, label: FieldValue.delete() } : { exclude: FieldValue.delete() }),
    ...(patch.tags ? { tags: patch.tags.length ? patch.tags : FieldValue.delete() } : {}),
    source: LabelRuleSource.MANUAL,
    updatedAt: new Date(),
  };
}

async function afterLabelRuleWrite({ before, after }: WriteChange): Promise<void> {
  const previous = before as LabelRuleEntity | null;
  const current = after as LabelRuleEntity | null;

  const months: MonthYear[] = [];
  if (previous && current?.label && previous.label !== current.label) {
    months.push(...(await relabelRuleEntries(current.id, current.label)));
  }
  months.push(...(await autoLabelAll()).months);
  await regeneratePastReports(months);
}

export const labelRuleDomain: DomainInner = {
  resourceName: "labelRule",
  repo: labelRuleRepo,
  schemas: {
    query: labelRuleQuerySchema,
    create: labelRulePostSchema,
    patch: labelRulePatchSchema,
    record: labelRuleRecordSchema,
  },
  createId: (input) => {
    const { field, match, value } = input as LabelRulePost;
    return labelRuleId(field, match, value);
  },
  buildCreateRecord: async (input) => {
    await assertKnownTags((input as LabelRulePost).tags);
    return buildLabelRuleCreateRecord(input as LabelRulePost);
  },
  buildPatchRecord: async (existing, patch) => {
    await assertKnownTags((patch as LabelRulePatch).tags);
    return buildLabelRulePatchRecord(existing as LabelRuleEntity, patch as LabelRulePatch);
  },
  afterWrite: afterLabelRuleWrite,
};
