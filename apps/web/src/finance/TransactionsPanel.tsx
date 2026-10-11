"use client";

import type { Budget, LineEntryGroups, LineEntryTotals, LineEntryView, MonthYear } from "@myos/shared";
import { useMemo, useState } from "react";
import { Entry, Section, SourceError } from "@/components/editorial";
import { clock, money, transactionMeta } from "@/lib/format";
import { LabelPicker } from "./LabelPicker";
import { TagEditor } from "./TagEditor";
import TransactionCard from "./TransactionCard";
import { useTags } from "./useTags";

type Tab = "all" | "labelled" | "unlabelled" | "business";

const MOBILE_PREVIEW = 5;

const TABS: Array<{ id: Tab; label: string }> = [
  { id: "all", label: "All" },
  { id: "labelled", label: "Labelled" },
  { id: "unlabelled", label: "Unlabelled" },
  { id: "business", label: "Business" },
];

type Filter = { kind: "tag" | "label"; value: string } | null;

const filterKey = (filter: Filter) => (filter ? `${filter.kind}:${filter.value}` : "");

function parseFilter(key: string): Filter {
  const at = key.indexOf(":");
  return at > 0 ? { kind: key.slice(0, at) as "tag" | "label", value: key.slice(at + 1) } : null;
}

function matches(entry: LineEntryView, filter: Filter): boolean {
  if (!filter) return true;
  return filter.kind === "tag" ? Boolean(entry.tags?.includes(filter.value)) : entry.label === filter.value;
}

function countBy(entries: LineEntryView[], keysOf: (entry: LineEntryView) => string[]): Array<[string, number]> {
  const counts = new Map<string, number>();
  for (const entry of entries) for (const key of keysOf(entry)) counts.set(key, (counts.get(key) ?? 0) + 1);
  return [...counts].sort((a, b) => a[0].localeCompare(b[0]));
}

export default function TransactionsPanel({
  groups,
  totals,
  budget,
  labelEntry,
  tagEntry,
  bookEntry,
  markBusiness,
  loading,
  sync,
  errors,
}: {
  groups: LineEntryGroups;
  totals: LineEntryTotals;
  budget: Budget | null;
  labelEntry: (entry: LineEntryView, label: string) => void;
  tagEntry: (entry: LineEntryView, tags: string[]) => void;
  bookEntry: (entry: LineEntryView, bookedMonth: MonthYear | null) => void;
  markBusiness: (entry: LineEntryView, business: boolean) => void;
  loading: boolean;
  sync: { syncing: boolean; syncedAt: Date | null; autoLabelled: number };
  errors: { api: string | null; sync: string | null; save: string | null };
}) {
  const [tab, setTab] = useState<Tab>("all");
  const [openId, setOpenId] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [filter, setFilter] = useState<Filter>(null);
  const vocabulary = useTags();
  const opened = openId ? [...groups.all, ...groups.business].find((entry) => entry.id === openId) : undefined;
  const tagCounts = useMemo(() => countBy(groups.all, (entry) => entry.tags ?? []), [groups.all]);
  const labelCounts = useMemo(() => countBy(groups.all, (entry) => (entry.label ? [entry.label] : [])), [groups.all]);
  const filtered = useMemo(
    () => Object.fromEntries(TABS.map(({ id }) => [id, groups[id].filter((entry) => matches(entry, filter))])) as Record<Tab, LineEntryView[]>,
    [groups, filter],
  );
  const entries = filtered[tab];
  const filteredSpent = entries.reduce((sum, entry) => sum + Math.max(entry.amount, 0), 0);

  return (
    <Section label="Transactions" aside={groups.all.length > 0 ? `${money(totals.spent, { cents: true })} spent` : undefined}>
      {errors.api ? <SourceError message={`ledger: ${errors.api}`} /> : null}
      {errors.sync ? <SourceError message={`bank sync: ${errors.sync}`} /> : null}
      {errors.save ? <SourceError message={`label not saved: ${errors.save}`} /> : null}
      {vocabulary.error ? <SourceError message={`tags: ${vocabulary.error}`} /> : null}

      <p className="entry-meta mb-3.5">
        {money(totals.spentLabelled, { cents: true })} labelled · {money(totals.spentUnlabelled, { cents: true })} unlabelled
        {sync.syncing ? " · syncing with bank…" : sync.syncedAt ? ` · synced ${clock(sync.syncedAt.toISOString())}` : null}
        {sync.autoLabelled > 0 ? ` · ${sync.autoLabelled} auto-labelled` : null}
      </p>

      {tagCounts.length > 0 || labelCounts.length > 0 ? (
        <label className="entry-meta mb-3 flex flex-wrap items-baseline gap-2">
          <span className="uppercase tracking-[0.18em]">Filter</span>
          <select
            value={filterKey(filter)}
            onChange={(event) => {
              setFilter(parseFilter(event.target.value));
              setExpanded(false);
            }}
            className="bg-transparent border-b border-rule focus:border-ink outline-none py-0.5 text-ink"
          >
            <option value="">everything</option>
            {tagCounts.length > 0 ? (
              <optgroup label="Tags">
                {tagCounts.map(([tag, count]) => (
                  <option key={tag} value={`tag:${tag}`}>
                    #{tag} · {count}
                  </option>
                ))}
              </optgroup>
            ) : null}
            {labelCounts.length > 0 ? (
              <optgroup label="Categories">
                {labelCounts.map(([label, count]) => (
                  <option key={label} value={`label:${label}`}>
                    {label} · {count}
                  </option>
                ))}
              </optgroup>
            ) : null}
          </select>
          {filter ? (
            <>
              <span>{money(filteredSpent, { cents: true })} spent</span>
              <button type="button" className="hover:text-accent" onClick={() => setFilter(null)}>
                clear ×
              </button>
            </>
          ) : null}
        </label>
      ) : null}

      <div role="tablist" className="flex gap-6 border-b border-rule">
        {TABS.map(({ id, label }) => (
          <button
            key={id}
            type="button"
            role="tab"
            aria-selected={tab === id}
            onClick={() => {
              setTab(id);
              setExpanded(false);
            }}
            className={`entry-meta flex items-end gap-1.5 pb-2 -mb-px border-b ${
              tab === id ? "border-ink text-ink" : "border-transparent hover:border-rule"
            }`}
          >
            <span className="uppercase tracking-[0.18em]">{label}</span>
            <span className="figure text-[length:var(--text-meta)] text-muted">{filtered[id].length}</span>
          </button>
        ))}
      </div>

      {loading && groups.all.length === 0 ? (
        <p className="entry-meta py-4">Loading…</p>
      ) : entries.length === 0 ? (
        <p className="entry-meta py-4">Nothing here.</p>
      ) : (
        <div key={`${tab}-${filterKey(filter)}`} className="md:max-h-[max(18rem,calc(100dvh-14rem))] md:overflow-y-auto md:overscroll-contain md:pr-3">
          {entries.map((entry, index) => (
            <Entry
              key={entry.id}
              className={expanded ? undefined : index >= MOBILE_PREVIEW ? "max-md:hidden" : index === MOBILE_PREVIEW - 1 ? "max-md:border-b-0" : undefined}
              title={entry.merchantName ?? entry.name}
              meta={transactionMeta(entry)}
              onOpen={() => setOpenId(entry.id)}
              figure={
                entry.amount < 0
                  ? `+${money(-entry.amount, { currency: entry.currency, cents: true })}`
                  : money(entry.amount, { currency: entry.currency, cents: true })
              }
              positive={entry.amount < 0}
              metaAside={<TagEditor entry={entry} vocabulary={vocabulary} onTags={tagEntry} revealOnHover />}
              label={<LabelPicker entry={entry} budget={budget} onLabel={labelEntry} />}
            />
          ))}
        </div>
      )}

      {entries.length > 0 ? (
        <div className="entry-meta flex items-baseline justify-between border-t border-rule pt-3.5">
          <span className="max-md:hidden">
            {entries.length} {entries.length === 1 ? "transaction" : "transactions"}
          </span>
          <span className="md:hidden">
            Showing {expanded ? entries.length : Math.min(MOBILE_PREVIEW, entries.length)} of {entries.length}
          </span>
          {entries.length > MOBILE_PREVIEW ? (
            <button type="button" className="text-ink hover:text-accent md:hidden" onClick={() => setExpanded(!expanded)}>
              {expanded ? "Show fewer ↑" : "View all →"}
            </button>
          ) : null}
        </div>
      ) : null}

      {opened ? (
        <TransactionCard
          entry={opened}
          budget={budget}
          vocabulary={vocabulary}
          onClose={() => setOpenId(null)}
          onLabel={labelEntry}
          onTags={tagEntry}
          onBusiness={markBusiness}
          onBook={(entry, bookedMonth) => {
            bookEntry(entry, bookedMonth);
            setOpenId(null);
          }}
        />
      ) : null}
    </Section>
  );
}
