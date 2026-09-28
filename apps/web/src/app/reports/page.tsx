import { isMonthYear, nextMonthYear, toMonthYear } from "@myos/shared";
import { Masthead } from "@/components/masthead";
import ReportsView from "@/finance/ReportsView";

export const dynamic = "force-dynamic";

export default async function Reports({ searchParams }: PageProps<"/reports">) {
  const { month } = await searchParams;
  const initialMonth = typeof month === "string" && isMonthYear(month) && month <= nextMonthYear(toMonthYear()) ? month : undefined;

  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Monthly Reports" current="reports" />
      <ReportsView initialMonth={initialMonth} />
    </main>
  );
}
