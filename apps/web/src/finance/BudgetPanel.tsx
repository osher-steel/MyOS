"use client";

import { BudgetGroup, type BudgetUsage, type GroupUsage } from "@myos/shared";
import { Section, SourceError } from "@/components/editorial";
import { money } from "@/lib/format";

const GROUP_LABELS: Record<BudgetGroup, string> = {
  [BudgetGroup.NEEDS]: "Needs",
  [BudgetGroup.WANTS]: "Wants",
  [BudgetGroup.SAVINGS]: "Savings",
};

function UsedOf({ used, allocated, savings, small }: { used: number; allocated: number; savings: boolean; small?: boolean }) {
  const over = savings ? used < allocated : used > allocated;
  return (
    <span className={`figure shrink-0 ${small ? "text-[length:var(--text-small)]" : ""}`}>
      <span className={over ? "text-accent" : undefined}>{money(used)}</span>
      <span className="text-muted"> / {money(allocated)}</span>
    </span>
  );
}

function GroupRow({ usage }: { usage: GroupUsage }) {
  const savings = usage.group === BudgetGroup.SAVINGS;
  return (
    <details className="disclosure border-b border-rule last:border-b-0" open={usage.group === BudgetGroup.NEEDS}>
      <summary className="flex items-center justify-between gap-4 py-3">
        <span className="flex items-center gap-2.5">
          <span className="disclosure-toggle text-muted" />
          <span className="entry-title">{GROUP_LABELS[usage.group]}</span>
        </span>
        <UsedOf used={usage.used} allocated={usage.allocated} savings={savings} />
      </summary>
      <div className="pb-3 pl-[26px]">
        {usage.categories.length === 0 ? (
          <p className="entry-meta py-1.5">Nothing allocated.</p>
        ) : (
          usage.categories.map((category) => (
            <div key={category.name} className="flex items-baseline justify-between gap-4 py-1.5">
              <span className="min-w-0 truncate">{category.name}</span>
              <UsedOf used={category.used} allocated={category.allocated} savings={savings} small />
            </div>
          ))
        )}
      </div>
    </details>
  );
}

export default function BudgetPanel({
  usage,
  loading,
  error,
}: {
  usage: BudgetUsage | null;
  loading: boolean;
  error: string | null;
}) {
  return (
    <Section label="Budget" aside="used / allocated">
      {error ? (
        <SourceError message={error} />
      ) : loading ? (
        <p className="entry-meta">Loading…</p>
      ) : !usage ? (
        <p className="entry-meta">No budget for this month yet.</p>
      ) : (
        <>
          <div className="-mt-2.5">
            {usage.groups.map((group) => (
              <GroupRow key={group.group} usage={group} />
            ))}
          </div>
          <p className="entry-meta">Savings is filled when the month closes.</p>
        </>
      )}
    </Section>
  );
}
