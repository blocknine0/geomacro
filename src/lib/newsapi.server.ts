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

  // Only fetch articles published in the last 48 hours.
  const fromDate = new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString();

  const url = new URL("https://newsapi.org/v2/everything");
  url.searchParams.set("q", query);
  url.searchParams.set("language", "en");
  url.searchParams.set("sortBy", "publishedAt");
  url.searchParams.set("from", fromDate);
  url.searchParams.set("pageSize", String(Math.min(limit * 4, 40)));

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
  const cutoff = Date.now() - 48 * 60 * 60 * 1000;
  return articles
    .filter((a) => {
      if (!a.url || !a.title || a.title === "[Removed]") return false;
      const title = String(a.title).trim();
      // Skip headlines that are just a source/site name (common NewsAPI bug).
      const sourceName = String(a.source?.name ?? "").trim();
      if (sourceName && title.toLowerCase() === sourceName.toLowerCase()) return false;
      // Skip too-short titles or anything that looks like a bare domain/source label.
      if (title.length < 15) return false;
      if (/^[A-Za-z0-9.\-]+\.(com|net|org|io|co|news)$/i.test(title)) return false;
      // Enforce 48h recency client-side too — NewsAPI sometimes ignores `from`.
      const ts = a.publishedAt ? Date.parse(a.publishedAt) : NaN;
      if (!isFinite(ts) || ts < cutoff) return false;
      return true;
    })
    .slice(0, limit)
    .map((a) => ({
      title: String(a.title ?? "").slice(0, 220),
      url: String(a.url ?? ""),
      snippet: String(a.description ?? a.content ?? "").slice(0, 400),
      source: String(a.source?.name ?? "").slice(0, 80),
      publishedAt: String(a.publishedAt ?? new Date().toISOString()),
    }));
}