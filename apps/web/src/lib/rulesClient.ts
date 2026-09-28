import type { LabelAssignment, LabelRule, LabelRuleField, LabelRuleMatch, LearnedRuleDraft, MonthYear } from "@myos/shared";
import { unwrap } from "./proxyClient";

export type RuleDraft = { field: LabelRuleField; match: LabelRuleMatch; value: string; label: string };

export type RuleApplication = { assignments: LabelAssignment[]; learned: LearnedRuleDraft[]; months: MonthYear[] };

const json = (method: string, body: unknown): RequestInit => ({
  method,
  headers: { "Content-Type": "application/json" },
  body: JSON.stringify(body),
});

export async function fetchRules(): Promise<LabelRule[]> {
  return unwrap<LabelRule[]>(await fetch("/api/rules"));
}

export async function createRule(draft: RuleDraft): Promise<LabelRule> {
  return unwrap<LabelRule>(await fetch("/api/rules", json("POST", draft)));
}

export async function updateRule(id: string, patch: Partial<Pick<LabelRule, "label" | "enabled">>): Promise<LabelRule> {
  return unwrap<LabelRule>(await fetch(`/api/rules/${encodeURIComponent(id)}`, json("PATCH", patch)));
}

export async function deleteRule(id: string): Promise<void> {
  const res = await fetch(`/api/rules/${encodeURIComponent(id)}`, { method: "DELETE" });
  if (res.status !== 204) await unwrap(res);
}

export async function applyRules(dryRun: boolean): Promise<RuleApplication> {
  return unwrap<RuleApplication>(await fetch("/api/rules/applications", json("POST", { dryRun })));
}
