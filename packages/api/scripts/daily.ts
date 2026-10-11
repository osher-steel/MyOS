import "../src/load-env.js";
import { forEachBook } from "../src/services/books.js";
import { refreshLedger } from "../src/services/ledgerRefresh.js";

const startedAt = new Date();
for (const { bookId, result } of await forEachBook(() => refreshLedger())) {
  for (const item of result.items) {
    const summary = item.skipped
      ? "skipped, synced recently"
      : `${item.created} created, ${item.updated} updated, ${item.removed} removed, ${item.deleted} settled, ${item.autoLabelled} auto-labelled`;
    console.log(`${startedAt.toISOString()} [${bookId}] ${item.institution}: ${summary}`);
  }
  console.log(`${startedAt.toISOString()} [${bookId}] reports regenerated: ${result.reports.join(", ") || "none"}`);
}
