const KNOWN_SOURCES: Record<string, string> = {
  "theguardian.com": "The Guardian",
  "cryptobriefing.com": "Crypto Briefing",
  "economictimes.indiatimes.com": "Economic Times",
  "aljazeera.com": "Al Jazeera",
  "reuters.com": "Reuters",
  "bbc.com": "BBC",
  "cnn.com": "CNN",
  "forbes.com": "Forbes",
  "npr.org": "NPR",
  "cnbc.com": "CNBC",
  "cointelegraph.com": "Cointelegraph",
};

const SUBDOMAIN_PREFIXES = ["www", "m", "amp", "news", "edition", "feeds", "rss", "en"];

/** Convert a raw domain (e.g. "www.some-blog.com") into a readable publisher name. */
export function formatSourceName(domain?: string | null): string {
  if (!domain) return "Unknown source";
  const raw = String(domain).trim().toLowerCase();
  if (!raw || raw === "unknown") return "Unknown source";

  // Strip protocol / path if a full URL slipped through.
  const host = raw.replace(/^https?:\/\//, "").split("/")[0]!.replace(/:\d+$/, "");
  if (KNOWN_SOURCES[host]) return KNOWN_SOURCES[host]!;

  const stripped = host.replace(/^(?:www|m|amp|news|edition|feeds|rss|en)\./, "");
  if (KNOWN_SOURCES[stripped]) return KNOWN_SOURCES[stripped]!;

  const parts = stripped.split(".").filter(Boolean);
  // Drop TLD (and second-level TLDs like co.uk).
  let labels = parts;
  if (labels.length > 1) {
    const last = labels[labels.length - 1]!;
    const secondLast = labels[labels.length - 2]!;
    const dropCount = labels.length > 2 && ["co", "com", "org", "net", "gov", "ac"].includes(secondLast) && last.length === 2 ? 2 : 1;
    labels = labels.slice(0, labels.length - dropCount);
  }
  labels = labels.filter((l) => !SUBDOMAIN_PREFIXES.includes(l));
  const base = labels.join(" ") || stripped;

  return base
    .split(/[-_.\s]+/)
    .filter(Boolean)
    .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
    .join(" ") || "Unknown source";
}
