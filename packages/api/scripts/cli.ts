import { parseArgs } from "node:util";
import { DEFAULT_BOOK, normalizeTag, type LineEntryView } from "@myos/shared";
import { entryRow, hasSelector, money, nextTags, sameTags, selectEntries, type Selector, type TagMode } from "./cli-lib.js";

const USAGE = `Change transaction labels and tags from the terminal.

  pnpm api cli books
  pnpm api cli labels                       labels in use, with counts
  pnpm api cli tags                         tags that exist
  pnpm api cli list [selectors]

  pnpm api cli label <label> <selectors> [--new-label] [--apply]
  pnpm api cli tag add <tag...> <selectors> [--apply]
  pnpm api cli tag remove <tag...> <selectors> [--apply]
  pnpm api cli tag set [tag...] <selectors> [--apply]      no tags clears them
  pnpm api cli tag create <tag...> [--apply]

Selectors (combine to narrow):
  --id <id>         id from list, or a unique start of it; repeatable
  --month YYYY-MM   --search <text>   --label <label>   --tag <tag>   --unlabelled

  --book <id>       default MYOS_BOOK, then personal

Writes only preview until you pass --apply.`;

const { values, positionals } = parseArgs({
  allowPositionals: true,
  options: {
    id: { type: "string", multiple: true },
    month: { type: "string" },
    search: { type: "string" },
    label: { type: "string" },
    tag: { type: "string" },
    unlabelled: { type: "boolean" },
    book: { type: "string" },
    apply: { type: "boolean" },
    "new-label": { type: "boolean" },
    help: { type: "boolean", short: "h" },
  },
});

const BASE = (process.env.MYOS_API_URL ?? process.env.MYOS_URL ?? "http://localhost:8787").trim().replace(/\/+$/, "");
const KEY = process.env.MYOS_API_KEY;
const book = values.book ?? process.env.MYOS_BOOK ?? DEFAULT_BOOK;
const selector: Selector = { ids: values.id, search: values.search, label: values.label, tag: values.tag, unlabelled: values.unlabelled };

async function api<T>(path: string, init: RequestInit = {}, scoped = true): Promise<{ data: T; cursor?: string }> {
  if (!KEY) throw new Error("MYOS_API_KEY isn't set in .env.");
  const res = await fetch(`${BASE}${path}`, {
    ...init,
    headers: { "Content-Type": "application/json", Authorization: `Bearer ${KEY}`, ...(scoped ? { "X-Book": book } : {}) },
  });
  const body = (await res.json()) as { data: T; cursor?: string; error?: string; details?: unknown };
  if (!res.ok) throw new Error(`${body.error ?? `HTTP ${res.status}`}${body.details ? ` ${JSON.stringify(body.details)}` : ""}`);
  return body;
}

async function loadEntries(month?: string): Promise<LineEntryView[]> {
  const entries: LineEntryView[] = [];
  let cursor: string | undefined;
  do {
    const query = new URLSearchParams({ limit: "1000", ...(month ? { monthYear: month } : {}), ...(cursor ? { cursor } : {}) });
    const page = await api<LineEntryView[]>(`/line-entries?${query}`);
    entries.push(...page.data);
    cursor = page.cursor;
  } while (cursor);
  return entries;
}

async function knownTags(): Promise<Set<string>> {
  const { data } = await api<Array<{ id: string }>>("/tags?limit=500");
  return new Set(data.map((tag) => tag.id));
}

async function selected(): Promise<LineEntryView[]> {
  // Filtered here rather than by query: combined filters would need composite Firestore indexes
  return selectEntries(await loadEntries(values.month), selector);
}

function requireSelector() {
  if (!hasSelector(selector, values.month)) throw new Error("Name the transactions to change with --id, --month, --search, --label, --tag or --unlabelled.");
}

type Change = { entry: LineEntryView; patch: { label?: string; tags?: string[] }; description: string };

async function applyChanges(changes: Change[], skipped: number) {
  const verb = values.apply ? "Changing" : "Would change";
  console.log(`${verb} ${changes.length} transaction(s) in "${book}"${skipped ? `; ${skipped} already correct` : ""}:\n`);
  for (const { entry, description } of changes) console.log(`${entryRow(entry)}\n    -> ${description}`);
  if (changes.length === 0) return;

  if (!values.apply) {
    console.log("\nPreview only. Add --apply to write.");
    console.log("Each edit also teaches label rules, which can refile other transactions from the same merchant.");
    return;
  }

  // One at a time: each write's rule learning has to see the one before it
  let done = 0;
  for (const { entry, patch } of changes) {
    try {
      await api(`/line-entries/${encodeURIComponent(entry.id)}`, { method: "PATCH", body: JSON.stringify(patch) });
      done += 1;
    } catch (error) {
      throw new Error(`Stopped after ${done} of ${changes.length}: ${entry.id} failed: ${(error as Error).message}`);
    }
  }
  console.log(`\nChanged ${done} of ${changes.length}. Other transactions from the same merchants may have been refiled by rules.`);
}

async function setLabel(label: string | undefined) {
  if (!label) throw new Error("Which label? pnpm api cli label <label> <selectors>");
  requireSelector();
  const [matches, everything] = await Promise.all([selected(), loadEntries()]);
  const inUse = new Set(everything.flatMap((entry) => (entry.label ? [entry.label] : [])));
  if (!inUse.has(label) && !values["new-label"]) {
    const close = [...inUse].filter((known) => known.toLowerCase() === label.toLowerCase());
    throw new Error(`No transaction uses the label "${label}" yet.${close.length ? ` Did you mean "${close[0]}"?` : ""} Pass --new-label if it's meant to be new.`);
  }
  const pending = matches.filter((entry) => entry.label !== label);
  await applyChanges(
    pending.map((entry) => ({ entry, patch: { label }, description: `label: ${entry.label ?? "(none)"} -> ${label}` })),
    matches.length - pending.length,
  );
}

async function changeTags(mode: TagMode, names: string[]) {
  if (mode !== "set" && names.length === 0) throw new Error(`Which tags? pnpm api cli tag ${mode} <tag...> <selectors>`);
  requireSelector();
  const known = await knownTags();
  const unknown = names.map(normalizeTag).filter((tag) => mode !== "remove" && !known.has(tag));
  if (unknown.length > 0) throw new Error(`No tag: ${unknown.join(", ")}. Create it with: pnpm api cli tag create ${unknown.join(" ")} --apply`);

  const matches = await selected();
  const planned = matches.map((entry) => ({ entry, tags: nextTags(entry.tags, mode, names) }));
  const pending = planned.filter(({ entry, tags }) => !sameTags(entry.tags, tags));
  const overLimit = pending.find(({ tags }) => tags.length > 10);
  if (overLimit) throw new Error(`${overLimit.entry.id} would have more than 10 tags. Nothing was changed.`);
  await applyChanges(
    pending.map(({ entry, tags }) => ({ entry, patch: { tags }, description: `tags: ${(entry.tags ?? []).join(", ") || "(none)"} -> ${tags.join(", ") || "(none)"}` })),
    matches.length - pending.length,
  );
}

async function createTags(names: string[]) {
  if (names.length === 0) throw new Error("Which tags? pnpm api cli tag create <tag...>");
  const known = await knownTags();
  const fresh = [...new Set(names.map(normalizeTag))].filter((tag) => !known.has(tag));
  if (fresh.length === 0) return console.log("Those tags already exist.");
  if (!values.apply) return console.log(`Would create in "${book}": ${fresh.join(", ")}\nPreview only. Add --apply to write.`);
  for (const name of fresh) await api("/tags", { method: "POST", body: JSON.stringify({ name }) });
  console.log(`Created in "${book}": ${fresh.join(", ")}`);
}

async function main() {
  const [command, ...args] = positionals;
  console.error(`[${BASE} · book ${book}]`);
  switch (command) {
    case "books": {
      const { data } = await api<Array<{ id: string; name: string }>>("/books", {}, false);
      for (const { id, name } of data) console.log(`${id}  ${name}`);
      return;
    }
    case "labels": {
      const counts = new Map<string, number>();
      for (const entry of selectEntries(await loadEntries(values.month), {})) {
        if (entry.label) counts.set(entry.label, (counts.get(entry.label) ?? 0) + 1);
      }
      for (const [label, count] of [...counts].sort(([a], [b]) => a.localeCompare(b))) console.log(`${String(count).padStart(5)}  ${label}`);
      return;
    }
    case "tags":
      for (const tag of [...(await knownTags())].sort()) console.log(tag);
      return;
    case "list": {
      const matches = await selected();
      for (const entry of matches) console.log(entryRow(entry));
      console.log(`\n${matches.length} transaction(s), ${money(matches.reduce((sum, entry) => sum + entry.amount, 0))} net`);
      return;
    }
    case "label":
      return setLabel(args[0]);
    case "tag": {
      const [mode, ...names] = args;
      if (mode === "create") return createTags(names);
      if (mode === "add" || mode === "remove" || mode === "set") return changeTags(mode, names);
      throw new Error("Use: tag add | remove | set | create");
    }
    default:
      console.log(USAGE);
  }
}

if (values.help) console.log(USAGE);
else {
  try {
    await main();
  } catch (error) {
    console.error(`Error: ${(error as Error).message}`);
    process.exitCode = 1;
  }
}
