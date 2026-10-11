"use client";

import { SubscriptionStatus, type Subscription, type SubscriptionsSummary } from "@myos/shared";
import { useEffect, useState } from "react";
import { Section, SourceError } from "@/components/editorial";
import { day, money } from "@/lib/format";
import { unwrap } from "@/lib/proxyClient";

const STATUS_NOTES: Record<SubscriptionStatus, string | null> = {
  [SubscriptionStatus.NEW]: "new",
  [SubscriptionStatus.CHANGED]: "price changed",
  [SubscriptionStatus.NOT_CHARGED_YET]: "not charged yet this month",
  [SubscriptionStatus.ACTIVE]: null,
  [SubscriptionStatus.LAPSED]: "no charge in two months",
};

const FLAGGED = new Set([SubscriptionStatus.NEW, SubscriptionStatus.CHANGED]);

function Row({ subscription }: { subscription: Subscription }) {
  const note = STATUS_NOTES[subscription.status];
  return (
    <div className="entry flex items-baseline justify-between gap-4">
      <div className="min-w-0">
        <div className="entry-title truncate">{subscription.name}</div>
        <div className="entry-meta">
          last {day(subscription.lastDate)} · {subscription.months} {subscription.months === 1 ? "month" : "months"}
          {subscription.label ? ` · ${subscription.label}` : ""}
          {note ? <span className={FLAGGED.has(subscription.status) ? "text-accent" : undefined}> · {note}</span> : null}
        </div>
      </div>
      <span className="figure shrink-0">
        {subscription.previousAmount !== undefined ? (
          <span className="text-muted line-through mr-2">{money(subscription.previousAmount, { cents: true })}</span>
        ) : null}
        {money(subscription.amount, { cents: true })}
      </span>
    </div>
  );
}

export default function SubscriptionsView() {
  const [summary, setSummary] = useState<SubscriptionsSummary | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let ignore = false;
    fetch("/api/subscriptions")
      .then((res) => unwrap<SubscriptionsSummary>(res))
      .then((data) => {
        if (!ignore) setSummary(data);
      })
      .catch((err: Error) => {
        if (!ignore) setError(err.message);
      });
    return () => {
      ignore = true;
    };
  }, []);

  if (error) return <SourceError message={error} />;
  if (!summary) return <p className="entry-meta">Loading…</p>;

  const running = summary.subscriptions.filter((s) => s.status !== SubscriptionStatus.LAPSED);
  const lapsed = summary.subscriptions.filter((s) => s.status === SubscriptionStatus.LAPSED);
  const flagged = running.filter((s) => FLAGGED.has(s.status)).length;

  return (
    <div className="grid grid-cols-1 gap-x-[var(--gutter)] gap-y-12 md:grid-cols-2">
      <Section label="Running" aside={`${money(summary.monthlyTotal, { cents: true })} a month`}>
        <p className="entry-meta mb-3">
          {running.length} subscriptions · {money(summary.monthlyTotal * 12)} a year
          {flagged > 0 ? ` · ${flagged} new or changed` : ""}
        </p>
        {running.length === 0 ? <p className="entry-meta">None found in the last six months.</p> : null}
        {running.map((subscription) => (
          <Row key={subscription.key} subscription={subscription} />
        ))}
      </Section>
      <Section label="Lapsed" aside={lapsed.length > 0 ? String(lapsed.length) : undefined}>
        <p className="entry-meta mb-3">
          Billed before but not this month or last. Label a charge Subscriptions or tag it #subscription to have it tracked here.
        </p>
        {lapsed.map((subscription) => (
          <Row key={subscription.key} subscription={subscription} />
        ))}
      </Section>
    </div>
  );
}
