"use client";

import { formatMonthYear, toMonthYear, type MonthReport } from "@myos/shared";
import Link from "next/link";
import { useId } from "react";
import { Section, SourceError } from "@/components/editorial";
import { money } from "@/lib/format";
import { roundedTopBar } from "./HistoryChart";
import { useWidth } from "./useWidth";

const SERIES = [
  { key: "entry", label: "Entry", color: "var(--chart-entry)" },
  { key: "spent", label: "Spent", color: "var(--chart-spent)" },
] as const;

const DEFAULT_WIDTH = 459;
const HEIGHT = 170;
const BASELINE = 140;
const TOP = 4;
const BAR_W = 19.125;
const BAR_GAP = 4;

export default function RecentMonthsChart({
  reports,
  loading,
  error,
}: {
  reports: MonthReport[] | null;
  loading: boolean;
  error: string | null;
}) {
  const titleId = useId();
  const current = toMonthYear();

  return (
    <Section
      label={reports ? `Last ${reports.length} months` : "Last months"}
      aside={
        <Link href="/reports" className="text-ink hover:text-accent">
          Monthly Reports →
        </Link>
      }
    >
      {error ? (
        <SourceError message={error} />
      ) : loading || !reports ? (
        <p className="entry-meta">Loading…</p>
      ) : reports.length === 0 ? (
        <p className="entry-meta">No months to show yet.</p>
      ) : (
        <Bars reports={reports} current={current} titleId={titleId} />
      )}
    </Section>
  );
}

function Bars({ reports, current, titleId }: { reports: MonthReport[]; current: string; titleId: string }) {
  const [measure, width] = useWidth(DEFAULT_WIDTH);
  const max = Math.max(1, ...reports.flatMap((r) => SERIES.map((s) => r[s.key])));
  const slot = width / reports.length;
  const pairW = BAR_W * SERIES.length + BAR_GAP * (SERIES.length - 1);
  const height = (value: number) => (Math.max(0, value) / max) * (BASELINE - TOP);

  return (
    <div ref={measure} className="mt-1.5 flex flex-col gap-4">
      <svg viewBox={`0 0 ${width} ${HEIGHT}`} role="img" aria-labelledby={titleId} className="w-full">
        <title id={titleId}>Entry and spent per month</title>
        <rect x={0} y={BASELINE} width={width} height={1} fill="var(--rule)" />
        {reports.map((r, i) => {
          const isCurrent = r.monthYear === current;
          const x0 = i * slot + (slot - pairW) / 2;
          return (
            <g key={r.monthYear}>
              <title>{`${formatMonthYear(r.monthYear)}: entry ${money(r.entry)}, spent ${money(r.spent)}`}</title>
              <g opacity={isCurrent ? 1 : 0.55}>
                {SERIES.map((s, j) => {
                  const h = height(r[s.key]);
                  return <path key={s.key} d={roundedTopBar(x0 + j * (BAR_W + BAR_GAP), BASELINE - h, BAR_W, h, 2)} fill={s.color} />;
                })}
              </g>
              <text
                x={i * slot + slot / 2}
                y={BASELINE + 21}
                textAnchor="middle"
                className="figure"
                fontSize={11.5}
                fill={isCurrent ? "var(--ink)" : "var(--ink-muted)"}
              >
                {formatMonthYear(r.monthYear).slice(0, 3)}
              </text>
            </g>
          );
        })}
      </svg>

      <ul className="entry-meta flex gap-5 uppercase tracking-[0.18em]" aria-hidden>
        {SERIES.map((s) => (
          <li key={s.key} className="flex items-center gap-2">
            <span className="inline-block size-2" style={{ background: s.color }} />
            {s.label}
          </li>
        ))}
      </ul>
    </div>
  );
}
