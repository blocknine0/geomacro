import Firecrawl from "@mendable/firecrawl-js";

export type NewsHit = {
  title: string;
  url: string;
  snippet: string;
};

function getClient() {
  const apiKey = process.env.FIRECRAWL_API_KEY;
  if (!apiKey) throw new Error("FIRECRAWL_API_KEY not configured");
  return new Firecrawl({ apiKey });
}

/** Live search news for a topic in the last 24h. Returns compact hits. */
export async function searchNews(topic: string, limit = 5): Promise<NewsHit[]> {
  const fc = getClient();
  const query = `${topic} latest news`;
  type Raw = {
    web?: Array<{ title?: string; url?: string; description?: string }>;
    data?: Array<{ title?: string; url?: string; description?: string }>;
  };
  // Try past 24h first; if nothing, widen to past week, then past month.
  let raw: NonNullable<Raw["web"]> = [];
  for (const tbs of ["qdr:d", "qdr:w", "qdr:m"] as const) {
    const res = (await fc.search(query, { limit, tbs })) as unknown as Raw;
    raw = res.web ?? res.data ?? [];
    if (raw.length > 0) break;
  }
  return raw
    .filter((r) => r.url && r.title)
    .slice(0, limit)
    .map((r) => ({
      title: String(r.title ?? "").slice(0, 200),
      url: String(r.url ?? ""),
      snippet: String(r.description ?? "").slice(0, 400),
    }));
}