import type { MonthYear } from "../types/interfaces/common.js";
import { LineEntryStatus, PlaidTransactionStatus, type LineEntryView } from "../types/interfaces/finance.js";
import { previousMonthYear } from "./monthYear.js";

export const SUBSCRIPTION_LABEL = "Subscriptions";
export const SUBSCRIPTION_TAG = "subscription";
const SAME_PRICE_BAND = 0.15;
const MAX_CHARGES_PER_MONTH = 1.5;
const EVERYDAY_CATEGORIES = new Set(["FOOD_AND_DRINK", "TRANSPORTATION", "TRANSFER_OUT", "LOAN_PAYMENTS"]);
const PRICE_CHANGE_CENTS = 100;
const BILLING_CYCLE_DAYS = 45;
const DAY_MS = 86_400_000;

const daysBetween = (from: string, to: string) => (Date.parse(to) - Date.parse(from)) / DAY_MS;
const PRICE_CHANGE_SHARE = 0.02;

const priceChanged = (before: number, after: number) =>
  Math.abs(after - before) >= Math.min(PRICE_CHANGE_CENTS, before * PRICE_CHANGE_SHARE);

export enum SubscriptionStatus {
  NEW = "new",
  CHANGED = "changed",
  NOT_CHARGED_YET = "not_charged_yet",
  ACTIVE = "active",
  LAPSED = "lapsed",
}

export type Subscription = {
  key: string;
  name: string;
  amount: number;
  previousAmount?: number;
  months: number;
  lastDate: string;
  label?: string;
  status: SubscriptionStatus;
};

export type SubscriptionsSummary = { monthYear: MonthYear; monthlyTotal: number; subscriptions: Subscription[] };

const lastOf = <T>(items: T[]): T => items[items.length - 1]!;

const merchantOf = (entry: LineEntryView) => entry.merchantEntityId ?? entry.merchantName ?? entry.descriptionKey ?? entry.name;

const marked = (entry: LineEntryView) => entry.label === SUBSCRIPTION_LABEL || Boolean(entry.tags?.includes(SUBSCRIPTION_TAG));

function looksRecurring(band: LineEntryView[]): boolean {
  if (band.some(marked)) return true;
  const months = new Set(band.map((charge) => charge.monthYear)).size;
  return months >= 2 && band.length <= months * MAX_CHARGES_PER_MONTH && !EVERYDAY_CATEGORIES.has(lastOf(band).categoryPrimary ?? "");
}

/**
 * One merchant can bill several plans side by side (Apple at $2.99 and
 * $4.99), so charges split into price bands, and only bands that look like
 * a subscription on their own are kept. A later band continues a kept one
 * that ended before it began, as the same plan at a new price, when it
 * recurs too or its first charge lands within a billing cycle.
 */
function priceBands(charges: LineEntryView[]): LineEntryView[][] {
  const bands: LineEntryView[][] = [];
  for (const charge of [...charges].sort((a, b) => a.date.localeCompare(b.date))) {
    const band = bands.find((existing) => {
      const reference = lastOf(existing).amount;
      return Math.abs(charge.amount - reference) <= reference * SAME_PRICE_BAND;
    });
    if (band) band.push(charge);
    else bands.push([charge]);
  }
  const plans: LineEntryView[][] = [];
  for (const band of bands.sort((a, b) => a[0]!.date.localeCompare(b[0]!.date))) {
    const ended = plans.filter((plan) => lastOf(plan).date < band[0]!.date);
    const older = ended.length > 0 ? ended.reduce((a, b) => (lastOf(a).date > lastOf(b).date ? a : b)) : undefined;
    const continues = older && (looksRecurring(band) || daysBetween(lastOf(older).date, band[0]!.date) <= BILLING_CYCLE_DAYS);
    if (older && continues) older.push(...band);
    else if (looksRecurring(band)) plans.push([...band]);
  }
  return plans;
}

function statusOf(band: LineEntryView[], monthYear: MonthYear): SubscriptionStatus {
  const months = new Set(band.map((charge) => charge.monthYear));
  const last = lastOf(band);
  const previous = band[band.length - 2];
  const lastMonth = previousMonthYear(monthYear);
  if (!months.has(monthYear) && !months.has(lastMonth)) return SubscriptionStatus.LAPSED;
  if (months.size === 1) return SubscriptionStatus.NEW;
  if (previous && priceChanged(previous.amount, last.amount)) return SubscriptionStatus.CHANGED;
  if (!months.has(monthYear)) return SubscriptionStatus.NOT_CHARGED_YET;
  return SubscriptionStatus.ACTIVE;
}

/**
 * A subscription is one merchant charging about the same price roughly once
 * a month for two or more months, or anything labelled or tagged as one.
 * Food and transport only count when marked, since regular haunts repeat too.
 * The monthly total counts what's still running: charged this month or last.
 */
export function detectSubscriptions(entries: LineEntryView[], monthYear: MonthYear): SubscriptionsSummary {
  const charges = entries.filter(
    (entry) =>
      entry.amount > 0 &&
      !entry.business &&
      !entry.goalId &&
      entry.osStatus !== LineEntryStatus.EXCLUDED &&
      entry.plaidStatus !== PlaidTransactionStatus.REMOVED,
  );
  const byMerchant = new Map<string, LineEntryView[]>();
  for (const charge of charges) byMerchant.set(merchantOf(charge), [...(byMerchant.get(merchantOf(charge)) ?? []), charge]);

  const subscriptions: Subscription[] = [];
  for (const [merchant, merchantCharges] of byMerchant) {
    for (const band of priceBands(merchantCharges)) {
      const months = new Set(band.map((charge) => charge.monthYear)).size;
      const last = lastOf(band);
      const previous = band[band.length - 2];
      subscriptions.push({
        key: `${merchant}:${band[0]!.amount}`,
        name: last.merchantName ?? last.name,
        amount: last.amount,
        ...(previous && priceChanged(previous.amount, last.amount) ? { previousAmount: previous.amount } : {}),
        months,
        lastDate: last.date,
        ...(last.label ? { label: last.label } : {}),
        status: statusOf(band, monthYear),
      });
    }
  }

  subscriptions.sort((a, b) => b.amount - a.amount);
  const monthlyTotal = subscriptions
    .filter((subscription) => subscription.status !== SubscriptionStatus.LAPSED)
    .reduce((sum, subscription) => sum + subscription.amount, 0);
  return { monthYear, monthlyTotal, subscriptions };
}
