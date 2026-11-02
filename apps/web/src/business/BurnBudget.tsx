"use client";

import {
  formatMonthYear,
  nextMonthYear,
  parseBudgetId,
  previousMonthYear,
  toMonthYear,
  type Budget,
  type LineEntryView,
} from "@myos/shared";
import { useCallback, useEffect, useMemo, useState } from "react";
import { Section } from "@/components/editorial";
import { fetchBudget, fetchBudgets, saveBudget } from "@/lib/budgetsClient";
import { dollarsInput, money } from "@/lib/format";
import { unwrap } from "@/lib/proxyClient";
import RulesSettings from "@/finance/RulesSettings";
import { centsFrom, FIXED_LABELS, isFixedLabel, message } from "./common";

type Row = { key: number; name: string; amount: string };

let nextKey = 0;
const row = (name = "", cents = 0): Row => ({ key: nextKey++, name, amount: cents ? String(dollarsInput(cents)) : "" });

const total = (lines: Record<string, number>) => Object.values(lines).reduce((sum, cents) => sum + cents, 0);
const versionMonth = (budget: Budget) => parseBudgetId(budget.id)?.monthYear ?? "";

function problems(rows: Row[]): string[] {
  const errors: string[] = [];
  const names = rows.map((r) => r.name.trim()).filter(Boolean);
  if (rows.some((r) => !r.name.trim() && r.amount.trim())) errors.push("Every line with an amount needs a title.");
  const dupes = names.filter((name, i) => names.findIndex((other) => other.toLowerCase() === name.toLowerCase()) !== i);
  if (dupes.length) errors.push(`Each title once: ${[...new Set(dupes)].join(", ")}.`);
  const fixed = names.filter(isFixedLabel);
  if (fixed.length) errors.push(`${fixed.join(", ")} ${fixed.length === 1 ? "is a" : "are"} revenue or transfer label, not a burn line.`);
  if (names.some((name) => name.length > 64)) errors.push("Titles are at most 64 characters.");
  return errors;
}

export default function BurnBudget() {
  const current = toMonthYear();
  const [rows, setRows] = useState<Row[] | null>(null);
  const [inEffect, setInEffect] = useState<Budget | null>(null);
  const [versions, setVersions] = useState<Budget[]>([]);
  const [usedLabels, setUsedLabels] = useState<string[]>([]);
  const [from, setFrom] = useState(current);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState<string | null>(null);

  const fetchVersions = useCallback(() => Promise.all([fetchBudget(current), fetchBudgets()]), [current]);
  const showVersions = useCallback(
    ([effective, all]: [Budget | null, Budget[]]) => {
      setInEffect(effective);
      setVersions([...all].sort((a, b) => versionMonth(b).localeCompare(versionMonth(a))));
      // Edit the newest version, even one that starts next month
      const newest =
        all.filter((budget) => versionMonth(budget) >= current).sort((a, b) => versionMonth(b).localeCompare(versionMonth(a)))[0] ??
        effective;
      setRows([...Object.entries(newest?.needs ?? {}).map(([name, cents]) => row(name, cents)), row()]);
      if (newest && versionMonth(newest) > current) setFrom(versionMonth(newest));
    },
    [current],
  );

  useEffect(() => {
    fetchVersions()
      .then(showVersions)
      .catch((cause: unknown) => setError(message(cause)));
    // Labels already on recent transactions, offered as lines to add
    const months = [current, previousMonthYear(current), previousMonthYear(previousMonthYear(current))];
    Promise.all(months.map((month) => fetch(`/api/transactions/${month}`).then((res) => unwrap<LineEntryView[]>(res))))
      .then((lists) => {
        const counts = new Map<string, number>();
        for (const entry of lists.flat()) {
          if (entry.label && !isFixedLabel(entry.label) && entry.amount > 0)
            counts.set(entry.label, (counts.get(entry.label) ?? 0) + entry.amount);
        }
        setUsedLabels([...counts].sort((a, b) => b[1] - a[1]).map(([name]) => name));
      })
      .catch(() => setUsedLabels([]));
  }, [fetchVersions, showVersions, current]);

  const draftTotal = useMemo(() => (rows ?? []).reduce((sum, r) => sum + centsFrom(r.amount), 0), [rows]);
  const suggestions = useMemo(() => {
    const names = new Set((rows ?? []).map((r) => r.name.trim().toLowerCase()));
    return usedLabels.filter((name) => !names.has(name.toLowerCase()));
  }, [rows, usedLabels]);

  const update = (key: number, fields: Partial<Row>) =>
    setRows((state) => (state ?? []).map((r) => (r.key === key ? { ...r, ...fields } : r)));
  const add = (name = "") =>
    setRows((state) => {
      const filled = (state ?? []).filter((r) => r.name.trim() || r.amount.trim());
      return [...filled, row(name), ...(name ? [row()] : [])];
    });

  async function save() {
    if (!rows) return;
    const errors = problems(rows);
    if (errors.length) {
      setError(errors.join(" "));
      return;
    }
    setError(null);
    setSaved(null);
    setSaving(true);
    try {
      const needs = Object.fromEntries(rows.filter((r) => r.name.trim()).map((r) => [r.name.trim(), centsFrom(r.amount)]));
      await saveBudget(from, { income: total(needs), needs, wants: {}, savings: {} });
      showVersions(await fetchVersions());
      setSaved(`Saved. ${formatMonthYear(from)} and later months use this version; earlier months keep theirs.`);
    } catch (cause) {
      setError(message(cause));
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="space-y-14">
      <div className="grid gap-10 md:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <Section label="Monthly burn budget" aside={<span className="figure">{money(draftTotal)} / month</span>}>
          {rows === null ? (
            <p className="entry-meta py-3">Loading…</p>
          ) : (
            <>
              <ul>
                {rows.map((r) => (
                  <li key={r.key} className="flex items-baseline gap-3 border-b border-rule py-2">
                    <input
                      aria-label="Line title"
                      placeholder="Title, e.g. Payroll"
                      value={r.name}
                      onChange={(event) => update(r.key, { name: event.target.value })}
                      className="min-w-0 flex-1 bg-transparent outline-none"
                    />
                    <span className="entry-meta">$</span>
                    <input
                      aria-label={`Amount for ${r.name || "line"}`}
                      inputMode="decimal"
                      placeholder="0"
                      value={r.amount}
                      onChange={(event) => update(r.key, { amount: event.target.value })}
                      className="figure w-28 bg-transparent text-right outline-none"
                    />
                    <button
                      type="button"
                      aria-label={`Remove ${r.name || "line"}`}
                      className="entry-meta hover:text-accent"
                      onClick={() => setRows((state) => (state ?? []).filter((other) => other.key !== r.key))}
                    >
                      ✕
                    </button>
                  </li>
                ))}
              </ul>
              <button type="button" className="entry-meta pt-3 hover:text-accent" onClick={() => add()}>
                + add line
              </button>

              {suggestions.length > 0 ? (
                <div className="pt-4">
                  <p className="entry-meta pb-2">Already used on recent transactions:</p>
                  <div className="flex flex-wrap gap-2">
                    {suggestions.map((name) => (
                      <button
                        key={name}
                        type="button"
                        className="entry-meta border border-rule px-2 py-1 hover:text-accent"
                        onClick={() => add(name)}
                      >
                        + {name}
                      </button>
                    ))}
                  </div>
                </div>
              ) : null}

              <div className="flex flex-wrap items-baseline justify-between gap-4 border-t border-ink pt-4 mt-6">
                <label className="entry-meta flex items-baseline gap-2">
                  Starts
                  <select
                    value={from}
                    onChange={(event) => setFrom(event.target.value)}
                    className="entry-meta bg-transparent border-b border-rule outline-none"
                  >
                    <option value={current}>this month ({formatMonthYear(current)})</option>
                    <option value={nextMonthYear(current)}>next month ({formatMonthYear(nextMonthYear(current))})</option>
                  </select>
                </label>
                <button type="button" className="entry-meta text-accent disabled:opacity-40" disabled={saving} onClick={() => void save()}>
                  {saving ? "saving…" : "save version"}
                </button>
              </div>
              {error ? <p className="pt-3 text-accent">{error}</p> : null}
              {saved ? <p className="entry-meta pt-3">{saved}</p> : null}
              <p className="entry-meta pt-3">
                Transactions are filed under a line by its title, so renaming a line leaves earlier transactions under the old name.
              </p>
            </>
          )}
        </Section>

        <Section label="Versions">
          {versions.length === 0 ? (
            <p className="entry-meta py-3">No versions yet. The first one you save starts the history.</p>
          ) : (
            <ul>
              {versions.map((version) => {
                const month = versionMonth(version);
                const live = inEffect?.id === version.id;
                return (
                  <li key={version.id} className="border-b border-rule py-2">
                    <details>
                      <summary className="flex cursor-pointer items-baseline justify-between gap-4">
                        <span>
                          From {formatMonthYear(month)}
                          {live ? (
                            <span className="entry-meta"> · in effect</span>
                          ) : month > current ? (
                            <span className="entry-meta"> · upcoming</span>
                          ) : null}
                        </span>
                        <span className="figure">{money(total(version.needs))}</span>
                      </summary>
                      <ul className="pt-2">
                        {Object.entries(version.needs)
                          .sort((a, b) => b[1] - a[1])
                          .map(([name, cents]) => (
                            <li key={name} className="entry-meta flex justify-between gap-4 py-1">
                              <span>{name}</span>
                              <span>{money(cents)}</span>
                            </li>
                          ))}
                      </ul>
                    </details>
                  </li>
                );
              })}
            </ul>
          )}
        </Section>
      </div>

      <RulesSettings extraLabels={FIXED_LABELS} />
    </div>
  );
}
