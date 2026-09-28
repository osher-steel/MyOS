"use client";

import {
  budgetCategories,
  EXACT_ONLY_FIELDS,
  LabelRuleField,
  LabelRuleMatch,
  LabelRuleSource,
  tagLabel,
  toMonthYear,
  type Budget,
  type LabelRule,
} from "@myos/shared";
import { useEffect, useState } from "react";
import { Section, SourceError } from "@/components/editorial";
import { fetchBudget } from "@/lib/budgetsClient";
import { day } from "@/lib/format";
import { ProxyClientError } from "@/lib/proxyClient";
import { applyRules, createRule, deleteRule, fetchRules, updateRule, type RuleApplication, type RuleDraft } from "@/lib/rulesClient";

const FIELD_LABELS: Record<LabelRuleField, string> = {
  [LabelRuleField.MERCHANT_NAME]: "Merchant",
  [LabelRuleField.COUNTERPARTY]: "Recipient",
  [LabelRuleField.DESCRIPTION]: "Charge name",
  [LabelRuleField.CATEGORY]: "Plaid category",
  [LabelRuleField.MERCHANT_ENTITY_ID]: "Merchant ID",
};

const MATCH_LABELS: Record<LabelRuleMatch, string> = {
  [LabelRuleMatch.EXACT]: "is exactly",
  [LabelRuleMatch.CONTAINS]: "contains",
  [LabelRuleMatch.TOKENS]: "has all words",
};

const control = "entry-meta cursor-pointer bg-transparent border-b border-rule pb-[3px] text-ink focus:border-ink outline-none";

function errorMessage(err: unknown): string {
  if (err instanceof ProxyClientError && err.formErrors.length > 0) return err.formErrors.join(" ");
  return (err as Error).message;
}

function labelOptions(budget: Budget | null | undefined, extra?: string): string[] {
  const names = budget ? budgetCategories(budget).flatMap(({ names }) => names) : [];
  return extra && !names.includes(extra) ? [extra, ...names] : names;
}

const byRelevance = (a: LabelRule, b: LabelRule) =>
  Number(b.enabled) - Number(a.enabled) || b.matchCount - a.matchCount || (a.name || a.value).localeCompare(b.name || b.value);

function RuleRow({
  rule,
  budget,
  onChange,
  onRemove,
}: {
  rule: LabelRule;
  budget: Budget | null | undefined;
  onChange: (patch: Partial<Pick<LabelRule, "label" | "enabled">>) => void;
  onRemove: () => void;
}) {
  const [confirming, setConfirming] = useState(false);
  const meta = [
    `${FIELD_LABELS[rule.field]} ${MATCH_LABELS[rule.match]}`,
    rule.source === LabelRuleSource.LEARNED ? "learned" : "manual",
    `${rule.matchCount} ${rule.matchCount === 1 ? "match" : "matches"}`,
  ];
  if (typeof rule.lastMatchedAt === "string") meta.push(`last ${day(rule.lastMatchedAt)}`);

  return (
    <div className={`entry flex items-center gap-4 ${rule.enabled ? "" : "opacity-50"}`}>
      <div className="min-w-0 flex-1">
        <div className="entry-title truncate">{rule.name || rule.value}</div>
        <div className="entry-meta mt-[3px] md:truncate">{meta.join(" · ")}</div>
      </div>
      <div className="flex shrink-0 flex-col items-end gap-1.5 md:flex-row md:items-center md:gap-4">
        {rule.label ? (
          <select
            aria-label={`Label for rule ${rule.name || rule.value}`}
            value={rule.label}
            onChange={(event) => onChange({ label: event.target.value })}
            className={`${control} appearance-none field-sizing-content text-right`}
          >
            {labelOptions(budget, rule.label).map((name) => (
              <option key={name} value={name}>
                {name}
              </option>
            ))}
          </select>
        ) : (
          <span className="entry-meta">{rule.exclude ? "excluded" : (rule.tags ?? []).map((tag) => `#${tagLabel(tag)}`).join(" ")}</span>
        )}
        <span className="flex items-baseline">
          <button type="button" className="entry-meta w-8 shrink-0 hover:text-accent" onClick={() => onChange({ enabled: !rule.enabled })}>
            {rule.enabled ? "on" : "off"}
          </button>
          {confirming ? (
            <span className="entry-meta flex w-24 shrink-0 justify-end gap-2">
              <button type="button" className="text-accent" onClick={onRemove}>
                remove
              </button>
              <button type="button" className="hover:text-ink" onClick={() => setConfirming(false)}>
                keep
              </button>
            </span>
          ) : (
            <button type="button" className="entry-meta w-24 shrink-0 text-right hover:text-accent" onClick={() => setConfirming(true)}>
              remove…
            </button>
          )}
        </span>
      </div>
    </div>
  );
}

function NewRule({ budget, onCreate }: { budget: Budget | null | undefined; onCreate: (draft: RuleDraft) => Promise<string | null> }) {
  const labels = labelOptions(budget);
  const [draft, setDraft] = useState<RuleDraft>({ field: LabelRuleField.MERCHANT_NAME, match: LabelRuleMatch.EXACT, value: "", label: "" });
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const exactOnly = EXACT_ONLY_FIELDS.has(draft.field);
  const label = draft.label || labels[0] || "";

  async function submit() {
    if (!draft.value.trim() || !label) {
      setError("Enter what to match and pick a label.");
      return;
    }
    setSaving(true);
    const failure = await onCreate({ ...draft, value: draft.value.trim(), label });
    setSaving(false);
    setError(failure);
    if (!failure) setDraft({ ...draft, value: "" });
  }

  return (
    <Section label="New rule">
      <div className="flex flex-col gap-4">
        <div className="flex flex-wrap items-end gap-3">
          <select
            aria-label="Match on"
            value={draft.field}
            onChange={(event) => {
              const field = event.target.value as LabelRuleField;
              setDraft({ ...draft, field, match: EXACT_ONLY_FIELDS.has(field) ? LabelRuleMatch.EXACT : draft.match });
            }}
            className={control}
          >
            {Object.values(LabelRuleField).map((field) => (
              <option key={field} value={field}>
                {FIELD_LABELS[field]}
              </option>
            ))}
          </select>
          <select
            aria-label="Match type"
            value={draft.match}
            disabled={exactOnly}
            onChange={(event) => setDraft({ ...draft, match: event.target.value as LabelRuleMatch })}
            className={`${control} disabled:cursor-default disabled:opacity-60`}
          >
            {Object.values(LabelRuleMatch).map((match) => (
              <option key={match} value={match}>
                {MATCH_LABELS[match]}
              </option>
            ))}
          </select>
        </div>
        <input
          aria-label="Value to match"
          value={draft.value}
          placeholder={draft.field === LabelRuleField.CATEGORY ? "FOOD_AND_DRINK_COFFEE" : "Joe & The Juice"}
          onChange={(event) => setDraft({ ...draft, value: event.target.value })}
          onKeyDown={(event) => {
            if (event.key === "Enter") void submit();
          }}
          className="entry-title bg-transparent border-b border-rule pb-1 outline-none focus:border-ink"
        />
        <div className="flex items-end justify-between gap-4">
          <label className="entry-meta flex items-end gap-3">
            <span className="uppercase tracking-[0.18em]">label as</span>
            {labels.length > 0 ? (
              <select value={label} onChange={(event) => setDraft({ ...draft, label: event.target.value })} className={control}>
                {labels.map((name) => (
                  <option key={name} value={name}>
                    {name}
                  </option>
                ))}
              </select>
            ) : (
              <span>{budget === undefined ? "loading…" : "set up this month's budget first"}</span>
            )}
          </label>
          <button type="button" disabled={saving} onClick={() => void submit()} className="entry-meta text-ink hover:text-accent">
            {saving ? "adding…" : "add rule →"}
          </button>
        </div>
        {error ? <p className="entry-meta text-accent">{error}</p> : null}
      </div>
    </Section>
  );
}

function RunRules({ onApplied }: { onApplied: () => void }) {
  const [preview, setPreview] = useState<RuleApplication | null>(null);
  const [applied, setApplied] = useState<RuleApplication | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function run(dryRun: boolean) {
    setBusy(true);
    setError(null);
    try {
      const result = await applyRules(dryRun);
      if (dryRun) {
        setPreview(result);
        setApplied(null);
      } else {
        setApplied(result);
        setPreview(null);
        onApplied();
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  }

  const summary = (result: RuleApplication, verb: string) =>
    `${verb} ${result.assignments.length} unlabelled ${result.assignments.length === 1 ? "transaction" : "transactions"}` +
    (result.learned.length > 0 ? ` and learn ${result.learned.length} new ${result.learned.length === 1 ? "rule" : "rules"}` : "") +
    ".";

  return (
    <Section label="Run rules" aside="unlabelled only">
      <div className="flex flex-col gap-3">
        <p className="entry-meta">
          Rules run on every bank sync. Run them here after adding or changing one. Labels you picked by hand are never touched.
        </p>
        {preview ? <p>{summary(preview, "Would label")}</p> : null}
        {applied ? <p>{summary(applied, "Labelled").replace("and learn", "and learned")}</p> : null}
        <div className="entry-meta flex gap-5">
          <button type="button" disabled={busy} onClick={() => void run(true)} className="text-ink hover:text-accent">
            {busy && !preview ? "checking…" : "preview"}
          </button>
          {preview && preview.assignments.length + preview.learned.length > 0 ? (
            <button type="button" disabled={busy} onClick={() => void run(false)} className="text-ink hover:text-accent">
              {busy ? "applying…" : "apply →"}
            </button>
          ) : null}
        </div>
        {error ? <SourceError message={error} /> : null}
      </div>
    </Section>
  );
}

export default function RulesSettings() {
  const [rules, setRules] = useState<LabelRule[] | null>(null);
  const [budget, setBudget] = useState<Budget | null | undefined>(undefined);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);

  useEffect(() => {
    let ignore = false;
    fetchRules()
      .then((loaded) => {
        if (!ignore) setRules(loaded);
      })
      .catch((err: Error) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, [version]);

  useEffect(() => {
    fetchBudget(toMonthYear())
      .then(setBudget)
      .catch(() => setBudget(null));
  }, []);

  const replace = (saved: LabelRule) => setRules((old) => (old ?? []).map((rule) => (rule.id === saved.id ? saved : rule)));

  async function change(rule: LabelRule, patch: Partial<Pick<LabelRule, "label" | "enabled">>) {
    setError(null);
    try {
      replace(await updateRule(rule.id, patch));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function remove(rule: LabelRule) {
    setError(null);
    try {
      await deleteRule(rule.id);
      setRules((old) => (old ?? []).filter((r) => r.id !== rule.id));
    } catch (err) {
      setError(errorMessage(err));
    }
  }

  async function create(draft: RuleDraft): Promise<string | null> {
    try {
      const rule = await createRule(draft);
      setRules((old) => [rule, ...(old ?? [])]);
      return null;
    } catch (err) {
      return errorMessage(err);
    }
  }

  const sorted = [...(rules ?? [])].sort(byRelevance);
  const learned = sorted.filter((rule) => rule.source === LabelRuleSource.LEARNED).length;

  return (
    <div className="flex flex-col gap-7">
      <h2 className="font-display text-[length:var(--text-month)] leading-none">Auto-Labelling</h2>

      <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-12 border-t border-rule pt-9 md:grid-cols-[minmax(0,657fr)_minmax(0,459fr)]">
        <Section label="Rules" aside={rules ? `${sorted.length} rules · ${learned} learned` : undefined}>
          {error ? <SourceError message={error} /> : null}
          <p className="entry-meta mb-2">
            New transactions that match a rule get its label, marked auto-labelled until you keep or change it. Label the same
            merchant twice by hand and a rule is learned for it.
          </p>
          {rules === null && !error ? (
            <p className="entry-meta py-4">Loading…</p>
          ) : sorted.length === 0 ? (
            <p className="entry-meta py-4">No rules yet.</p>
          ) : (
            sorted.map((rule) => (
              <RuleRow
                key={rule.id}
                rule={rule}
                budget={budget}
                onChange={(patch) => void change(rule, patch)}
                onRemove={() => void remove(rule)}
              />
            ))
          )}
        </Section>

        <div className="flex flex-col gap-12">
          <NewRule budget={budget} onCreate={create} />
          <RunRules onApplied={() => setVersion((v) => v + 1)} />
        </div>
      </div>
    </div>
  );
}
