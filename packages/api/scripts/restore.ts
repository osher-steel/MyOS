import "../src/load-env.js";
import { readFileSync } from "node:fs";
import { db, Timestamp } from "../src/config/firebase.js";

const BATCH_LIMIT = 400;
const file = process.argv[2];
const apply = process.argv.includes("--apply");
const everything = process.argv.includes("--all");
if (!file) throw new Error("Usage: pnpm api restore <backup.json> [--apply] [--all]");

const backup = JSON.parse(readFileSync(file, "utf8")) as { project: string; docs: Array<{ path: string; data: unknown }> };
const target = process.env.APP_FIREBASE_PROJECT_ID;
if (target === backup.project) throw new Error(`The backup came from ${target}; point APP_FIREBASE_* at the new project first.`);

function decode(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(decode);
  if (value && typeof value === "object") {
    const record = value as Record<string, unknown>;
    if (typeof record.__timestamp === "number" && Object.keys(record).length === 1) return Timestamp.fromMillis(record.__timestamp);
    return Object.fromEntries(Object.entries(record).map(([key, inner]) => [key, decode(inner)]));
  }
  return value;
}

// Only books/ by default: the top-level collections are the pre-books copies kept as a fallback
const docs = backup.docs.filter(({ path }) => everything || path.startsWith("books/"));
const existing = (await db.collection("books").limit(1).get()).size;
console.log(`${apply ? "APPLYING" : "DRY RUN (pass --apply to write)"}: ${docs.length} documents from ${backup.project} into ${target}`);
if (existing > 0) console.log("note: the target already has books; matching documents will be overwritten");

if (apply) {
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const { path, data } of docs.slice(i, i + BATCH_LIMIT)) batch.set(db.doc(path), decode(data) as FirebaseFirestore.DocumentData);
    await batch.commit();
  }
  const written = (await db.collectionGroup("lineEntries").count().get()).data().count;
  console.log(`done; ${written} transactions now in ${target}`);
}
