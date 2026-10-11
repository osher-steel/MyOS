import "../src/load-env.js";
import { mkdirSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { db, Timestamp } from "../src/config/firebase.js";

type Dumped = { path: string; data: unknown };

// Timestamps become tagged objects so restore can bring them back as Timestamps, not strings
function encode(value: unknown): unknown {
  if (value instanceof Timestamp) return { __timestamp: value.toMillis() };
  if (Array.isArray(value)) return value.map(encode);
  if (value && typeof value === "object") return Object.fromEntries(Object.entries(value).map(([key, inner]) => [key, encode(inner)]));
  return value;
}

async function dumpCollection(collection: FirebaseFirestore.CollectionReference, out: Dumped[]): Promise<void> {
  for (const doc of (await collection.get()).docs) {
    out.push({ path: doc.ref.path, data: encode(doc.data()) });
    for (const child of await doc.ref.listCollections()) await dumpCollection(child, out);
  }
  // Documents that only hold subcollections have no data of their own but must still be walked
  for (const ref of await collection.listDocuments()) {
    if (out.some((dumped) => dumped.path === ref.path)) continue;
    for (const child of await ref.listCollections()) await dumpCollection(child, out);
  }
}

const docs: Dumped[] = [];
for (const collection of await db.listCollections()) await dumpCollection(collection, docs);

const dir = join(import.meta.dirname, "..", "..", "..", "backups");
mkdirSync(dir, { recursive: true });
const file = join(dir, `firestore-${process.env.APP_FIREBASE_PROJECT_ID}-${new Date().toISOString().replace(/[:.]/g, "-")}.json`);
writeFileSync(file, JSON.stringify({ project: process.env.APP_FIREBASE_PROJECT_ID, takenAt: new Date().toISOString(), docs }, null, 1), { mode: 0o600 });

const byCollection = new Map<string, number>();
for (const { path } of docs) {
  const key = path.split("/").filter((_, i) => i % 2 === 0).join("/");
  byCollection.set(key, (byCollection.get(key) ?? 0) + 1);
}
for (const [key, count] of [...byCollection].sort()) console.log(`${String(count).padStart(5)}  ${key}`);
console.log(`${docs.length} documents → ${file}`);
