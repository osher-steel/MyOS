import "../src/load-env.js";
import {
  BookRole,
  BOOKS_COLLECTION,
  DEFAULT_BOOK,
  GOAL_ALLOCATIONS_COLLECTION,
  GOALS_COLLECTION,
  LABEL_RULES_COLLECTION,
  LINE_ENTRIES_COLLECTION,
  MONTH_REPORTS_COLLECTION,
  parseBudgetId,
  PLAID_ITEMS_COLLECTION,
  TAGS_COLLECTION,
} from "@myos/shared";
import { db } from "../src/config/firebase.js";
import { bookRecord } from "../src/services/books.js";

const apply = process.argv.includes("--apply");
const OWNER = "oshersteel@gmail.com";
const WILLY = "willy@dibs-parking.com";
const BATCH_LIMIT = 400;

const BOOKS = [
  { id: DEFAULT_BOOK, name: "Personal", members: [{ email: OWNER, role: BookRole.OWNER }] },
  {
    id: "dibs",
    name: "DIBS",
    members: [
      { email: OWNER, role: BookRole.OWNER },
      { email: WILLY, role: BookRole.MEMBER },
    ],
  },
];

// Budget and report ids embedded the owner uid; inside a book they embed the book
const reKeyed = (id: string) => {
  const parsed = parseBudgetId(id);
  return parsed ? `${DEFAULT_BOOK}_${parsed.monthYear}` : id;
};

const COLLECTIONS: Array<{ name: string; rename?: (id: string) => string }> = [
  { name: LINE_ENTRIES_COLLECTION },
  { name: PLAID_ITEMS_COLLECTION },
  { name: MONTH_REPORTS_COLLECTION, rename: reKeyed },
  { name: "budgets", rename: reKeyed },
  { name: GOALS_COLLECTION },
  { name: GOAL_ALLOCATIONS_COLLECTION },
  { name: LABEL_RULES_COLLECTION },
  { name: TAGS_COLLECTION },
  { name: "savings" },
];

const target = db.collection(BOOKS_COLLECTION).doc(DEFAULT_BOOK);
console.log(apply ? "APPLYING" : "DRY RUN (pass --apply to write)");

for (const book of BOOKS) {
  const ref = db.collection(BOOKS_COLLECTION).doc(book.id);
  const exists = (await ref.get()).exists;
  console.log(`book ${book.id}: ${exists ? "exists, members updated" : "created"} · ${book.members.map((m) => `${m.email} (${m.role})`).join(", ")}`);
  if (apply) await ref.set(bookRecord(book.id, book.name, book.members), { merge: true });
}

for (const { name, rename } of COLLECTIONS) {
  const docs = (await db.collection(name).get()).docs;
  const already = (await target.collection(name).count().get()).data().count;
  const renamed = rename ? docs.filter((doc) => rename(doc.id) !== doc.id).length : 0;
  console.log(`${name}: ${docs.length} to copy${renamed ? ` (${renamed} re-keyed, e.g. ${docs[0]!.id} → ${rename!(docs[0]!.id)})` : ""}, ${already} already in books/${DEFAULT_BOOK}`);
  if (!apply) continue;
  for (let i = 0; i < docs.length; i += BATCH_LIMIT) {
    const batch = db.batch();
    for (const doc of docs.slice(i, i + BATCH_LIMIT)) batch.set(target.collection(name).doc(rename ? rename(doc.id) : doc.id), doc.data());
    await batch.commit();
  }
}

console.log(apply ? "done; the original top-level collections are untouched" : "nothing written");
