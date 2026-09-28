import "../src/load-env.js";
import { refreshLedger } from "../src/services/ledgerRefresh.js";

const startedAt = new Date();
const { items, reports } = await refreshLedger();
for (const item of items) {
  const summary = item.skipped
    ? "skipped, synced recently"
    : `${item.created} created, ${item.updated} updated, ${item.removed} removed, ${item.deleted} settled, ${item.autoLabelled} auto-labelled`;
  console.log(`${startedAt.toISOString()} ${item.institution}: ${summary}`);
}
console.log(`${startedAt.toISOString()} reports regenerated: ${reports.join(", ") || "none"}`);
