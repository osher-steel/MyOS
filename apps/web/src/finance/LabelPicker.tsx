"use client";

import { budgetCategories, IncomeSource, LabelSource, labelSourceOf, type Budget, type LineEntryView } from "@myos/shared";

const KEEP = "__keep__";

export function LabelPicker({
  entry,
  budget,
  onLabel,
}: {
  entry: LineEntryView;
  budget: Budget | null;
  onLabel: (entry: LineEntryView, label: string) => void;
}) {
  if (entry.goalId) return <span className="entry-meta shrink-0">from goal</span>;
  const inflow = entry.amount < 0;
  if (!budget && !inflow) return null;

  const unlabelled = entry.label === undefined;
  const auto = labelSourceOf(entry) === LabelSource.RULE;
  const tone = unlabelled ? "border-accent/50 text-accent" : auto ? "border-dashed border-muted text-ink" : "border-rule text-ink";
  return (
    <select
      aria-label={`Label for ${entry.name}`}
      title={auto ? "Labelled by a rule. Pick Keep to confirm it." : undefined}
      value={entry.label ?? ""}
      onChange={(event) => onLabel(entry, event.target.value === KEEP ? entry.label! : event.target.value)}
      className={`entry-meta shrink-0 cursor-pointer appearance-none field-sizing-content bg-transparent border-b pb-[3px] text-right ${tone}`}
    >
      <option value="" disabled>
        label…
      </option>
      {auto ? <option value={KEEP}>Keep “{entry.label}”</option> : null}
      {inflow ? (
        <optgroup label="income">
          {Object.values(IncomeSource).map((name) => (
            <option key={name} value={name}>
              {name}
            </option>
          ))}
        </optgroup>
      ) : null}
      {(budget ? budgetCategories(budget) : []).map(({ group, names }) => (
        <optgroup key={group} label={inflow ? `${group} · refund` : group}>
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
