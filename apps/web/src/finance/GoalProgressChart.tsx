"use client";

import { GoalStatus, type Goal, type GoalAllocation } from "@myos/shared";
import { useId, useState } from "react";
import { money } from "@/lib/format";
import { timeOf } from "./useGoals";
import { useWidth } from "./useWidth";

// Ordered by goal age among active goals, so filtering the chart never repaints a line
const GOAL_COLORS = ["var(--chart-savings)", "var(--chart-entry)", "var(--chart-spent)"];
const OVERFLOW_COLOR = "var(--ink-muted)";

const HEIGHT = 240;
const PAD = { top: 12, right: 12, bottom: 28, left: 64 };

type Point = { t: number; value: number };
type Series = { goal: Goal; color: string; points: Point[] };

const shortDate = (t: number) => new Date(t).toLocaleDateString("en-US", { month: "short", day: "numeric" });

function niceMax(value: number): number {
  if (value <= 0) return 100_00;
  const magnitude = 10 ** Math.floor(Math.log10(value));
  const step = magnitude / 2;
  return Math.ceil(value / step) * step;
}

export function goalColor(goals: Goal[], goal: Goal): string {
  const index = goals.findIndex((other) => other.id === goal.id);
  return GOAL_COLORS[index] ?? OVERFLOW_COLOR;
}

function seriesFor(goal: Goal, allocations: GoalAllocation[], now: number): Point[] {
  const start = timeOf(goal.createdAt);
  const end = goal.status === GoalStatus.COMPLETED && goal.completedAt ? timeOf(goal.completedAt) : now;
  const points: Point[] = [{ t: start, value: 0 }];
  let running = 0;
  for (const allocation of allocations
    .filter((a) => a.goalId === goal.id)
    .sort((a, b) => timeOf(a.createdAt) - timeOf(b.createdAt))) {
    running += allocation.amount;
    points.push({ t: Math.max(start, timeOf(allocation.createdAt)), value: running });
  }
  points.push({ t: Math.max(end, points.at(-1)!.t), value: running });
  return points;
}

const valueAt = (points: Point[], t: number) => points.filter((p) => p.t <= t).at(-1)?.value ?? null;

export default function GoalProgressChart({
  goals,
  shown,
  allocations,
}: {
  goals: Goal[];
  shown: Goal[];
  allocations: GoalAllocation[];
}) {
  const titleId = useId();
  const [measure, width] = useWidth(459);
  const [hoverT, setHoverT] = useState<number | null>(null);
  const [now] = useState(() => Date.now());

  const series: Series[] = shown.map((goal) => ({
    goal,
    color: goal.status === GoalStatus.COMPLETED ? GOAL_COLORS[0]! : goalColor(goals, goal),
    points: seriesFor(goal, allocations, now),
  }));
  if (series.length === 0) return <p className="entry-meta">No goals to chart yet.</p>;

  const single = series.length === 1 ? series[0]! : null;
  const target = single?.goal.targetAmount;
  const values = series.flatMap((s) => s.points.map((p) => p.value));
  const yMax = niceMax(Math.max(...values, target ?? 0));
  const yMin = Math.min(0, ...values);
  const tMin = Math.min(...series.map((s) => s.points[0]!.t));
  const tMax = Math.max(tMin + 86_400_000, ...series.map((s) => s.points.at(-1)!.t));

  const plotW = width - PAD.left - PAD.right;
  const plotH = HEIGHT - PAD.top - PAD.bottom;
  const x = (t: number) => PAD.left + ((t - tMin) / (tMax - tMin)) * plotW;
  const y = (value: number) => PAD.top + plotH - ((value - yMin) / (yMax - yMin)) * plotH;
  const ticks = [0, 0.5, 1].map((f) => yMin + f * (yMax - yMin));

  const stepPath = (points: Point[]) =>
    points.map((p, i) => (i === 0 ? `M${x(p.t)},${y(p.value)}` : `H${x(p.t)} V${y(p.value)}`)).join(" ");

  function track(clientX: number, rect: DOMRect) {
    const px = ((clientX - rect.left) / rect.width) * width;
    const t = tMin + ((px - PAD.left) / plotW) * (tMax - tMin);
    setHoverT(Math.min(tMax, Math.max(tMin, t)));
  }

  return (
    <div className="flex flex-col gap-3">
      {series.length > 1 ? (
        <ul className="entry-meta flex flex-wrap gap-x-5 gap-y-1" aria-hidden>
          {series.map((s) => (
            <li key={s.goal.id} className="flex items-center gap-1.5">
              <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
              {s.goal.name}
            </li>
          ))}
        </ul>
      ) : null}

      <div ref={measure} className="relative">
        <svg
          viewBox={`0 0 ${width} ${HEIGHT}`}
          role="img"
          aria-labelledby={titleId}
          className="w-full touch-pan-y"
          onPointerMove={(event) => track(event.clientX, event.currentTarget.getBoundingClientRect())}
          onPointerLeave={() => setHoverT(null)}
        >
          <title id={titleId}>{single ? `${single.goal.name}: money saved over time` : "Money saved in each goal over time"}</title>
          {ticks.map((t) => (
            <g key={t}>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(t)} y2={y(t)} stroke="var(--rule)" strokeWidth={1} />
              <text x={PAD.left - 8} y={y(t)} dy="0.32em" textAnchor="end" className="figure" fill="var(--ink-muted)" fontSize={10}>
                {money(t)}
              </text>
            </g>
          ))}
          {target ? (
            <g>
              <line x1={PAD.left} x2={width - PAD.right} y1={y(target)} y2={y(target)} stroke="var(--ink)" strokeWidth={1} strokeDasharray="4 4" />
              <text x={width - PAD.right} y={y(target) - 6} textAnchor="end" fill="var(--ink-muted)" fontSize={10}>
                target {money(target)}
              </text>
            </g>
          ) : null}
          <line x1={PAD.left} x2={width - PAD.right} y1={y(0)} y2={y(0)} stroke="var(--ink)" strokeWidth={1} />
          {series.map((s) => (
            <path key={s.goal.id} d={stepPath(s.points)} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" />
          ))}
          {hoverT !== null ? (
            <g>
              <line x1={x(hoverT)} x2={x(hoverT)} y1={PAD.top} y2={PAD.top + plotH} stroke="var(--ink-muted)" strokeWidth={1} />
              {series.map((s) => {
                const value = valueAt(s.points, hoverT);
                return value === null ? null : (
                  <circle key={s.goal.id} cx={x(hoverT)} cy={y(value)} r={4} fill={s.color} stroke="var(--paper)" strokeWidth={2} />
                );
              })}
            </g>
          ) : null}
          <text x={PAD.left} y={HEIGHT - 8} fill="var(--ink-muted)" fontSize={11}>
            {shortDate(tMin)}
          </text>
          <text x={width - PAD.right} y={HEIGHT - 8} textAnchor="end" fill="var(--ink-muted)" fontSize={11}>
            {tMax >= now - 60_000 ? "today" : shortDate(tMax)}
          </text>
        </svg>

        {hoverT !== null ? (
          <div
            className="pointer-events-none absolute top-0 border border-rule bg-paper px-3 py-2 text-[var(--text-meta)]"
            style={{
              left: `${(x(hoverT) / width) * 100}%`,
              transform: x(hoverT) > width / 2 ? "translateX(calc(-100% - 8px))" : "translateX(8px)",
            }}
          >
            <div className="entry-meta mb-1">{shortDate(hoverT)}</div>
            {series.map((s) => {
              const value = valueAt(s.points, hoverT);
              return value === null ? null : (
                <div key={s.goal.id} className="flex justify-between gap-4 whitespace-nowrap">
                  <span className="flex items-center gap-1.5">
                    <span className="inline-block h-0.5 w-3" style={{ background: s.color }} />
                    {s.goal.name}
                  </span>
                  <span className="figure">{money(value)}</span>
                </div>
              );
            })}
          </div>
        ) : null}
      </div>
    </div>
  );
}
