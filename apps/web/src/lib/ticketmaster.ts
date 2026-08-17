import { env } from "./env";

export type EventItem = {
  name: string;
  date: string | null;
  time: string | null;
  venue: string;
  segment: string;
  url: string;
};

type TicketmasterResponse = {
  _embedded?: {
    events?: Array<{
      name: string;
      url: string;
      dates: { start: { localDate?: string; localTime?: string } };
      classifications?: Array<{ segment?: { name?: string } }>;
      _embedded?: { venues?: Array<{ name?: string }> };
    }>;
  };
};

export async function getEvents(city = "Miami", limit = 8): Promise<EventItem[]> {
  const url = new URL("https://app.ticketmaster.com/discovery/v2/events.json");
  url.searchParams.set("city", city);
  // Over-fetch: recurring shows return one entry per date and collapse below.
  url.searchParams.set("size", String(limit * 5));
  url.searchParams.set("sort", "date,asc");
  // Without an explicit lower bound the feed includes long-running events that already started.
  url.searchParams.set("startDateTime", `${new Date().toISOString().slice(0, 19)}Z`);
  url.searchParams.set("apikey", env("TICKETMASTER_API_KEY"));

  const res = await fetch(url, { next: { revalidate: 600 } });
  if (!res.ok) {
    throw new Error(`Ticketmaster ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as TicketmasterResponse;
  const seen = new Set<string>();
  return (data._embedded?.events ?? [])
    .filter((event) => {
      // Recurring runs repeat the same name once per date; keep the soonest.
      if (seen.has(event.name)) return false;
      seen.add(event.name);
      return true;
    })
    .slice(0, limit)
    .map((event) => ({
      name: event.name,
      date: event.dates.start.localDate ?? null,
      time: event.dates.start.localTime ?? null,
      venue: event._embedded?.venues?.[0]?.name ?? "Venue TBA",
      segment: event.classifications?.[0]?.segment?.name ?? "Event",
      url: event.url,
    }));
}
