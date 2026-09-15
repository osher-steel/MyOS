import "../src/load-env.js";
import { budgetId, PlaidTransactionStatus, type MonthYear } from "@myos/shared";
import { ServiceConflictError, ServiceNotFoundError } from "../src/core/errors/errors.js";
import { budgetRepo } from "../src/domains/budgets/budgets.domain.js";
import { buildLineEntryCreateRecord, lineEntryRepo } from "../src/domains/lineEntries/lineEntries.domain.js";
import { lineEntryQuerySchema } from "../src/domains/lineEntries/lineEntries.query.js";
import { lineEntryPostSchema } from "../src/domains/lineEntries/lineEntries.schemas.js";

// Fake past months so the reports and chart can be seen before the Plaid
// sync exists. Every line entry id starts with SEED_PREFIX so `--clean` can
// find and remove exactly what was written here and nothing else.

const SEED_PREFIX = "seed_";
const SEED_MONTHS: MonthYear[] = ["2026-03", "2026-04", "2026-05", "2026-06", "2026-07", "2026-08"];

const INCOME = 6300;
const BUDGET = {
  needs: { Rent: 1800, Groceries: 450, Utilities: 180, Gas: 160, Health: 220 },
  wants: { "Eating out": 300, Subscriptions: 90, Fun: 250 },
  savings: { Emergency: 1500, Travel: 850 },
};

const SPEND_FACTOR: Record<MonthYear, number> = {
  "2026-03": 0.62,
  "2026-04": 1.0,
  "2026-05": 1.25,
  "2026-06": 0.7,
  "2026-07": 1.35,
  "2026-08": 0.85,
};
const PAYCHECK: Record<MonthYear, number> = { "2026-06": 2650 };
const BIG_UNLABELLED: Record<MonthYear, [string, number]> = { "2026-07": ["MIAMI AUTO REPAIR", 2400] };

const MERCHANTS: Record<string, string[]> = {
  Rent: ["ZELLE TO LANDLORD"],
  Groceries: ["PUBLIX #1234", "WHOLE FOODS MKT", "TRADER JOE'S", "SEDANO'S"],
  Utilities: ["FPL ELECTRIC", "ATT WIRELESS", "MIAMI-DADE WATER"],
  Gas: ["MARATHON 171066", "SHELL OIL", "WAWA 5042"],
  Health: ["CVS PHARMACY", "GYM MONTHLY", "DR VISIT COPAY"],
  "Eating out": ["TACO STAND MIAMI", "TST* TAURUS", "MAKANA KAVA", "UBER EATS", "CHIPOTLE"],
  Subscriptions: ["SPOTIFY", "NETFLIX", "ICLOUD"],
  Fun: ["AMC THEATRES", "TICKETMASTER", "STEAM GAMES", "BOOKS & BOOKS"],
};
const UNLABELLED = ["AMAZON MKTPL", "APPLE CASH SENT", "VENMO PAYMENT", "TARGET 00123", "PARKING METER"];

function mulberry32(seed: number) {
  return () => {
    seed = (seed + 0x6d2b79f5) | 0;
    let t = Math.imul(seed ^ (seed >>> 15), 1 | seed);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

type Draft = { name: string; amount: number; day: number; label?: string };

function monthDrafts(monthYear: MonthYear): Draft[] {
  const rand = mulberry32(Number(monthYear.replace("-", "")));
  const between = (lo: number, hi: number) => lo + rand() * (hi - lo);
  const day = () => 1 + Math.floor(rand() * 28);
  const pick = <T,>(list: T[]) => list[Math.floor(rand() * list.length)]!;
  const cents = (value: number) => Math.round(value * 100) / 100;

  const paycheck = PAYCHECK[monthYear] ?? INCOME / 2;
  const drafts: Draft[] = [
    { name: "ACH CREDIT GUSTO PAYROLL", amount: -paycheck, day: 1 },
    { name: "ACH CREDIT GUSTO PAYROLL", amount: -paycheck, day: 15 },
  ];

  for (const group of [BUDGET.needs, BUDGET.wants]) {
    for (const [label, allocated] of Object.entries(group)) {
      const target = label === "Rent" ? allocated : allocated * SPEND_FACTOR[monthYear]! * between(0.85, 1.15);
      const pieces = label === "Rent" ? 1 : 2 + Math.floor(rand() * 4);
      let left = target;
      for (let i = 0; i < pieces; i += 1) {
        const amount = i === pieces - 1 ? left : cents(left * between(0.2, 0.6));
        left -= amount;
        drafts.push({ name: pick(MERCHANTS[label]!), amount: cents(amount), day: day(), label });
      }
    }
  }

  const strays = 3 + Math.floor(rand() * 4);
  for (let i = 0; i < strays; i += 1) {
    drafts.push({ name: pick(UNLABELLED), amount: cents(between(8, 120)), day: day() });
  }
  const big = BIG_UNLABELLED[monthYear];
  if (big) drafts.push({ name: big[0], amount: big[1], day: 19 });

  return drafts;
}

async function seedMonth(monthYear: MonthYear, ownerUid: string) {
  const now = new Date();
  try {
    await budgetRepo.create({ income: INCOME, ...BUDGET, createdAt: now, updatedAt: now }, budgetId(ownerUid, monthYear));
    console.log(`${monthYear} budget created`);
  } catch (error) {
    if (!(error instanceof ServiceConflictError)) throw error;
    console.log(`${monthYear} budget already exists, kept`);
  }

  let created = 0;
  const drafts = monthDrafts(monthYear);
  for (const [index, draft] of drafts.entries()) {
    const input = lineEntryPostSchema.parse({
      id: `${SEED_PREFIX}${monthYear}_${index}`,
      name: draft.name,
      amount: draft.amount,
      date: `${monthYear}-${String(draft.day).padStart(2, "0")}`,
      label: draft.label,
      plaidStatus: PlaidTransactionStatus.POSTED,
    });
    try {
      await lineEntryRepo.create(buildLineEntryCreateRecord(input), input.id);
      created += 1;
    } catch (error) {
      if (!(error instanceof ServiceConflictError)) throw error;
    }
  }
  console.log(`${monthYear} ${created}/${drafts.length} line entries created`);
}

async function clean(ownerUid: string) {
  const seeded = await lineEntryRepo.list(lineEntryQuerySchema.parse({ id: { prefix: SEED_PREFIX }, limit: 10000 }));
  const months = new Set(seeded.data.map((entry) => entry.monthYear));
  for (const entry of seeded.data) await lineEntryRepo.delete(entry.id);
  console.log(`deleted ${seeded.data.length} seeded line entries`);

  for (const monthYear of SEED_MONTHS) {
    if (!months.has(monthYear)) continue;
    try {
      await budgetRepo.delete(budgetId(ownerUid, monthYear));
      console.log(`${monthYear} budget deleted`);
    } catch (error) {
      if (!(error instanceof ServiceNotFoundError)) throw error;
    }
  }
}

const ownerUid = process.env.MYOS_OWNER_UID;
if (!ownerUid) throw new Error("MYOS_OWNER_UID is not set");

if (process.argv.includes("--clean")) {
  await clean(ownerUid);
} else {
  for (const monthYear of SEED_MONTHS) await seedMonth(monthYear, ownerUid);
}
