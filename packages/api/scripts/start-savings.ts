import "../src/load-env.js";
import { scriptBook } from "./book.js";
import { isMonthYear } from "@myos/shared";

import { computeOpening, startSavings } from "../src/services/savings.js";

scriptBook();

const startMonth = process.argv[2];
if (!startMonth || !isMonthYear(startMonth)) throw new Error("Usage: pnpm api savings:start YYYY-MM");

await startSavings(startMonth);
const { opening } = await computeOpening();
console.log(
  `savings start ${startMonth}: balance ${opening!.balance / 100}, moved since ${opening!.movedSince / 100}, opening ${opening!.amount / 100}`,
);
