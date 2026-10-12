/**
 * Non-persistent, per-request Intelligence signal classification.
 * Inputs are first-party publisher release titles + ORIGINAL publication dates.
 * Nothing in this module verifies same-event corroboration or assigns scores.
 * Raw titles, URLs and provider IDs never appear in the return schema.
 */
import { WEBSITE_RELEASE_DELAY_MS } from "./website-publication-delay";

export type StatelessCategory = "geopolitics" | "macro" | "rare_earth";

export type StatelessSourceSpec = {
  id: string;
  category: StatelessCategory;
  media: "rss" | "atom";
  url: string;
  allowedHosts: readonly string[];
  credit: string | null;
  govContentApi?: boolean;
};

export type StatelessSourceCandidate = {
  title: string;
  articleUrl: string;
  publishedAt: string;
  sourceId: string;
  category: StatelessCategory;
  credit: string | null;
};

export type StatelessIntelligenceSignal = {
  id: string;
  category: StatelessCategory;
  title: string;
  why_it_matters: string;
  topic: string;
  published_at: string;
  observed_release_count: number;
  sources_credited: string[];
  status: "official_release_observed_unscored";
  same_event_corrob_verified: false;
  severity: null;
};

const HOUR = 60 * 60_000;
const DAY = 24 * HOUR;
export const STATELESS_WEBSITE_DELAY_MS = WEBSITE_RELEASE_DELAY_MS;
export const STATELESS_LOOKBACK_MS = 7 * DAY;

const TOPICS: Record<StatelessCategory, readonly { test: RegExp; name: string; implication: string }[]> = {
  geopolitics: [
    { test: /\b(sanctions?|embargo|asset freeze|trade restriction)\b/i, name: "sanctions and trade restrictions",
      implication: "Official sanctions-related developments can affect settlement, trade routing and cross-border exposure. The direction and enforceability of any change still need case-specific review." },
    { test: /\b(ceasefire|peace talks?|peace agreement|peacekeeping|security council)\b/i, name: "security and diplomacy",
      implication: "Security and diplomatic developments may change country or corridor operating assumptions; this release alone does not establish a change in conflict risk." },
    { test: /\b(border|conflict|attack|war|military|disarmament|humanitarian)\b/i, name: "geopolitical security",
      implication: "Potential implications include logistics access, operational continuity and regional exposure. Independent event confirmation remains necessary." },
    { test: /\b(visa|foreign secretary|foreign policy|diplomacy|treaty)\b/i, name: "foreign policy",
      implication: "Policy statements can change jurisdictional or diplomatic context, but implementation and effects require separate corroboration." },
  ],
  macro: [
    { test: /\b(interest rates?|federal funds|discount rate|monetary policy|FOMC)\b/i, name: "monetary policy",
      implication: "A monetary-policy release can influence financing conditions and FX expectations; no specific rate direction or market outcome is inferred from this signal." },
    { test: /\b(inflation|consumer prices?|producer prices?|price index|cost of living)\b/i, name: "inflation and prices",
      implication: "Price developments can affect purchasing power, central-bank decisions and currency-risk context; verify the actual published figures before quantifying impact." },
    { test: /\b(foreign exchange|currency|exchange rate|balance of payments)\b/i, name: "FX and external balances",
      implication: "External-balance releases can affect currency-liquidity and cross-border settlement considerations; this does not indicate a directional FX prediction." },
    { test: /\b(liquidity|financial stability|bank supervision|banking regulation|economic growth|GDP)\b/i, name: "financial conditions",
      implication: "Financial-system developments may matter for credit access and counterparty exposure; a score requires separately verified measurements." },
  ],
  rare_earth: [
    { test: /\b(rare[- ]earths?|neodymium|dysprosium|terbium)\b/i, name: "rare-earth supply",
      implication: "Rare-earth project and policy releases may affect processing concentration and strategic industrial supply dependencies; actual capacity changes are not assumed." },
    { test: /\b(lithium|cobalt|nickel|graphite|gallium|germanium|copper|tungsten)\b/i, name: "critical-mineral inputs",
      implication: "Mineral supply developments can matter for battery, electronics and industrial sourcing; project feasibility and production impacts need independent evidence." },
    { test: /\b(critical minerals?|critical raw materials?|strategic minerals?|mineral processing|mineral supply)\b/i, name: "critical-minerals policy",
      implication: "Government actions on critical minerals may alter supply-chain diversification and strategic access; this is not a verified disruption or price forecast." },
    { test: /\b(mineral deposits?|mining projects?|mineral production|rare earth elements?)\b/i, name: "mineral exploration and production",
      implication: "Extractive-sector updates can affect long-run supply expectations, but an announcement is not proof of operating capacity or delivered output." },
  ],
};

function tagValue(chunk: string, tag: string): string | null {
  const match = new RegExp("<(?:atom:)?"+tag+"(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:atom:)?"+tag+">", "iu").exec(chunk);
  return match?.[1]?.trim() ?? null;
}

function unescapeXml(raw: string): string {
  return raw.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu, "$1")
    .replace(/&(?:amp|quot|apos|lt|gt);/giu, (m) =>
      ({ "&amp;":"&", "&quot;":'"', "&apos;":"'", "&lt;":"<", "&gt;":">" })[m.toLowerCase()] ?? m)
    .replace(/&#(?:x([0-9a-f]{1,5})|([0-9]{1,7}));/giu, (_, h: string|undefined, d: string|undefined) => {
      const point = Number.parseInt(h ?? d ?? "", h ? 16 : 10);
      return point >= 32 && point <= 0x10ffff && !(point >= 0xd800 && point <= 0xdfff)
        ? String.fromCodePoint(point) : "";
    })
    .replace(/\s+/gu, " ").trim();
}

export function originalPublicationMs(value: string | null, now = Date.now()): number | null {
  if (!value || value.length > 100 ||
      !/(?:Z|[+-]\d\d:?\d\d|GMT|UTC)$/i.test(value.trim())) return null;
  const ts = Date.parse(value);
  return Number.isFinite(ts) && ts <= now && ts >= now - STATELESS_LOOKBACK_MS ? ts : null;
}

export function acceptedOriginalArticleLink(raw: string | null, source: StatelessSourceSpec): string | null {
  if (!raw || raw.length > 1600) return null;
  try {
    const link = new URL(unescapeXml(raw));
    if (link.protocol !== "https:" || link.username || link.password || link.port ||
        link.hash || !source.allowedHosts.includes(link.hostname.toLowerCase()) ||
        link.pathname.length < 12 || link.pathname.startsWith("//")) return null;
    if (source.govContentApi &&
        !/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u.test(link.pathname)) return null;
    if (source.id === "fed_press" && !/^\/newsevents\/pressreleases\//u.test(link.pathname)) return null;
    if (source.id === "usgs_minerals" && !/^\/news\//u.test(link.pathname)) return null;
    if (source.id === "un_news" && !/^\/en\/story\/\d{4}\/\d{1,2}\//u.test(link.pathname)) return null;
    link.search = "";
    return link.href;
  } catch { return null; }
}

function entryLink(chunk: string, source: StatelessSourceSpec): string | null {
  if (source.media === "rss") return unescapeXml(tagValue(chunk, "link") ?? "");
  for (const match of chunk.matchAll(/<(?:atom:)?link\b([^>]*?)\/?\s*>/giu)) {
    const attrs = match[1];
    const rel = /\brel\s*=\s*["']([^"']+)["']/iu.exec(attrs)?.[1] ?? "alternate";
    if (rel !== "alternate" && rel !== "canonical") continue;
    const href = /\bhref\s*=\s*["']([^"']+)["']/iu.exec(attrs)?.[1];
    if (href) return unescapeXml(href);
  }
  return null;
}

export function selectOfficialTopic(title: string, category: StatelessCategory) {
  return TOPICS[category].find(rule => rule.test.test(title)) ?? null;
}

export function parseFirstPartyFeed(xml: string, source: StatelessSourceSpec, now = Date.now()): {
  dated: StatelessSourceCandidate[];
  undatedGov: { title: string; articleUrl: string }[];
} {
  if (typeof xml !== "string" || xml.length > 192 * 1024 ||
      /<!DOCTYPE|<!ENTITY/iu.test(xml)) return { dated: [], undatedGov: [] };
  if (source.media === "rss" && !/<rss(?:\s|>)/iu.test(xml)) return { dated: [], undatedGov: [] };
  if (source.media === "atom" && !/<(?:atom:)?feed(?:\s|>)/iu.test(xml)) return { dated: [], undatedGov: [] };
  const entryPattern = source.media === "rss"
    ? /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu
    : /<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu;
  const dated: StatelessSourceCandidate[] = [];
  const undatedGov: { title: string; articleUrl: string }[] = [];
  const seen = new Set<string>();
  for (const match of [...xml.matchAll(entryPattern)].slice(0, 30)) {
    const item = match[1];
    const title = unescapeXml(tagValue(item, "title") ?? "");
    if (title.length < 12 || title.length > 300 || /[<>]/u.test(title) ||
        !selectOfficialTopic(title, source.category)) continue;
    const articleUrl = acceptedOriginalArticleLink(entryLink(item, source), source);
    if (!articleUrl || seen.has(articleUrl)) continue;
    seen.add(articleUrl);
    const rawClock = tagValue(item, source.media === "rss" ? "pubDate" : "published");
    const ms = originalPublicationMs(rawClock, now);
    if (ms !== null) {
      dated.push({
        sourceId: source.id, category: source.category, title,
        articleUrl, publishedAt: new Date(ms).toISOString(), credit: source.credit,
      });
    } else if (!rawClock && source.govContentApi && undatedGov.length < 2) {
      // Atom "updated" is never substituted for the original publication.
      undatedGov.push({ title, articleUrl });
    }
  }
  return { dated, undatedGov };
}

export function deriveStatelessSignals(
  candidates: readonly StatelessSourceCandidate[],
  now = Date.now(),
): StatelessIntelligenceSignal[] {
  const cutoff = now - STATELESS_WEBSITE_DELAY_MS;
  const grouped = new Map<string, {
    topic: NonNullable<ReturnType<typeof selectOfficialTopic>>;
    newest: number; count: number; category: StatelessCategory;
    credits: Set<string>;
  }>();
  const unique = new Set<string>();
  for (const item of candidates) {
    const native = originalPublicationMs(item.publishedAt, now);
    if (native === null || native > cutoff) continue;
    let validated: URL;
    try { validated = new URL(item.articleUrl); } catch { continue; }
    if (validated.protocol !== "https:" || validated.username || validated.password ||
        validated.port || validated.hash || !validated.hostname) continue;
    const topic = selectOfficialTopic(item.title, item.category);
    if (!topic) continue;
    const fingerprint = item.sourceId + "|" + item.articleUrl;
    if (unique.has(fingerprint)) continue;
    unique.add(fingerprint);
    // Same topic/day is an activity aggregate, NOT a corroborated same event.
    const day = new Date(native).toISOString().slice(0, 10);
    const key = item.category + "|" + topic.name + "|" + day;
    const group = grouped.get(key) ?? {
      topic, newest: native, count: 0, category: item.category, credits: new Set<string>(),
    };
    group.count++;
    group.newest = Math.max(group.newest, native);
    if (item.credit) group.credits.add(item.credit);
    grouped.set(key, group);
  }
  return [...grouped.entries()]
    .map(([key, group]) => ({
      id: key.replace(/[^a-z0-9]+/gi, "-").slice(0, 100).toLowerCase(),
      category: group.category,
      title: "Geomacro observes official activity involving " + group.topic.name,
      why_it_matters: group.topic.implication,
      topic: group.topic.name,
      published_at: new Date(group.newest).toISOString(),
      observed_release_count: group.count,
      sources_credited: [...group.credits].sort(),
      status: "official_release_observed_unscored" as const,
      same_event_corrob_verified: false as const,
      severity: null,
    }))
    .sort((a, b) => b.published_at.localeCompare(a.published_at))
    .slice(0, 12);
}
