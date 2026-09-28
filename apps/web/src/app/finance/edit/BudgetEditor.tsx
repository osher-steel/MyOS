"use client";

import { BudgetGroup, formatMonthYear, type BudgetAllocations, type MonthYear } from "@myos/shared";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Section, SourceError } from "@/components/editorial";
import { centsFromInput, dollarsInput, money } from "@/lib/format";
import { DEFAULT_SAVINGS, remainderForSavings, totalAllocated, useFinanceEdit } from "./useFinanceEdit";

const SPENDING_GROUPS: Array<{ id: BudgetGroup; label: string }> = [
  { id: BudgetGroup.NEEDS, label: "Needs" },
  { id: BudgetGroup.WANTS, label: "Wants" },
];

const input =
  "bg-transparent border-b border-rule focus:border-ink outline-none px-1 py-0.5 font-[family-name:var(--font-mono-ui)] text-sm";

function Field({ message }: { message: string | null }) {
  return message ? (
    <p className="entry-meta mt-2" style={{ color: "var(--accent)" }}>
      {message}
    </p>
  ) : null;
}

/** One group's rows plus an "add category" line. */
function GroupEditor({
  label,
  allocations,
  error,
  onChange,
  onRemove,
}: {
  label: string;
  allocations: BudgetAllocations;
  error: string | null;
  onChange: (name: string, amount: number) => void;
  onRemove: (name: string) => void;
}) {
  const [newName, setNewName] = useState("");
  const total = Object.values(allocations).reduce((sum, amount) => sum + amount, 0);

  function add() {
    const name = newName.trim();
    if (!name || name in allocations) return;
    onChange(name, 0);
    setNewName("");
  }

  return (
    <Section label={label} aside={money(total)}>
      {Object.entries(allocations).map(([name, amount]) => (
        <div key={name} className="entry flex items-baseline justify-between gap-4">
          <span className="entry-title min-w-0 truncate">{name}</span>
          <span className="flex items-baseline gap-3 shrink-0">
            <input
              type="number"
              min={0}
              step={1}
              value={dollarsInput(amount)}
              onChange={(e) => onChange(name, centsFromInput(e.target.value))}
              className={`${input} w-28 text-right`}
              aria-label={`${name} amount`}
            />
            <button type="button" onClick={() => onRemove(name)} className="entry-meta" aria-label={`Remove ${name}`}>
              ×
            </button>
          </span>
        </div>
      ))}
      <form
        className="entry flex items-baseline justify-between gap-4"
        onSubmit={(e) => {
          e.preventDefault();
          add();
        }}
      >
        <input
          value={newName}
          onChange={(e) => setNewName(e.target.value)}
          placeholder="New category"
          className={`${input} flex-1 min-w-0`}
          aria-label={`New ${label.toLowerCase()} category`}
        />
        <button type="submit" className="entry-meta shrink-0">
          add
        </button>
      </form>
      <Field message={error} />
    </Section>
  );
}

export default function BudgetEditor({ monthYear }: { monthYear: MonthYear }) {
  const router = useRouter();
  const edit = useFinanceEdit(monthYear);
  const remainder = remainderForSavings(edit.draft);
  const unplaced = edit.draft.income - totalAllocated(edit.draft);
  const savingsName = Object.keys(edit.draft.savings)[0] ?? DEFAULT_SAVINGS;

  if (!edit.editable) {
    return (
      <p className="entry-meta">
        {formatMonthYear(monthYear)} is in the past and can no longer be edited.{" "}
        <Link href="/finance" className="entry-link">
          Back to Finance
        </Link>
      </p>
    );
  }
  if (edit.loadError) return <SourceError message={edit.loadError} />;
  if (edit.loading) return <p className="entry-meta">Loading…</p>;

  async function onSave() {
    const saved = await edit.save();
    if (saved) router.push("/finance");
  }

  return (
    <div className="flex flex-col gap-12">
      <div className="flex items-baseline justify-between gap-4">
        <h2 className="entry-title">
          {formatMonthYear(monthYear)}
          <span className="entry-meta ml-3">{edit.existing ? "editing" : "new budget"}</span>
        </h2>
        <span className="entry-meta">
          {edit.splitSavings ? `${money(unplaced)} unallocated` : `${money(remainder)} to savings`}
        </span>
      </div>

      <Section label="Income">
        <div className="entry flex items-baseline justify-between gap-4">
          <span className="entry-title">Expected this month</span>
          <input
            type="number"
            min={0}
            step={1}
            value={dollarsInput(edit.draft.income)}
            onChange={(e) => edit.setIncome(centsFromInput(e.target.value))}
            className={`${input} w-32 text-right`}
            aria-label="Expected income"
          />
        </div>
        <Field message={edit.errors.income} />
      </Section>

      {SPENDING_GROUPS.map(({ id, label }) => (
        <GroupEditor
          key={id}
          label={label}
          allocations={edit.draft[id]}
          error={edit.errors[id]}
          onChange={(name, amount) => edit.setAllocation(id, name, amount)}
          onRemove={(name) => edit.removeAllocation(id, name)}
        />
      ))}

      {edit.splitSavings ? (
        <GroupEditor
          label="Savings"
          allocations={edit.draft.savings}
          error={edit.errors.savings}
          onChange={(name, amount) => edit.setAllocation(BudgetGroup.SAVINGS, name, amount)}
          onRemove={(name) => edit.removeAllocation(BudgetGroup.SAVINGS, name)}
        />
      ) : (
        <Section label="Savings" aside={money(Math.max(0, remainder))}>
          <div className="entry flex items-baseline justify-between gap-4">
            <span className="entry-title">{savingsName}</span>
            <span className="figure">{money(Math.max(0, remainder))}</span>
          </div>
          <p className="entry-meta mt-1">Whatever needs and wants leave goes here.</p>
        </Section>
      )}
      <label className="entry-meta flex items-center gap-2 -mt-8">
        <input
          type="checkbox"
          checked={edit.splitSavings}
          onChange={(e) => edit.setSplitSavings(e.target.checked)}
        />
        Break savings into separate categories
      </label>

      <div className="flex items-baseline gap-6 border-t border-rule pt-4">
        <button type="button" onClick={onSave} disabled={edit.saving} className="entry-title">
          {edit.saving ? "Saving…" : edit.existing ? "Save changes" : "Create budget"}
        </button>
        <Link href="/finance" className="entry-meta">
          cancel
        </Link>
        <Field message={edit.errors.main} />
      </div>
    </div>
  );
}
