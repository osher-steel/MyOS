"use client";

import { formatMonthYear, nextMonthYear, previousMonthYear, toMonthYear } from "@myos/shared";
import Link from "next/link";
import BudgetPanel from "./BudgetPanel";
import HistoryChart from "./HistoryChart";
import ReportPanel from "./ReportPanel";
import TransactionsPanel from "./TransactionsPanel";
import useFinance from "./useFinance";

export default function FinancePanels() {
  const { monthYear, setMonthYear, budget, transactions, report, history } = useFinance();
  const isCurrent = monthYear === toMonthYear();
  const editable = monthYear >= toMonthYear();

  return (
    <>
      <div className="flex items-baseline justify-between gap-4 md:col-span-2">
        <h2 className="entry-title">{formatMonthYear(monthYear)}</h2>
        <div className="entry-meta flex gap-4">
          <button type="button" onClick={() => setMonthYear(previousMonthYear(monthYear))}>
            ← previous
          </button>
          <button type="button" onClick={() => setMonthYear(nextMonthYear(monthYear))} disabled={isCurrent}>
            next →
          </button>
          {editable ? (
            <Link href={`/finance/edit/${monthYear}`} className="entry-link">
              edit
            </Link>
          ) : null}
        </div>
      </div>

      <BudgetPanel {...budget} />
      <TransactionsPanel {...transactions} />
      <ReportPanel monthYear={monthYear} {...report} />
      <HistoryChart {...history} />
    </>
  );
}
