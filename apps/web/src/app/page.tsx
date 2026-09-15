import { Suspense } from "react";
import { Entry, Section, load } from "@/components/editorial";
import { Masthead } from "@/components/masthead";
import { getAccounts, getTransactions } from "@/lib/plaid";
import { getTopHeadlines } from "@/lib/news";
import { getRecentTracks, getTopArtists } from "@/lib/spotify";
import { getEvents } from "@/lib/ticketmaster";

export const dynamic = "force-dynamic";

const money = (amount: number | null, currency: string) =>
  amount === null
    ? "—"
    : new Intl.NumberFormat("en-US", {
        style: "currency",
        currency,
        maximumFractionDigits: 0,
      }).format(amount);

// "2026-08-12" parses as UTC midnight and renders as the previous day west of
// Greenwich, so date-only values are pinned to local time before formatting.
const day = (value: string) => {
  const date = /^\d{4}-\d{2}-\d{2}$/.test(value)
    ? new Date(`${value}T00:00:00`)
    : new Date(value);
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric" });
};

const clock = (iso: string) =>
  new Date(iso).toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit" });

async function Money() {
  return load(
    async () => ({ accounts: await getAccounts(), transactions: await getTransactions(5) }),
    ({ accounts, transactions }) => {
      const total = accounts
        .filter((a) => ["checking", "savings"].includes(a.type))
        .reduce((sum, a) => sum + (a.current ?? 0), 0);
      return (
        <>
          <Section label="Money" aside={`${money(total, "USD")} liquid`}>
            {accounts.slice(0, 5).map((account) => (
              <Entry
                key={`${account.name}-${account.mask}`}
                title={account.name}
                meta={`${account.type}${account.mask ? ` ···· ${account.mask}` : ""}`}
                figure={money(account.current, account.currency)}
              />
            ))}
          </Section>
          <div className="mt-8">
            <Section label="Recent transactions">
              {transactions.map((tx, i) => (
                <Entry
                  key={`${tx.name}-${i}`}
                  title={tx.name}
                  meta={day(tx.date)}
                  figure={money(tx.amount, tx.currency)}
                />
              ))}
            </Section>
          </div>
        </>
      );
    },
  );
}

async function News() {
  return load(
    () => getTopHeadlines(7),
    (headlines) => (
      <Section label="News" aside="US top headlines">
        {headlines.map((headline) => (
          <Entry
            key={headline.url}
            title={headline.title}
            meta={`${headline.source} · ${day(headline.publishedAt)}`}
            href={headline.url}
          />
        ))}
      </Section>
    ),
  );
}

async function Music() {
  return load(
    async () => ({ recent: await getRecentTracks(6), artists: await getTopArtists(8) }),
    ({ recent, artists }) => (
      <>
        <Section label="Music" aside="Recently played">
          {recent.map((track, i) => (
            <Entry
              key={`${track.title}-${i}`}
              title={track.title}
              meta={track.artists}
              figure={track.playedAt ? clock(track.playedAt) : undefined}
            />
          ))}
        </Section>
        <div className="mt-8">
          <Section label="On rotation" aside="Past 6 months">
            <p className="entry-title leading-relaxed">
              {artists.map((artist) => artist.name).join(" · ")}
            </p>
          </Section>
        </div>
      </>
    ),
  );
}

async function Events() {
  return load(
    () => getEvents("Miami", 7),
    (events) => (
      <Section label="Events" aside="Miami">
        {events.map((event) => (
          <Entry
            key={event.url}
            title={event.name}
            meta={`${event.venue} · ${event.segment}`}
            figure={event.date ? day(event.date) : undefined}
            href={event.url}
          />
        ))}
      </Section>
    ),
  );
}

function Loading({ label }: { label: string }) {
  return (
    <Section label={label}>
      <p className="entry-meta">Loading…</p>
    </Section>
  );
}

export default function Home() {
  return (
    <main className="mx-auto max-w-6xl px-6 py-12 md:py-16">
      <Masthead title="Personal OS" current="home" />

      <div className="grid gap-x-[var(--gutter)] gap-y-12 md:grid-cols-2">
        <div className="flex flex-col gap-12">
          <Suspense fallback={<Loading label="Money" />}>
            <Money />
          </Suspense>
          <Suspense fallback={<Loading label="Music" />}>
            <Music />
          </Suspense>
        </div>
        <div className="flex flex-col gap-12">
          <Suspense fallback={<Loading label="News" />}>
            <News />
          </Suspense>
          <Suspense fallback={<Loading label="Events" />}>
            <Events />
          </Suspense>
        </div>
      </div>

      <footer className="entry-meta mt-16 pt-4 border-t border-rule">
        Plaid · NewsAPI · Spotify · Ticketmaster
      </footer>
    </main>
  );
}
