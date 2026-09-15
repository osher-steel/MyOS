"use client";

import { budgetCategories, type Budget, type LineEntryGroups, type LineEntryTotals, type LineEntryView } from "@myos/shared";
import { useState } from "react";
import { Entry, Section, SourceError } from "@/components/editorial";
import { money, transactionMeta } from "@/lib/format";

type Tab = keyof LineEntryGroups;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "All" },
  { id: "labelled", label: "Labelled" },
  { id: "unlabelled", label: "Unlabelled" },
];

function LabelPicker({
  entry,
  budget,
  onLabel,
}: {
  entry: LineEntryView;
  budget: Budget;
  onLabel: (entry: LineEntryView, label: string) => void;
}) {
  return (
    <select
      aria-label={`Label for ${entry.name}`}
      value={entry.label ?? ""}
      onChange={(event) => onLabel(entry, event.target.value)}
      className="entry-meta cursor-pointer bg-transparent border-b border-rule pb-0.5 text-ink"
    >
      <option value="" disabled>
        label…
      </option>
      {budgetCategories(budget).map(({ group, names }) => (
        <optgroup key={group} label={group}>
          {names.map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      ))}
    </select>
  );
}

export default function TransactionsPanel({
  groups,
  totals,
  budget,
  labelEntry,
  loading,
  errors,
}: {
  groups: LineEntryGroups;
  totals: LineEntryTotals;
  budget: Budget | null;
  labelEntry: (entry: LineEntryView, label: string) => void;
  loading: boolean;
  errors: { api: string | null; plaid: string | null; save: string | null };
}) {
  const [tab, setTab] = useState<Tab>("all");
  const entries = groups[tab];

  return (
    <Section label="Transactions" aside={groups.all.length > 0 ? `${money(totals.spent, { cents: true })} spent` : undefined}>
      {errors.api ? <SourceError message={`ledger: ${errors.api}`} /> : null}
      {errors.plaid ? <SourceError message={`Plaid: ${errors.plaid}`} /> : null}
      {errors.save ? <SourceError message={`label not saved: ${errors.save}`} /> : null}

      <p className="entry-meta mb-4">
        {money(totals.spentLabelled, { cents: true })} labelled · {money(totals.spentUnlabelled, { cents: true })} unlabelled
      </p>

      <div role="tablist" className="mb-2 flex gap-6 border-b border-rule">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => setTab(id)}
            className={`entry-meta uppercase tracking-[0.18em] pb-2 -mb-px border-b ${
              tab === id ? "border-ink text-ink" : "border-transparent hover:border-rule"
            }`}
          >
            {label} <span className="figure text-[var(--text-meta)]">{groups[id].length}</span>
          </button>
        ))}
      </div>

      <div className="h-[calc(100dvh-28rem)] min-h-64 overflow-y-auto">
        {loading && groups.all.length === 0 ? (
          <p className="entry-meta">Loading…</p>
        ) : entries.length === 0 ? (
          <p className="entry-meta">Nothing here.</p>
        ) : (
          entries.map((entry) => (
            <Entry
              key={entry.id}
              title={entry.name}
              meta={transactionMeta(entry)}
              figure={money(entry.amount, { currency: entry.currency, cents: true })}
            >
              {budget ? <LabelPicker entry={entry} budget={budget} onLabel={labelEntry} /> : null}
            </Entry>
          ))
        )}
      </div>
    </Section>
  );
}
