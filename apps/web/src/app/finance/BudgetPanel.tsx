"use client";

import { BudgetGroup, budgetUsage, type Budget, type GroupUsage } from "@myos/shared";
import { Section, SourceError } from "@/components/editorial";
import { money } from "@/lib/format";

const GROUP_LABELS: Record<BudgetGroup, string> = {
  [BudgetGroup.NEEDS]: "Needs",
  [BudgetGroup.WANTS]: "Wants",
  [BudgetGroup.SAVINGS]: "Savings",
};

function Stat({ label, value }: { label: string; value: string }) {
  return (
    <div>
      <div className="entry-meta uppercase tracking-[0.18em]">{label}</div>
      <div className="figure text-[var(--text-headline)]">{value}</div>
    </div>
  );
}

function UsedOf({ used, allocated, savings }: { used: number; allocated: number; savings: boolean }) {
  const over = savings ? used < allocated : used > allocated;
  return (
    <span className="figure shrink-0">
      <span className={over ? "text-accent" : undefined}>{money(used)}</span>
      <span className="text-muted"> / {money(allocated)}</span>
    </span>
  );
}

function GroupRow({ usage }: { usage: GroupUsage }) {
  const savings = usage.group === BudgetGroup.SAVINGS;
  return (
    <details className="disclosure entry">
      <summary className="flex items-baseline justify-between gap-4">
        <span className="entry-title">
          <span className="disclosure-toggle text-muted" /> {GROUP_LABELS[usage.group]}
        </span>
        <UsedOf used={usage.used} allocated={usage.allocated} savings={savings} />
      </summary>
      <div className="mt-2 pl-5">
        {usage.categories.length === 0 ? (
          <p className="entry-meta py-2">Nothing allocated.</p>
        ) : (
          usage.categories.map((category) => (
            <div key={category.name} className="flex items-baseline justify-between gap-4 py-1.5">
              <span className="min-w-0">{category.name}</span>
              <UsedOf used={category.used} allocated={category.allocated} savings={savings} />
            </div>
          ))
        )}
      </div>
    </details>
  );
}

export default function BudgetPanel({
  budget,
  loading,
  error,
  usedByLabel,
  unlabelledSpent,
}: {
  budget: Budget | null;
  loading: boolean;
  error: string | null;
  usedByLabel: Record<string, number>;
  unlabelledSpent: number;
}) {
  if (error) return <SourceError message={error} />;
  if (loading) return <p className="entry-meta">Loading…</p>;
  if (!budget) return <p className="entry-meta">No budget for this month yet.</p>;

  const usage = budgetUsage(budget, usedByLabel, { unlabelledSpent });

  return (
    <div className="flex flex-col gap-10">
      <div className="grid grid-cols-2 gap-x-8">
        <Stat label="Allocated" value={money(usage.allocated)} />
        <Stat label="Unallocated" value={money(usage.unallocated)} />
      </div>

      <Section label="Budget" aside="used / allocated">
        {usage.groups.map((group) => (
          <GroupRow key={group.group} usage={group} />
        ))}
      </Section>
    </div>
  );
}
