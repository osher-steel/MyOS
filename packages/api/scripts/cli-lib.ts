import { normalizeTag, PlaidTransactionStatus, type LineEntryView } from "@myos/shared";

export type TagMode = "add" | "remove" | "set";

export type Selector = {
  ids?: string[];
  search?: string;
  label?: string;
  tag?: string;
  unlabelled?: boolean;
};

export const hasSelector = ({ ids, search, label, tag, unlabelled }: Selector, month?: string) =>
  Boolean(ids?.length || search || label || tag || unlabelled || month);

function searchable(entry: LineEntryView): string {
  return [entry.name, entry.merchantName, entry.marketplace, entry.originalDescription].filter(Boolean).join(" ").toLowerCase();
}

/** Each id may be a prefix but must name exactly one entry, so a short id can never hit two. */
export function matchIds(entries: LineEntryView[], ids: string[]): LineEntryView[] {
  const matched = new Map<string, LineEntryView>();
  for (const id of ids) {
    const hits = entries.filter((entry) => entry.id.startsWith(id));
    if (hits.length === 0) throw new Error(`No transaction matches id "${id}".`);
    if (hits.length > 1) throw new Error(`Id "${id}" matches ${hits.length} transactions. Use more of it.`);
    matched.set(hits[0]!.id, hits[0]!);
  }
  return [...matched.values()];
}

export function selectEntries(entries: LineEntryView[], { ids, search, label, tag, unlabelled }: Selector): LineEntryView[] {
  const live = entries.filter((entry) => entry.plaidStatus !== PlaidTransactionStatus.REMOVED);
  const needle = search?.toLowerCase();
  const wantedTag = tag ? normalizeTag(tag) : undefined;
  return (ids?.length ? matchIds(live, ids) : live)
    .filter((entry) => !needle || searchable(entry).includes(needle))
    .filter((entry) => !label || entry.label?.toLowerCase() === label.toLowerCase())
    .filter((entry) => !wantedTag || entry.tags?.includes(wantedTag))
    .filter((entry) => !unlabelled || (!entry.label && !entry.goalId && entry.osStatus !== "excluded"))
    .sort((a, b) => b.date.localeCompare(a.date) || a.id.localeCompare(b.id));
}

export function nextTags(current: string[] | undefined, mode: TagMode, tags: string[]): string[] {
  const named = tags.map(normalizeTag);
  const existing = current ?? [];
  if (mode === "set") return [...new Set(named)].sort();
  if (mode === "add") return [...new Set([...existing, ...named])].sort();
  return existing.filter((tag) => !named.includes(tag)).sort();
}

export const sameTags = (a: string[] | undefined, b: string[]) => [...(a ?? [])].sort().join() === [...b].sort().join();

export function money(cents: number): string {
  const amount = `$${(Math.abs(cents) / 100).toFixed(2)}`;
  return cents < 0 ? `+${amount}` : amount;
}

export function entryRow(entry: LineEntryView): string {
  const filed = entry.label ?? (entry.goalId ? `goal:${entry.goalId}` : entry.osStatus === "excluded" ? "(excluded)" : "(unlabelled)");
  const tags = entry.tags?.length ? `#${entry.tags.join(" #")}` : "";
  return [entry.id, entry.date, money(entry.amount).padStart(11), entry.name.slice(0, 34).padEnd(34), filed.padEnd(20), tags].join("  ").trimEnd();
}
