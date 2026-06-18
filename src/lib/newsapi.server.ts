import process from "node:process";

export type NewsHit = {
  title: string;
  url: string;
  snippet: string;
  source: string;
  publishedAt: string;
};

/**
 * Fetch recent articles from NewsAPI for a topic query.
 * Server-only — requires NEWSAPI_KEY.
 */
export async function fetchNewsApi(query: string, limit = 5): Promise<NewsHit[]> {
  const key = process.env.NEWSAPI_KEY;
  if (!key) throw new Error("NEWSAPI_KEY not configured");

  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("pageSize", String(Math.min(limit * 2, 20)));

  const res = await fetch(url.toString(), {
    headers: { "X-Api-Key": key },
  });
  if (!res.ok) {
    throw new Error(`NewsAPI ${res.status}: ${await res.text().catch(() => "")}`);
  }
  const body = (await res.json()) as {
    status: string;
    articles?: Array<{
      title?: string;
      url?: string;
      description?: string;
      content?: string;
      publishedAt?: string;
      source?: { name?: string };
    }>;
  };
  const articles = body.articles ?? [];
  return articles
    .filter((a) => a.url && a.title && a.title !== "[Removed]")
    .slice(0, limit)
    .map((a) => ({
      title: String(a.title ?? "").slice(0, 220),
      url: String(a.url ?? ""),
      snippet: String(a.description ?? a.content ?? "").slice(0, 400),
      source: String(a.source?.name ?? "").slice(0, 80),
      publishedAt: String(a.publishedAt ?? new Date().toISOString()),
    }));
}