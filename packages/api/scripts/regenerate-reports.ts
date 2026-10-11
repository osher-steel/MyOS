import "../src/load-env.js";
import { LINE_ENTRIES_COLLECTION } from "@myos/shared";
import { db } from "../src/config/firebase.js";
import { regeneratePastReports } from "../src/services/monthReports.js";

const months = (await db.collection(LINE_ENTRIES_COLLECTION).select("monthYear").get()).docs.map(
  (doc) => doc.get("monthYear") as string,
);
const regenerated = await regeneratePastReports(months);
console.log(`reports regenerated: ${regenerated.join(", ") || "none"}`);
