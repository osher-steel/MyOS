"use client";

import { LabelSource, labelSourceOf, PlaidTransactionStatus, type Budget, type LineEntry, type LineEntryView } from "@myos/shared";
import Image from "next/image";
import Link from "next/link";
import { useEffect, useRef, type ReactNode } from "react";
import { day, money } from "@/lib/format";
import { LabelPicker } from "./LabelPicker";
import { TagEditor } from "./TagEditor";
import type { TagVocabulary } from "./useTags";

export type CardEntry = LineEntryView & Partial<Pick<LineEntry, "createdAt" | "updatedAt">>;

const STATUS_LABELS: Record<PlaidTransactionStatus, string> = {
  [PlaidTransactionStatus.POSTED]: "Posted",
  [PlaidTransactionStatus.PENDING]: "Pending",
  [PlaidTransactionStatus.REMOVED]: "Removed by the bank",
};

const humanize = (code: string) => code.toLowerCase().replace(/_/g, " ").replace(/^\w/, (c) => c.toUpperCase());

function stamp(value: unknown): string | null {
  if (typeof value !== "string") return null;
  return new Date(value).toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", minute: "2-digit" });
}

function Row({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="grid grid-cols-[6.5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[8.5rem_minmax(0,1fr)] border-b border-rule py-2.5 last:border-b-0">
      <dt className="entry-meta uppercase tracking-[0.18em] pt-0.5">{label}</dt>
      <dd className="min-w-0 break-words">{children}</dd>
    </div>
  );
}

function Group({ label, children }: { label: string; children: ReactNode }) {
  return (
    <section>
      <h3 className="section-label">{label}</h3>
      <dl>{children}</dl>
    </section>
  );
}

export default function TransactionCard({
  entry,
  budget,
  vocabulary,
  onClose,
  onLabel,
  onTags,
}: {
  entry: CardEntry;
  budget: Budget | null;
  vocabulary: TagVocabulary;
  onClose: () => void;
  onLabel: (entry: LineEntryView, label: string) => void;
  onTags: (entry: LineEntryView, tags: string[]) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    dialog.current?.showModal();
  }, []);

  const inflow = entry.amount < 0;
  const source = labelSourceOf(entry);
  const place = [entry.city, entry.region].filter(Boolean).join(", ");
  const charge = entry.originalDescription ?? entry.name;

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      onClick={(event) => {
        if (event.target === event.currentTarget) dialog.current?.close();
      }}
      aria-labelledby="transaction-card-title"
      className="m-auto max-h-[calc(100dvh-4rem)] w-[min(40rem,calc(100vw-2rem))] overflow-y-auto border border-rule bg-paper p-0 text-ink backdrop:bg-black/60"
    >
      <div className="flex flex-col gap-8 p-5 sm:p-8">
        <header className="flex items-start gap-4">
          {entry.logoUrl ? (
            <Image src={entry.logoUrl} alt="" width={44} height={44} className="shrink-0 rounded-sm" />
          ) : null}
          <div className="min-w-0 flex-1">
            <p className="entry-meta uppercase tracking-[0.18em]">
              {day(entry.date)} · {STATUS_LABELS[entry.plaidStatus]}
            </p>
            <h2 id="transaction-card-title" className="entry-title mt-1 text-[length:var(--text-month)] leading-tight">
              {entry.merchantName ?? entry.name}
            </h2>
          </div>
          <button type="button" className="entry-meta shrink-0 hover:text-accent" onClick={() => dialog.current?.close()}>
            close ×
          </button>
        </header>

        <div className="flex items-end justify-between gap-4 border-y border-rule py-5">
          <span className={`font-display text-[length:var(--text-figure)] leading-none ${inflow ? "text-positive" : ""}`}>
            {inflow ? "+" : ""}
            {money(Math.abs(entry.amount), { currency: entry.currency, cents: true })}
          </span>
          <span className="entry-meta">{inflow ? "money in" : "money out"} · {entry.currency}</span>
        </div>

        <Group label="Labelling">
          <Row label="Label">
            {entry.goalId ? (
              "Paid from a goal"
            ) : budget || inflow ? (
              <LabelPicker entry={entry} budget={budget} onLabel={onLabel} />
            ) : (
              (entry.label ?? "Unlabelled")
            )}
          </Row>
          {source ? (
            <Row label="Labelled by">
              {source === LabelSource.RULE ? (
                <>
                  a rule{" "}
                  <Link href="/settings" className="entry-link">
                    view rules →
                  </Link>
                  {entry.ruleId ? <span className="entry-meta block truncate">{entry.ruleId}</span> : null}
                </>
              ) : (
                "you"
              )}
            </Row>
          ) : null}
          <Row label="Tags">
            <TagEditor entry={entry} vocabulary={vocabulary} onTags={onTags} />
            {entry.tags?.length && entry.tagSource === LabelSource.RULE ? (
              <span className="entry-meta block">added by rules · editing makes them yours</span>
            ) : null}
          </Row>
        </Group>

        <Group label="Merchant">
          {entry.merchantName ? <Row label="Name">{entry.merchantName}</Row> : null}
          {entry.website ? (
            <Row label="Website">
              <a className="entry-link" href={`https://${entry.website.replace(/^https?:\/\//, "")}`} target="_blank" rel="noreferrer">
                {entry.website}
              </a>
            </Row>
          ) : null}
          {place ? <Row label="Location">{place}</Row> : null}
          {entry.counterparties?.length ? (
            <Row label="Counterparties">
              {entry.counterparties.map((party) => (
                <span key={`${party.name}-${party.type}`} className="block">
                  {party.name} <span className="entry-meta">· {humanize(party.type)}</span>
                </span>
              ))}
            </Row>
          ) : null}
          <Row label="Bank text">
            <span className="figure text-[length:var(--text-small)]">{charge}</span>
          </Row>
        </Group>

        <Group label="Plaid">
          {entry.categoryPrimary ? (
            <Row label="Category">
              {humanize(entry.categoryPrimary)}
              {entry.categoryDetailed ? (
                <span className="entry-meta block">{humanize(entry.categoryDetailed.replace(`${entry.categoryPrimary}_`, ""))}</span>
              ) : null}
            </Row>
          ) : null}
          {entry.categoryConfidence ? <Row label="Confidence">{humanize(entry.categoryConfidence)}</Row> : null}
          {entry.paymentChannel ? <Row label="Channel">{humanize(entry.paymentChannel)}</Row> : null}
          {entry.authorizedDate && entry.authorizedDate !== entry.date ? <Row label="Authorized">{day(entry.authorizedDate)}</Row> : null}
          <Row label="Posted">{day(entry.date)}</Row>
        </Group>

        <Group label="Record">
          <Row label="Transaction">
            <span className="figure text-[length:var(--text-small)]">{entry.id}</span>
          </Row>
          {entry.pendingTransactionId ? (
            <Row label="Was pending as">
              <span className="figure text-[length:var(--text-small)]">{entry.pendingTransactionId}</span>
            </Row>
          ) : null}
          {entry.accountId ? (
            <Row label="Account">
              <span className="figure text-[length:var(--text-small)]">{entry.accountId}</span>
            </Row>
          ) : null}
          {stamp(entry.createdAt) ? <Row label="First synced">{stamp(entry.createdAt)}</Row> : null}
          {stamp(entry.updatedAt) ? <Row label="Last updated">{stamp(entry.updatedAt)}</Row> : null}
        </Group>
      </div>
    </dialog>
  );
}
