import { env } from "./env";

export type Headline = {
  title: string;
  source: string;
  url: string;
  publishedAt: string;
};

type NewsApiResponse = {
  articles?: Array<{
    title: string;
    url: string;
    publishedAt: string;
    source: { name: string };
  }>;
};

export async function getTopHeadlines(limit = 8): Promise<Headline[]> {
  const url = new URL("https://newsapi.org/v2/top-headlines");
  url.searchParams.set("country", "us");
  url.searchParams.set("pageSize", String(limit));
  url.searchParams.set("apiKey", env("NEWS_API_KEY"));

  const res = await fetch(url, { next: { revalidate: 300 } });
  if (!res.ok) {
    throw new Error(`NewsAPI ${res.status}: ${await res.text()}`);
  }

  const data = (await res.json()) as NewsApiResponse;
  return (data.articles ?? []).map((article) => ({
    // NewsAPI appends " - Publisher" to most headlines; drop it, we show the source separately.
    title: article.title.replace(/\s+-\s+[^-]+$/, ""),
    source: article.source.name,
    url: article.url,
    publishedAt: article.publishedAt,
  }));
}
