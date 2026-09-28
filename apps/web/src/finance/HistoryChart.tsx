"use client";

import { formatMonthYear, type MonthReport } from "@myos/shared";
import { useId, useState } from "react";
import { Section, SourceError } from "@/components/editorial";
import { money } from "@/lib/format";

const SERIES = [
  { key: "entry", label: "Entry", color: "var(--chart-entry)" },
  { key: "spent", label: "Spent", color: "var(--chart-spent)" },
  { key: "savingsActual", label: "Savings", color: "var(--chart-savings)" },
] as const;

const WIDTH = 640;
const HEIGHT = 240;
const PAD = { top: 12, right: 8, bottom: 28, left: 52 };
const GAP = 2;
const RADIUS = 4;

const shortMonth = (monthYear: string) => formatMonthYear(monthYear).slice(0, 3);

function niceMax(value: number): number {
  if (value <= 0) return 1000;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

function roundedTopBar(x: number, y: number, w: number, h: number): string {
  if (h <= 0) return "";
  const r = Math.min(RADIUS, h, w / 2);
  return `M${x},${y + h} V${y + r} Q${x},${y} ${x + r},${y} H${x + w - r} Q${x + w},${y} ${x + w},${y + r} V${y + h} Z`;
}

function Table({ reports }: { reports: MonthReport[] }) {
  return (
    <table className="w-full text-[var(--text-meta)]">
      <thead className="entry-meta uppercase tracking-[0.18em] text-left">
        <tr>
          <th className="py-1 font-normal">Month</th>
          {SERIES.map((s) => (
            <th key={s.key} className="py-1 text-right font-normal">
              {s.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {reports.map((r) => (
          <tr key={r.monthYear} className="border-t border-rule">
            <td className="py-1">{formatMonthYear(r.monthYear)}</td>
            {SERIES.map((s) => (
              <td key={s.key} className="figure py-1 text-right">
                {money(r[s.key])}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export default function HistoryChart({
  reports,
  loading,
  error,
}: {
  reports: MonthReport[] | null;
  loading: boolean;
  error: string | null;
}) {
  const [view, setView] = useState<"chart" | "table">("chart");
  const [hover, setHover] = useState<number | null>(null);
  const titleId = useId();

  if (error) return <SourceError message={error} />;
  if (loading || !reports) return <p className="entry-meta">Loading…</p>;
  if (reports.length === 0) return <p className="entry-meta">No months to show yet.</p>;

  const max = niceMax(Math.max(...reports.flatMap((r) => SERIES.map((s) => r[s.key]))));
  const plotW = WIDTH - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const slot = plotW / reports.length;
  const barW = (slot * 0.7 - GAP * (SERIES.length - 1)) / SERIES.length;
  const y = (value: number) => PAD.top + plotH - (value / max) * plotH;
  const ticks = [0, 0.25, 0.5, 0.75, 1].map((f) => f * max);
  const hovered = hover === null ? null : reports[hover]!;

  return (
    <Section label="Last months" aside={undefined}>
      <div className="mb-3 flex items-baseline justify-between gap-4">
        <ul className="entry-meta flex gap-5" aria-hidden>
          {SERIES.map((s) => (
            <li key={s.key} className="flex items-center gap-1.5">
              <span className="inline-block h-2.5 w-2.5 rounded-sm" style={{ background: s.color }} />
              {s.label}
            </li>
          ))}
        </ul>
        <button type="button" className="entry-meta hover:text-accent" onClick={() => setView(view === "chart" ? "table" : "chart")}>
          {view === "chart" ? "table" : "chart"}
        </button>
      </div>

      {view === "table" ? (
        <Table reports={reports} />
      ) : (
        <div className="relative">
          <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} role="img" aria-labelledby={titleId} className="w-full" onMouseLeave={() => setHover(null)}>
            <title id={titleId}>Entry, spent and savings per month</title>
            {ticks.map((t) => (
              <g key={t}>
                <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth={1} />
                <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="figure" fill="var(--ink-muted)" fontSize={10}>
                  {money(t)}
                </text>
              </g>
            ))}
            {reports.map((r, i) => {
              const x0 = PAD.left + i * slot + slot * 0.15;
              return (
                <g key={r.monthYear} onMouseEnter={() => setHover(i)} opacity={hover === null || hover === i ? 1 : 0.45}>
                  <rect x={PAD.left + i * slot} y={PAD.top} width={slot} height={plotH} fill="transparent" />
                  {SERIES.map((s, j) => {
                    const top = y(r[s.key]);
                    return <path key={s.key} d={roundedTopBar(x0 + j * (barW + GAP), top, barW, PAD.top + plotH - top)} fill={s.color} />;
                  })}
                  <text x={PAD.left + i * slot + slot / 2} y={HEIGHT - 10} textAnchor="middle" fill="var(--ink-muted)" fontSize={11}>
                    {shortMonth(r.monthYear)}
                  </text>
                </g>
              );
            })}
            <line x1={PAD.left} x2={WIDTH - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth={1} />
          </svg>

          {hovered ? (
            <div
              className="pointer-events-none absolute top-0 border border-rule bg-paper px-3 py-2 text-[var(--text-meta)]"
              style={{ left: `${((PAD.left + (hover! + 0.5) * slot) / WIDTH) * 100}%`, transform: "translateX(-50%)" }}
            >
              <div className="entry-meta mb-1">{formatMonthYear(hovered.monthYear)}</div>
              {SERIES.map((s) => (
                <div key={s.key} className="flex justify-between gap-4">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-2 w-2 rounded-sm" style={{ background: s.color }} />
                    {s.label}
                  </span>
                  <span className="figure">{money(hovered[s.key])}</span>
                </div>
              ))}
            </div>
          ) : null}
        </div>
      )}
    </Section>
  );
}
