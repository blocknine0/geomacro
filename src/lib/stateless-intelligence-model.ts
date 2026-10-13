/**
 * Non-persistent, per-request Intelligence signal classification.
 * Inputs are first-party publisher release titles + ORIGINAL publication dates.
 * Nothing in this module verifies same-event corroboration or assigns scores.
 * Raw titles, URLs and provider IDs never appear in the return schema.
 */
export type StatelessCategory = "geopolitics" | "macro" | "rare_earth";

export type StatelessSourceSpec = {
  id: string;
  category: StatelessCategory;
  media: "rss" | "atom" | "html_index";
  url: string;
  allowedHosts: readonly string[];
  credit: string | null;
  govContentApi?: boolean;
  canadaOriginalPage?: boolean;
};

export type StatelessSourceCandidate = {
  title: string;
  articleUrl: string;
  publishedAt: string;
  datePrecision?: "day";
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
  what_changed: string;
  geography: string | null;
  development_type: string;
  published_at: string;
  date_precision: "exact" | "day";
  observed_release_count: 1;
  sources_credited: string[];
  status: "official_release_observed_unscored";
  same_event_corrob_verified: false;
  severity: null;
};

const DAY = 24 * 60 * 60_000;
export const STATELESS_WEBSITE_DELAY_MS = 15 * 60_000;
export const STATELESS_LOOKBACK_MS = 30 * DAY;

const TOPICS: Record<StatelessCategory, readonly { test: RegExp; name: string; implication: string }[]> = {
  geopolitics: [
    { test: /\b(sanctions?|embargo|asset freeze|trade restriction)\b/i, name: "sanctions and trade restrictions",
      implication: "Official sanctions-related developments can affect settlement, trade routing and cross-border exposure. The direction and enforceability of any change still need case-specific review." },
    { test: /\b(ceasefire|peace talks?|peace agreement|peacekeeping|security council)\b/i, name: "security and diplomacy",
      implication: "Security and diplomatic developments may change country or corridor operating assumptions; this release alone does not establish a change in conflict risk." },
    { test: /\b(border|conflict|attack|war|military|disarmament|humanitarian)\b/i, name: "geopolitical security",
      implication: "Potential implications include logistics access, operational continuity and regional exposure. Independent event confirmation remains necessary." },
    { test: /\b(visa|foreign secretary|foreign policy|diplomacy|treaty|foreign minister|iran|ukraine|international sanctions|state threats|national security|cyber-attack|hybrid attacks)\b/i, name: "foreign policy",
      implication: "Policy statements can change jurisdictional or diplomatic context, but implementation and effects require separate corroboration." },
  ],
  macro: [
    { test: /\b(Basel III|Basel Committee|banking supervisors?|capital adequacy|bank capital requirements?|banking supervision)\b/i,
      name: "banking and capital regulation",
      implication: "Official prudential rulemaking can affect bank funding and cross-border credit conditions; any implemented capital requirements or market effects must be verified separately." },
    { test: /\b(gross domestic product|economic accounts|national accounts|retail trade|retail sales|employment|labour force survey|labor force survey|wages?|average weekly earnings|business conditions)\b/i, name: "official economic statistics",
      implication: "Official economic and labour statistics can inform macroeconomic demand, income and currency-risk context. Data values and period-specific direction require the underlying published table." },
    { test: /\b(interest rates?|federal funds|discount rate|monetary policy|FOMC)\b/i, name: "monetary policy",
      implication: "A monetary-policy release can influence financing conditions and FX expectations; no specific rate direction or market outcome is inferred from this signal." },
    { test: /\b(inflation|consumer prices?|producer prices?|price index|cost of living)\b/i, name: "inflation and prices",
      implication: "Price developments can affect purchasing power, central-bank decisions and currency-risk context; verify the actual published figures before quantifying impact." },
    { test: /\b(foreign exchange|currency|exchange rate|balance of payments)\b/i, name: "FX and external balances",
      implication: "External-balance releases can affect currency-liquidity and cross-border settlement considerations; this does not indicate a directional FX prediction." },
    { test: /\b(liquidity|financial stability|bank supervision|banking regulation|economic growth|GDP|economic bulletin|bank lending|banking statistics|financial accounts|financial markets|unemployment|labour market|credit conditions|household debt|economic outlook)\b/i, name: "financial conditions",
      implication: "Financial-system developments may matter for credit access and counterparty exposure; a score requires separately verified measurements." },
    { test: /\b(trade mission|free trade|trade deal|trade agreement|trade negotiations|bilateral trade|international (?:merchandise )?trade|imports? and exports?|export growth|commercial deals|economic partnership|JETCO|tariffs|foreign investment)\b/i, name: "trade and economic relations",
      implication: "Trade and investment agreements can affect market access, cross-border commercial flows and currency exposure; their actual economic impact requires follow-up evidence." },
  ],
  rare_earth: [
    { test: /\b(rare[- ]earths?|neodymium|dysprosium|terbium)\b/i, name: "rare-earth supply",
      implication: "Rare-earth project and policy releases may affect processing concentration and strategic industrial supply dependencies; actual capacity changes are not assumed." },
    { test: /\b(lithium|cobalt|nickel|graphite|gallium|germanium|copper|tungsten|antimony|scandium|cesium|caesium|chromite|fluorspar)\b/i, name: "critical-mineral inputs",
      implication: "Mineral supply developments can matter for battery, electronics and industrial sourcing; project feasibility and production impacts need independent evidence." },
    { test: /\b(critical minerals?|critical raw materials?|strategic minerals?|mineral processing|mineral supply|strategic raw materials?|mineral supply chain)\b/i, name: "critical-minerals policy",
      implication: "Government actions on critical minerals may alter supply-chain diversification and strategic access; this is not a verified disruption or price forecast." },
    { test: /\b(mineral deposits?|mining projects?|mineral production|rare earth elements?|mineral resources?|mining|mineral research|mineral exploration|mineral and groundwater insights|geology of|mineral mapping|raw material supply)\b/i, name: "mineral exploration and production",
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
  if (!value || value.length > 256) return null;
  // Federal Reserve RSS and other fixed originals wrap native pubDate in
  // precisely one CDATA section. Never use channel updated/build timestamps.
  const m = /^<!\[CDATA\[([\s\S]{1,180})\]\]>$/u.exec(value.trim());
  const native = (m ? m[1] : value).trim();
  if (!native || !/(?:Z|[+-]\d\d:?\d\d|GMT|UTC)$/i.test(native)) return null;
  const ts = Date.parse(native);
  return Number.isFinite(ts) && ts <= now && ts >= now - STATELESS_LOOKBACK_MS ? ts : null;
}

export function acceptedOriginalArticleLink(raw: string | null, source: StatelessSourceSpec): string | null {
  if (!raw || raw.length > 1600) return null;
  try {
    let normalized = unescapeXml(raw);
    // Official ECB first-party feeds are known to emit a second slash
    // immediately after their fixed origin before /press/{pr,key,stats}.
    if ((source.id === "ecb_press" || source.id === "ecb_stats") &&
        /^https:\/\/www\.ecb\.europa\.eu\/\/press\/(?:pr|key|stats)\//iu.test(normalized))
      normalized = normalized.replace("eu//press/", "eu/press/");
    const link = new URL(normalized);
    if (link.protocol !== "https:" || link.username || link.password || link.port ||
        link.hash || !source.allowedHosts.includes(link.hostname.toLowerCase()) ||
        link.pathname.length < 12 || link.pathname.startsWith("//")) return null;
    if (source.govContentApi &&
        !/^\/government\/(?:news|speeches|statements|world-location-news|publications)\//u.test(link.pathname)) return null;
    if (source.id === "fed_press" && !/^\/newsevents\/pressreleases\//u.test(link.pathname)) return null;
    if (source.id === "usgs_minerals" && !/^\/news\//u.test(link.pathname)) return null;
    if (source.id === "ecb_press" || source.id === "ecb_stats") {
      // ECB statistical releases use dedicated /press/stats/{bop,md,...}/
      // YYYY/html/ecb.NAME~HASH.en.html first-party original-article paths.
      // The prior generic /stats/html/ rule silently rejected all seven
      // qualifying monetary/statistical feed links despite valid native dates.
      const legacyOriginal = /^\/press\/(?:pr|key|stats)\/(?:date\/20\d{2}\/html\/|html\/)[A-Za-z0-9.~_-]{6,190}\.html$/u;
      const statisticalOriginal = /^\/press\/stats\/[a-z]{2,16}\/20\d{2}\/html\/ecb\.[A-Za-z0-9._-]{3,110}~[a-f0-9]{8,16}\.[a-z]{2}\.html$/u;
      if (!legacyOriginal.test(link.pathname) && !statisticalOriginal.test(link.pathname)) return null;
    }
    if (source.id === "un_news" && !/^\/en\/story\/\d{4}\/\d{1,2}\//u.test(link.pathname)) return null;
    link.search = "";
    return link.href;
  } catch { return null; }
}

function entryLink(chunk: string, source: StatelessSourceSpec): string | null {
  if (source.media === "rss") {
    const primary = unescapeXml(tagValue(chunk, "link") ?? "");
    if (source.id !== "un_news") return primary;
    // UN News has /feed/view/ routing links. A genuine same-article
    // original permalink GUID, not an inferred redirect, is required.
    try {
      const route = new URL(primary);
      const feed = /^\/feed\/view\/en\/story\/(\d{4})\/(\d{1,2})\/(\d{5,12})\/?$/u.exec(route.pathname);
      if (!feed || route.hostname !== "news.un.org" || route.search || route.hash) return primary;
      const guid = /<guid\b([^>]*)>([\s\S]*?)<\/guid>/iu.exec(chunk);
      if (!guid || !/\bisPermaLink\s*=\s*["']true["']/iu.test(guid[1])) return null;
      const original = new URL(unescapeXml(guid[2]));
      const path = /^\/en\/story\/(\d{4})\/(\d{1,2})\/(\d{5,12})\/?$/u.exec(original.pathname);
      if (!path || original.hostname !== "news.un.org" || original.search || original.hash ||
          feed[1] !== path[1] || Number(feed[2]) !== Number(path[2]) || feed[3] !== path[3])
        return null;
      return original.href;
    } catch { return null; }
  }
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
  metrics: { seen: number; relevant: number; original_link_valid: number; native_clock_valid: number; undated_original: number };
} {
  const metrics = { seen: 0, relevant: 0, original_link_valid: 0, native_clock_valid: 0, undated_original: 0 };
  if (typeof xml !== "string" || xml.length > 384 * 1024 ||
      /<!DOCTYPE|<!ENTITY/iu.test(xml)) return { dated: [], undatedGov: [], metrics };
  // RSS 1.0 uses an RDF envelope, but ONLY the exact publisher whose
  // original first-party media feed format was verified on a live runner.
  // Never grant RDF parsing to a synthetic/unknown source.
  const verifiedRdfPress = source.id === "bis_press" &&
    source.media === "rss" &&
    source.url === "https://www.bis.org/doclist/all_pressrels.rss" &&
    /<rdf:RDF(?:\s|>)/iu.test(xml) &&
    /xmlns:dc\s*=\s*["']http:\/\/purl\.org\/dc\/elements\/1\.1\/["']/iu.test(xml);
  if (source.media === "rss" && !/<rss(?:\s|>)/iu.test(xml) && !verifiedRdfPress)
    return { dated: [], undatedGov: [], metrics };
  if (source.media === "atom" && !/<(?:atom:)?feed(?:\s|>)/iu.test(xml)) return { dated: [], undatedGov: [], metrics };
  const entryPattern = source.media === "rss"
    ? /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu
    : /<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu;
  const dated: StatelessSourceCandidate[] = [];
  const undatedGov: { title: string; articleUrl: string }[] = [];
  const seen = new Set<string>();
  for (const match of [...xml.matchAll(entryPattern)].slice(0, 75)) {
    metrics.seen++;
    const item = match[1];
    const title = unescapeXml(tagValue(item, "title") ?? "");
    if (title.length < 12 || title.length > 300 || /[<>]/u.test(title) ||
        !selectOfficialTopic(title, source.category)) continue;
    metrics.relevant++;
    const articleUrl = acceptedOriginalArticleLink(entryLink(item, source), source);
    if (!articleUrl || seen.has(articleUrl)) continue;
    seen.add(articleUrl);
    metrics.original_link_valid++;
    // For a verified RSS1.0/RDF original press feed, dc:date is its
    // publisher-issued native date. A timestamp must include an explicit
    // timezone (otherwise no timed release is admitted). Refuse updated,
    // modified, HTTP or URL clocks as substitutes.
    const rdfClock = verifiedRdfPress
      ? /<dc:date(?:\s[^>]*)?>([^<>]{4,80})<\/dc:date>/iu.exec(item)?.[1] ?? null
      : null;
    const rawClock = verifiedRdfPress
      ? rdfClock : tagValue(item, source.media === "rss" ? "pubDate" : "published");
    const ms = originalPublicationMs(rawClock, now);
    if (ms !== null) {
      metrics.native_clock_valid++;
      dated.push({
        sourceId: source.id, category: source.category, title,
        articleUrl, publishedAt: new Date(ms).toISOString(), credit: source.credit,
      });
    } else if (((!rawClock && source.govContentApi) || source.canadaOriginalPage) &&
               undatedGov.length < (source.canadaOriginalPage ? 8 : 4)) {
      metrics.undated_original++;
      // Atom "updated" is never substituted for the original publication.
      undatedGov.push({ title, articleUrl });
    }
  }
  return { dated, undatedGov, metrics };
}

/**
 * In-memory event feed: one entry per unique first-party release, NOT a topic
 * aggregate or 0-100 risk score. Titles are newly composed from a controlled
 * domain lexicon, never copied from publisher headlines. Stable IDs are only
 * non-reversible-looking view identifiers, not persistent storage keys.
 */
const SAFE_FOCUS: Record<StatelessCategory, readonly { test: RegExp; label: string }[]> = {
  geopolitics: [
    { test: /\b(?:iran|ukraine)\b/i, label: "regional foreign policy" },
    { test: /\b(?:national security|state threats|hybrid attacks)\b/i, label: "national security" },
    { test: /\bsanctions?\b/i, label: "sanctions" },
    { test: /\bceasefire\b/i, label: "ceasefire negotiations" },
    { test: /\bsecurity council\b/i, label: "UN Security Council activity" },
    { test: /\bborder\b/i, label: "border policy" },
    { test: /\bdisarmament\b/i, label: "disarmament" },
    { test: /\bhumanitarian\b/i, label: "humanitarian policy" },
    { test: /\bforeign policy\b/i, label: "foreign policy" },
    { test: /\bmilitary\b/i, label: "military policy" },
  ],
  macro: [
    { test: /\b(Basel III|Basel Committee|banking supervisors?|capital adequacy|bank capital requirements?)\b/i,
      label: "prudential banking regulation" },
    { test: /\b(?:trade mission|free trade|trade deal|trade agreement|JETCO)\b/i, label: "international trade" },
    { test: /\binterest rates?\b/i, label: "interest-rate policy" },
    { test: /\bmonetary policy\b/i, label: "monetary policy" },
    { test: /\bconsumer prices?\b/i, label: "consumer prices" },
    { test: /\binflation\b/i, label: "inflation" },
    { test: /\bforeign exchange\b/i, label: "foreign exchange" },
    { test: /\bbalance of payments\b/i, label: "external balances" },
    { test: /\bfinancial stability\b/i, label: "financial stability" },
    { test: /\bGDP\b/i, label: "economic output" },
  ],
  rare_earth: [
    { test: /\brare[- ]earths?\b/i, label: "rare-earth materials" },
    { test: /\blithium\b/i, label: "lithium" },
    { test: /\bcobalt\b/i, label: "cobalt" },
    { test: /\bnickel\b/i, label: "nickel" },
    { test: /\bgraphite\b/i, label: "graphite" },
    { test: /\bgallium\b/i, label: "gallium" },
    { test: /\bgermanium\b/i, label: "germanium" },
    { test: /\bcritical minerals?\b/i, label: "critical-minerals supply" },
    { test: /\bmineral processing\b/i, label: "mineral processing" },
  ],
};


/**
 * A reviewed finite vocabulary gives people a readable, factual "what"
 * without copying an upstream title or guessing the event outcome.
 * Geography is only a literal country/region mention in the publisher's
 * original title. No geopolitics inference from a publication hostname.
 */
const GEOGRAPHIES: readonly [RegExp, string][] = [
  [/\b(?:United Kingdom|UK|Britain|British)\b/i, "United Kingdom"],
  [/\b(?:United States|US|U\.S\.|American)\b/i, "United States"],
  [/\b(?:European Union|EU)\b/i, "European Union"],
  [/\b(?:China|Chinese)\b/i, "China"],
  [/\b(?:India|Indian)\b/i, "India"],
  [/\b(?:Canada|Canadian)\b/i, "Canada"],
  [/\b(?:Australia|Australian)\b/i, "Australia"],
  [/\b(?:Japan|Japanese)\b/i, "Japan"],
  [/\b(?:South Africa|South African)\b/i, "South Africa"],
  [/\b(?:Russia|Russian)\b/i, "Russia"],
  [/\b(?:Ukraine|Ukrainian)\b/i, "Ukraine"],
  [/\b(?:Iran|Iranian)\b/i, "Iran"],
  [/\b(?:Taiwan|Taiwanese)\b/i, "Taiwan"],
  [/\b(?:Indonesia|Indonesian)\b/i, "Indonesia"],
  [/\b(?:Brazil|Brazilian)\b/i, "Brazil"],
  [/\b(?:Africa|African)\b/i, "Africa"],
  [/\b(?:Middle East)\b/i, "Middle East"],
];
const DEVELOPMENTS: readonly [RegExp, string][] = [
  [/\b(?:export (?:ban|control|restriction)|trade restrictions?|sanctions?|embargo)\b/i, "trade restriction"],
  [/\b(?:agree(?:ment|d)?|deal|treaty|partnership)\b/i, "agreement"],
  [/\b(?:funding|invest(?:ment|s|ed)?|grant|financing|finance)\b/i, "funding"],
  [/\b(?:approval|approves?|authori[sz]es?|permit|licen[sc]e)\b/i, "approval"],
  [/\b(?:producing|production|mine|mining|processing|refin(?:ery|ing))\b/i, "production"],
  [/\b(?:tariff|tax|duties|customs)\b/i, "trade policy"],
  [/\b(?:rate (?:cut|rise|hike)|interest rate|bank rate|monetary policy)\b/i, "monetary policy"],
  [/\b(?:inflation|consumer pric(?:e|es)|price index)\b/i, "price data"],
  [/\b(?:conflict|ceasefire|war|peace talks?|military|security)\b/i, "security"],
  [/\b(?:research|study|report|findings|survey|statistics|statistical)\b/i, "research"],
  [/\b(?:announc(?:e|es|ement)|statement|press release)\b/i, "announcement"],
  [/\b(?:warns?|risk|concern|alert)\b/i, "risk update"],
  [/\b(?:strategy|plan|proposal|policy|framework|regulation)\b/i, "policy update"],
];
function geographyMention(title: string): string | null {
  return GEOGRAPHIES.find(([pattern]) => pattern.test(title))?.[1] ?? null;
}
function developmentKind(title: string): string {
  return DEVELOPMENTS.find(([pattern]) => pattern.test(title))?.[1] ?? "official update";
}
function developmentSummary(focus: string, kind: string, geography: string | null): string {
  const context = geography ? " mentioning " + geography : "";
  return "An official publisher issued a " + kind + " concerning " + focus +
    context + ". This is a release-based finding; its real-world effect is not yet independently confirmed.";
}
/**
 * Conservative release eligibility for a first-party calendar DAY when a
 * publisher does not give an original hour. The last possible timezone day
 * ends by 12:00 UTC of the next day; add the full website 15m delay.
 * We publish the exact original date label, never an invented clock.
 */
export function conservativeDayReleaseMs(day: string): number | null {
  if (!/^\d{4}-\d{2}-\d{2}$/u.test(day)) return null;
  const start = Date.parse(day + "T00:00:00.000Z");
  if (!Number.isFinite(start) || new Date(start).toISOString().slice(0,10) !== day) return null;
  return start + 36 * 60 * 60_000 + STATELESS_WEBSITE_DELAY_MS;
}
function viewIdentifier(input: string): string {
  // FNV-1a is used solely to avoid exposing raw article URLs in the public
  // UI key; it is NOT proof, an identity attestation or an audit digest.
  let h = 2166136261;
  for (let i = 0; i < input.length; i++) {
    h ^= input.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, "0");
}

export function deriveStatelessSignals(
  candidates: readonly StatelessSourceCandidate[],
  now = Date.now(),
): StatelessIntelligenceSignal[] {
  if (!Number.isFinite(now)) return [];
  const cutoff = now - STATELESS_WEBSITE_DELAY_MS;
  const unique = new Set<string>();
  const result: StatelessIntelligenceSignal[] = [];
  for (const item of candidates) {
    if (!item || !["geopolitics", "macro", "rare_earth"].includes(item.category)) continue;
    const dayOnly = item.datePrecision === "day" &&
      ["eu_top_news","nrcan_releases","canada_foreign_statements","au_geoscience"].includes(item.sourceId);
    const conservativeRelease = dayOnly ? conservativeDayReleaseMs(item.publishedAt) : null;
    const native = dayOnly ? Date.parse(item.publishedAt + "T00:00:00.000Z")
      : originalPublicationMs(item.publishedAt, now);
    if (native === null || !Number.isFinite(native) ||
        now - native > STATELESS_LOOKBACK_MS ||
        (dayOnly ? conservativeRelease === null || now < conservativeRelease : native > cutoff))
      continue;
    let url: URL;
    try { url = new URL(item.articleUrl); } catch { continue; }
    if (url.protocol !== "https:" || url.username || url.password || url.port ||
        url.hash || !url.hostname) continue;
    const topic = selectOfficialTopic(item.title, item.category);
    if (!topic) continue;
    // The same official article can occur in several publisher subject feeds.
    // Deduplicate by the exact admitted article URL within its category,
    // not the feed lane ID; never collapse different source articles by topic.
    // Preserve pre-existing stable D1 IDs for previously ingested lanes.
    // Only new Statistics Canada subject feeds share a canonical family ID;
    // an identical original item across two subject feeds is one story.
    const fingerprint = (item.sourceId.startsWith("statcan_") ? "statcan_daily" : item.sourceId) + "|" + url.href;
    if (unique.has(fingerprint)) continue;
    unique.add(fingerprint);
    const focus = SAFE_FOCUS[item.category].find(rule => rule.test.test(item.title))?.label ?? topic.name;
    const geography = geographyMention(item.title);
    const kind = developmentKind(item.title);
    result.push({
      id: item.category + "-" + viewIdentifier(fingerprint),
      category: item.category,
      title: "Geomacro finds " + kind + " on " + focus + (geography ? " — " + geography : ""),
      why_it_matters: topic.implication,
      what_changed: developmentSummary(focus, kind, geography),
      geography,
      development_type: kind,
      topic: topic.name,
      published_at: dayOnly ? item.publishedAt : new Date(native).toISOString(),
      date_precision: dayOnly ? "day" : "exact",
      observed_release_count: 1,
      sources_credited: item.credit ? [item.credit] : [],
      status: "official_release_observed_unscored",
      same_event_corrob_verified: false,
      severity: null,
    });
  }
  // Preserve every distinct release, even when several target the same topic
  // and date. Exact URL repeats are suppressed; similar titles never become
  // unearned independent same-event corroboration.
  return result.sort((a, b) =>
    b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id)
  ).slice(0, 50);
}
