import {macroPreciousTopic} from "../../scripts/lib/macro-fx-metals.mjs";
import {newsEventFacts} from "./news-event-facts";
import {releaseNewsObservation,actorActionNewsObservation} from "./release-news-observation";
import {GLOBAL_OFFICIAL_RELEASE_FEEDS,globalOriginalArticleUrl,verifiedGlobalRdfFeed} from '../../scripts/lib/global-official-release-feeds.mjs';
import { visiblePublisherText } from "./stateless-publisher-text";
import { exactCanonicalCountryMentionFromOriginalTitle } from "./gri-canonical-country-title-mention";

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
  statcanOriginalPage?: boolean;
};

export type StatelessSourceCandidate = {
  title: string;
  /** Bounded private first-party lead; excluded from the public signal. */
  description?: string;
  articleUrl: string;
  publishedAt: string;
  datePrecision?: "day";
  // Private finite topic recovered from the same date/title-verified NRCan article body.
  originalBodyTopic?: "critical-minerals policy" | "mineral exploration and production";
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
  status: "official_release_observed_unscored" | "official_feed_candidate_unscored" | "osint_feed_observed_unverified";
  same_event_corrob_verified: false;
  severity: null;
};

const DAY = 24 * 60 * 60_000;
export const STATELESS_WEBSITE_DELAY_MS = 0;
export const STATELESS_LOOKBACK_MS = 30 * DAY;

const TOPICS: Record<StatelessCategory, readonly { test: RegExp; name: string; implication: string }[]> = {
  geopolitics: [
    { test: /\b(sanctions?|embargo|asset freeze|trade restriction)\b/i, name: "sanctions and trade restrictions",
      implication: "Official sanctions-related developments can affect settlement, trade routing and cross-border exposure. The direction and enforceability of any change still need case-specific review." },
    { test: /\b(ceasefire|peace talks?|peace agreement|peacekeeping|security council)\b/i, name: "security and diplomacy",
      implication: "Security and diplomatic developments may change country or corridor operating assumptions; this release alone does not establish a change in conflict risk." },
    { test: /\b(border|conflict|attacks?|war|military|disarmament|humanitarian|airstrikes?|missile strikes?|drone strikes?|bombardment|hostilities|ceasefire violations?|evacuations?|forced displacement|refugees?|asylum seekers?|peacekeeping|militias?)\b/i, name: "geopolitical security",
      implication: "Potential implications include logistics access, operational continuity and regional exposure. Independent event confirmation remains necessary." },
    { test: /\b(visa|foreign secretary|foreign policy|diplomacy|treaty|foreign minister|iran|ukraine|gaza|west bank|myanmar|sudan|eritrea|ethiopia|israel|lebanon|international sanctions|state threats|national security|cyber-attack|hybrid attacks|democratic participation|election interference|political prisoners?)\b/i, name: "foreign policy",
      implication: "Policy statements can change jurisdictional or diplomatic context, but implementation and effects require separate corroboration." },
  ],
  macro: [
    { test: /\b(?:fx reserves?|foreign[- ]exchange|exchange rates?|currencies|current account|trade balance|balance of trade|capital flows?|sovereign debt|bond yields?|treasury yields?|industrial production|manufacturing output|purchasing managers? index|\bPMI\b|tariffs?|commodity prices?|energy prices?)\b/i,
      name: "global FX, trade and industrial conditions",
      implication: "Official releases concerning currency reserves, external balances, market rates, trade measures and industrial conditions can inform macro context. Actual figures, implementation and market direction require separate verification." },
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
    { test: /\b(?:lanthanides?|yttrium|cerium|praseodymium|neodymium|samarium|europium|gadolinium|terbium|dysprosium|holmium|erbium|thulium|ytterbium|lutetium|scandium|tungsten|antimony|manganese|vanadium|tantalum|niobium|molybdenum|indium|beryllium|rare[- ]earth elements?)\b/i,
      name: "strategic mineral and rare-earth inputs",
      implication: "Strategic-material releases may affect sourcing concentration and industrial dependencies, but resource presence does not prove commercially recoverable reserves or delivered supply." },
    { test: /\b(?:mineral refining|refining capacity|permanent magnets?|magnet production|battery materials?|mineral supply chains?|ore processing|mineral separation|mining concessions?|mine output|critical mineral projects?)\b/i,
      name: "critical-mineral processing and supply chains",
      implication: "Processing, refining and magnet or battery-material updates can inform supply-chain exposure; announced capacity is not proof of production, shipment or a verified disruption." },
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
    // EIA's own Press Releases RSS emits root-relative original article
    // links. Resolve ONLY the exact preapproved original pressNNN.php path
    // to the fixed issuer origin. No user-controlled base, off-host scheme,
    // query, fragment, double slash or generic same-host article fallback.
    // WTO's own RSS directory historically advertises HTTP issuer links.
    // Upgrade only exact, pre-approved WTO news article paths, never
    // arbitrary HTTP, redirect hosts or tracking links.
    if (source.id === "wto_trade_original_rss" &&
        /^http:\/\/www\.wto\.org\/english\/news_e\/(?:news|pres)\d{2}_e\/[a-z0-9_.-]{4,150}\.htm$/u.test(normalized))
      normalized = "https:" + normalized.slice("http:".length);
    if (source.id === "eia_press_macro" &&
        /^\/pressroom\/releases\/press[1-9][0-9]{1,5}\.php$/u.test(normalized))
      normalized = "https://www.eia.gov" + normalized;
    const global=GLOBAL_OFFICIAL_RELEASE_FEEDS.find((s:{id:string})=>s.id===source.id);
    if(global)return globalOriginalArticleUrl(normalized,global);
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
    if (source.id.startsWith("nz_beehive_") &&
        (link.search || !/^\/(?:release|speech)\/[a-z0-9][a-z0-9-]{4,180}$/u.test(link.pathname)))
      return null;
    if (source.id === "wto_trade_original_rss" &&
        (link.search || !/^\/english\/news_e\/(?:news|pres)\d{2}_e\/[a-z0-9_.-]{4,150}\.htm$/u.test(link.pathname)))
      return null;
    // EIA Press Room's numbered original release article, not the source
    // landing/search page, Today-in-Energy, RSS feed or mirror. An issuer
    // release URL does NOT certify source rights or signed GRI eligibility.
    if (source.id === "eia_press_macro" &&
        (link.search || !/^\/pressroom\/releases\/press[1-9][0-9]{1,5}\.php$/u.test(link.pathname)))
      return null;
    // Australian Industry minister: admit ONLY original issuer media articles.
    // This private first-party RSS is NOT a second independent corroborator,
    // commercial permission, GRO, or authorized current risk score.
    if (source.id === "au_industry_minister" &&
        (link.search || !/^\/t-ayres\/media\/[a-z0-9][a-z0-9-]{10,180}$/u.test(link.pathname)))
      return null;

    // BLS official original statistical releases: feed landing pages,
    // arbitrary same-host content and cross-family releases are never valid.
    if (["bls_cpi", "bls_employment", "bls_external_prices"].includes(source.id)) {
      const family = source.id === "bls_cpi" ? "cpi"
        : source.id === "bls_employment" ? "empsit" : "ximpim";
      const live = new RegExp("^/news\\.release/" + family + "\\.nr[0-9]+\\.htm$", "u");
      const archive = new RegExp("^/news\\.release/archives/" + family + "_[0-9]{8}\\.htm$", "u");
      if (link.search || (!live.test(link.pathname) && !archive.test(link.pathname))) return null;
    }
    if (source.statcanOriginalPage &&
        !/^\/(?:n1\/)?daily-quotidien\/\d{6}\/dq\d{6}[a-z]-eng\.htm$/iu.test(link.pathname))
      return null;
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
    if (source.id.startsWith("un_news") && !/^\/en\/story\/\d{4}\/\d{1,2}\//u.test(link.pathname)) return null;
    link.search = "";
    return link.href;
  } catch { return null; }
}

function entryLink(chunk: string, source: StatelessSourceSpec): string | null {
  if (source.media === "rss") {
    const primary = unescapeXml(tagValue(chunk, "link") ?? "");
    if (!source.id.startsWith("un_news")) return primary;
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

// Subject-specific Statistics Canada Daily feeds are macro publications, but
// Atom <updated> is not original publication. Only an independently verified
// article day may receive this conservative unscored publication fallback.
// Only issuer-verified original article dates may enable a day-only AU
// Resources observation; retrieval and modified clocks remain ineligible.
const EIA_MACRO_ENERGY_TOPIC = {
  test: /\b(?:energy prices?|oil prices?|crude oil|oil production|fuel costs?|winter fuels?|electricity generation|natural gas|Short-Term Energy Outlook|energy security)\b/iu,
  name: "energy supply and cost outlook",
  implication: "Original U.S. energy supply and cost releases may inform macroeconomic conditions; actual values, energy-price direction and risk scoring require separately checked evidence.",
};
const AU_RESOURCES_DAY_SOURCE_IDS = new Set([
  "au_resources_macro_index", "au_resources_minerals_index",
  "au_resources_geopolitics_index",
]);
const AU_RESOURCES_TRADE_TOPIC = {
  test: /\b(?:resources? and energy exports?|resources? exports?|energy exports?|export earnings|export forecasts?)\b/iu,
  name: "resources and energy export outlook",
  implication: "A dated government resources export release informs trade context only; no export value, FX movement or risk score is inferred.",
};
// WTO publishes diverse trade-policy notices. Admit ONLY these explicit
// original-policy subjects, not every WTO newsletter/headline. Source-native
// pubDate + issuer's pinned original article path remain independent gates.
const WTO_ORIGINAL_TRADE_POLICY_TOPIC={
  test:/\b(?:safeguard investigations?|anti[- ]dumping|countervailing (?:duty|duties|measures?)|trade[- ]remedy investigations?|tariff[- ]rate quotas?|tariff (?:concessions?|commitments?|bindings?)|trade (?:policy reviews?|facilitation|disputes?|barriers?)|(?:WTO )?dispute[- ]settlement(?: panels?)?)\b/iu,
  name:"international trade measures and disputes",
  implication:"An original trade-policy notice may affect cross-border market access and supply chains. Enforceability, tariff magnitude, country impact and FX direction are not established by the announcement alone.",
};
export function australianResourcesMacroMatches(title: string): boolean {
  return AU_RESOURCES_TRADE_TOPIC.test.test(title);
}
const STATCAN_FEED_IDS = new Set([
  "statcan_prices", "statcan_accounts", "statcan_trade", "statcan_labour",
]);
const STATCAN_DAILY_TOPIC = {
  test: /./,
  name: "official economic statistics",
  implication: "An original-dated first-party economic statistical release may inform macroeconomic context; no metric direction, materiality or risk score is inferred from its headline.",
};
/** Not every issuer-feed item matches the monitored topic. Retain it as a
 * clearly unclassified candidate rather than inventing topical event facts. */
const UNCLASSIFIED_FEED_TOPIC:Record<StatelessCategory,{name:string;implication:string}> = {
  geopolitics:{name:"geopolitical publisher candidate",
    implication:"A dated official-source item was observed in a geopolitical publisher feed, but its relevance, event facts and impact remain unverified."},
  macro:{name:"macro publisher candidate",
    implication:"A dated official-source item was observed in a macroeconomic publisher feed, but its topical relevance, figures and impact remain unverified."},
  rare_earth:{name:"minerals publisher candidate",
    implication:"A dated official-source item was observed in a minerals publisher feed, but its minerals relevance, production and supply impact remain unverified."},
};
export function topicForOriginal(
  title: string, category: StatelessCategory, sourceId: string, dayVerified: boolean,
) {
  if(category === "rare_earth" && macroPreciousTopic(title) && !/rare[- ]earth|critical minerals?|lithium|cobalt|neodymium|dysprosium/i.test(title)) return null;
  return (category === "macro" ? macroPreciousTopic(title) : null) ?? selectOfficialTopic(title, category) ??
    (category === "macro" && sourceId === "wto_trade_original_rss" &&
      WTO_ORIGINAL_TRADE_POLICY_TOPIC.test.test(title) ? WTO_ORIGINAL_TRADE_POLICY_TOPIC : null) ??
    (category === "macro" && sourceId === "eia_press_macro" &&
      EIA_MACRO_ENERGY_TOPIC.test.test(title) ? EIA_MACRO_ENERGY_TOPIC : null) ??
    (category === "macro" && dayVerified && sourceId === "au_resources_macro_index" &&
      AU_RESOURCES_TRADE_TOPIC.test.test(title) ? AU_RESOURCES_TRADE_TOPIC : null) ??
    (category === "macro" && dayVerified && STATCAN_FEED_IDS.has(sourceId)
      ? STATCAN_DAILY_TOPIC : null);
}

export function parseFirstPartyFeed(xml: string, source: StatelessSourceSpec, now = Date.now()): {
  dated: StatelessSourceCandidate[];
  undatedGov: { title: string; articleUrl: string; description?:string }[];
  metrics: { seen: number; relevant: number; original_link_valid: number; native_clock_valid: number; undated_original: number };
} {
  const metrics = { seen: 0, relevant: 0, original_link_valid: 0, native_clock_valid: 0, undated_original: 0 };
  if (typeof xml !== "string" || xml.length > 384 * 1024 ||
      /<!DOCTYPE|<!ENTITY/iu.test(xml)) return { dated: [], undatedGov: [], metrics };
  // RSS 1.0 uses an RDF envelope, but ONLY the exact publisher whose
  // original first-party media feed format was verified on a live runner.
  // Never grant RDF parsing to a synthetic/unknown source.
  const verifiedRdfPress = source.media === "rss" && verifiedGlobalRdfFeed(source.id,source.url,xml);
  if (source.media === "rss" && !/<rss(?:\s|>)/iu.test(xml) && !verifiedRdfPress)
    return { dated: [], undatedGov: [], metrics };
  if (source.media === "atom" && !/<(?:atom:)?feed(?:\s|>)/iu.test(xml)) return { dated: [], undatedGov: [], metrics };
  const entryPattern = source.media === "rss"
    ? /<item(?:\s[^>]*)?>([\s\S]*?)<\/item>/giu
    : /<(?:atom:)?entry(?:\s[^>]*)?>([\s\S]*?)<\/(?:atom:)?entry>/giu;
  const dated: StatelessSourceCandidate[] = [];
  const undatedGov: { title: string; articleUrl: string; description?:string }[] = [];
  const seen = new Set<string>();
  for (const match of [...xml.matchAll(entryPattern)].slice(0, 75)) {
    metrics.seen++;
    const item = match[1];
    const rawTitle = unescapeXml(tagValue(item, "title") ?? "");
    // Fixed Statistics Canada subject Atom titles encode small HTML fragments.
    // Strip markup as text ONLY for these four trusted first-party lanes;
    // never accept an Atom "updated" clock as publication evidence.
    const description=privateSourceDescription(unescapeXml(tagValue(item,source.media==="rss"?"description":"summary")??""));
    const title = source.statcanOriginalPage
      ? visiblePublisherText(rawTitle)
      : rawTitle;
    if (title.length < 12 || title.length > 300 || /[<>]/u.test(title) ||
        (!topicForOriginal(title, source.category, source.id, source.statcanOriginalPage === true) &&
         !(source.id==="nrcan_releases" && source.canadaOriginalPage===true &&
           source.category==="rare_earth"))) continue;
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
        ...(description?{description}:{}),articleUrl, publishedAt: new Date(ms).toISOString(), credit: source.credit,
      });
    } else if (((!rawClock && (source.govContentApi || source.statcanOriginalPage)) || source.canadaOriginalPage) &&
               undatedGov.length < (source.canadaOriginalPage ? 8 : source.statcanOriginalPage ? 2 : 4)) {
      metrics.undated_original++;
      // Atom "updated" is never substituted for the original publication.
      undatedGov.push({ title, articleUrl,...(description?{description}:{}) });
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
    { test: /\b(?:airstrikes?|missile strikes?|drone strikes?|bombardment|hostilities|militias?)\b/i, label: "armed security developments" },
    { test: /\b(?:refugees?|forced displacement|asylum seekers?|evacuations?)\b/i, label: "humanitarian displacement" },
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
  [/\b(?:Myanmar|Burmese)\b/i, "Myanmar"],
  [/\b(?:Sudan|Sudanese)\b/i, "Sudan"],
  [/\b(?:Eritrea|Eritrean)\b/i, "Eritrea"],
  [/\b(?:Ethiopia|Ethiopian)\b/i, "Ethiopia"],
  [/\b(?:Gaza|West Bank|Palestin(?:e|ian))\b/i, "Palestinian territories"],
  [/\b(?:Israel|Israeli)\b/i, "Israel"],
  [/\b(?:Lebanon|Lebanese)\b/i, "Lebanon"],
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
  // Preserve explicitly reviewed legacy demonyms/regions. For any other
  // issuer title, use the same fixed 195-country registry as GRI country
  // evidence routing. No fuzzy aliases, hostname inference or guessing.
  return GEOGRAPHIES.find(([pattern]) => pattern.test(title))?.[1] ??
    exactCanonicalCountryMentionFromOriginalTitle(title);
}
function developmentKind(title: string): string {
  return DEVELOPMENTS.find(([pattern]) => pattern.test(title))?.[1] ?? "official update";
}
function developmentSummary(focus: string, kind: string, geography: string | null): string {
  const context = geography ? " mentioning " + geography : "";
  const description:Readonly<Record<string,string>>={
    "trade restriction":"a trade-restriction update",agreement:"an agreement-related update",
    funding:"a funding update",approval:"an approval-related update",production:"a production-related update",
    "trade policy":"a trade-policy update","monetary policy":"a monetary-policy update",
    "price data":"a price-data release",security:"a security-related update",research:"a research release",
    announcement:"an announcement","risk update":"a risk update","policy update":"a policy update",
  };
  return "An official publisher released " + (description[kind]??"an official update") +
    " about " + focus + context + ". Its real-world effects are not independently confirmed.";
}
/**
 * Conservative release eligibility for a first-party calendar DAY when a
 * publisher does not give an original hour. The last possible timezone day
 * ends by 12:00 UTC of the next day; no extra publication delay.
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

/** Bounded in-memory original description, never distributed as a public signal. */
export function privateSourceDescription(value:unknown):string|undefined{
 if(typeof value!=="string"||!value||value.length>384*1024)return undefined;
 const text=visiblePublisherText(value).replace(/&(?:quot|apos|rsquo|lsquo);/giu,
  token=>token==="&quot;"?'"':"'").replace(/\s+/gu," ").trim();
 if(!text||/[<>]|https?:\/\/|www\./iu.test(text))return undefined;
 if(text.length<=1500)return text;
 const end=text.slice(0,1500).lastIndexOf(". ");
 return end>30?text.slice(0,end+1):undefined;
}

export function deriveStatelessSignals(
  candidates: readonly StatelessSourceCandidate[],
  now = Date.now(),
  options: {websiteDelay?:boolean;maxSignals?:number;editorialVersion?:"legacy_v1"|"actor_action_v2"|"news_facts_v3"} = {},
): StatelessIntelligenceSignal[] {
  if (!Number.isFinite(now)) return [];
  const maxSignals=options.maxSignals===undefined?50:options.maxSignals;
  if(!Number.isSafeInteger(maxSignals)||maxSignals<1||maxSignals>200)return [];
  const cutoff = now - (options.websiteDelay===false?0:STATELESS_WEBSITE_DELAY_MS);
  const unique = new Set<string>();
  const result: StatelessIntelligenceSignal[] = [];
  for (const item of candidates) {
    if (!item || !["geopolitics", "macro", "rare_earth"].includes(item.category)) continue;
    const dayOnly = item.datePrecision === "day" &&
      (["eu_top_news","nrcan_releases","canada_foreign_statements","au_geoscience","us_doe_cmei_minerals_index"].includes(item.sourceId) ||
        AU_RESOURCES_DAY_SOURCE_IDS.has(item.sourceId) ||
         STATCAN_FEED_IDS.has(item.sourceId));
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
    const topic = topicForOriginal(item.title, item.category, item.sourceId, dayOnly) ??
      (dayOnly && item.sourceId==="nrcan_releases" && item.category==="rare_earth" &&
       ["critical-minerals policy","mineral exploration and production"].includes(item.originalBodyTopic??"")?
        TOPICS.rare_earth.find(t=>t.name===item.originalBodyTopic)??null:null);
    const candidateOnly=topic===null;
    const selected=topic??UNCLASSIFIED_FEED_TOPIC[item.category];
    // The same official article can occur in several publisher subject feeds.
    // Deduplicate by the exact admitted article URL within its category,
    // not the feed lane ID; never collapse different source articles by topic.
    // Preserve pre-existing stable D1 IDs for previously ingested lanes.
    // Only new Statistics Canada subject feeds share a canonical family ID;
    // an identical original item across two subject feeds is one story.
    const family = item.sourceId.startsWith("statcan_") ? "statcan_daily"
      : item.sourceId.startsWith("un_news") ? "un_news" : item.sourceId;
    const fingerprint = item.sourceId.startsWith("bls_")
      ? family + "|" + item.publishedAt : family + "|" + url.href;
    // Delivery identity is category + exact admitted original URL. A source
    // can expose the same article through RSS and its HTML index; feed-lane
    // IDs must not turn one release into two findings. Keep the historical
    // fingerprint above solely for stable public IDs of the selected lane.
    const deliveryIdentity = item.category + "|" + (item.sourceId.startsWith("bls_") ? fingerprint : url.href);
    if (unique.has(deliveryIdentity)) continue;
    unique.add(deliveryIdentity);
    const focus=candidateOnly?selected.name:
      SAFE_FOCUS[item.category].find(rule => rule.test.test(item.title))?.label ?? selected.name;
    const legacy=options.editorialVersion==="legacy_v1";
    const previousNews=actorActionNewsObservation(item.title)??(candidateOnly?null:releaseNewsObservation(item.title));
    const news=legacy?(candidateOnly?null:releaseNewsObservation(item.title)):
      options.editorialVersion==="actor_action_v2"?previousNews:
      (candidateOnly||item.sourceId==="au_geoscience"?null:newsEventFacts(item.title,item.description??"",item.sourceId))??previousNews;
    const geography=candidateOnly?null:geographyMention(item.title)??(news?geographyMention(news.headline):null);
    const kind=candidateOnly?"unclassified publisher update":developmentKind(item.title);
    result.push({
      id: item.category + "-" + viewIdentifier(fingerprint),
      category: item.category,
      title: "Geomacro finds " + (news?.headline ?? kind + " on " + focus) + (geography ? " · " + geography : ""),
      why_it_matters:selected.implication,
      what_changed:news ? news.change + (geography ? " Country or region mentioned: " + geography + "." : "") :
        candidateOnly?"A dated first-party source item was observed; category relevance, event details and material changes have not yet been established.":
        (legacy?developmentSummary(focus,kind,geography):
          "The dated original release concerns "+focus+
          (geography?" in "+geography:"")+
          ". The published headline does not establish a named actor performing a verifiable action; no outcome is inferred."),
      geography,
      development_type: kind,
      topic: selected.name,
      published_at: dayOnly ? item.publishedAt : new Date(native).toISOString(),
      date_precision: dayOnly ? "day" : "exact",
      observed_release_count: 1,
      sources_credited: item.credit ? [item.credit] : [],
      status:candidateOnly?"official_feed_candidate_unscored":
        "official_release_observed_unscored",
      same_event_corrob_verified: false,
      severity: null,
    });
  }
  // Preserve every distinct release, even when several target the same topic
  // and date. Exact URL repeats are suppressed; similar titles never become
  // unearned independent same-event corroboration.
  return result.sort((a, b) =>
    b.published_at.localeCompare(a.published_at) || a.id.localeCompare(b.id)
  ).slice(0, maxSignals);
}

// PRIVATE, in-memory original-reference recovery from a successful existing
// website publisher read. Source URLs, upstream titles and issuer IDs MUST
// never be returned via the website feed or persisted to public D1.
// Matching a derived display ID to a first-party feed reference does NOT
// verify an independent fact, commercial rights, signing or payment eligibility.
/**
 * Restore ONLY genuine first-party references for already retained D1
 * derived cards, in addition to this run's bounded source observations.
 * The publisher list may contain an authentic original that no longer fits
 * the current top-20/200 story display limit; omitting retained IDs from
 * reconciliation previously made that original permanently unmatchable.
 *
 * Actual retained journal bytes win on duplicate IDs. Never infer an URL
 * from the public card or change its signed clock. A matched first-party
 * reference is still NOT an original-page byte proof, rights or signature.
 */
const MAX_PRIVATE_ORIGINAL_REFERENCE_TARGETS=600;
export function selectBoundedRetainedOriginalTargets(
  current:readonly StatelessIntelligenceSignal[],
  retained:readonly StatelessIntelligenceSignal[],
  limit=250,
):StatelessIntelligenceSignal[] {
  if(!Array.isArray(current)||!Array.isArray(retained)||
     current.length>250||retained.length>MAX_PRIVATE_ORIGINAL_REFERENCE_TARGETS||
     !Number.isSafeInteger(limit)||limit<1||limit>MAX_PRIVATE_ORIGINAL_REFERENCE_TARGETS)
    throw Error("PRIVATE_ORIGINAL_REFERENCE_TARGET_BUDGET_INVALID");
  const targets=new Map<string,StatelessIntelligenceSignal>();
  for(const row of current){
    if(!targets.has(row.id)&&targets.size>=limit)
      throw Error("PRIVATE_ORIGINAL_REFERENCE_TARGET_BUDGET_INVALID");
    targets.set(row.id,row);
  }
  for(const row of retained){
    // Overwrite in-place when D1 has the exact signed/public record; no
    // guess at an earlier editorial version or a different native time.
    if(targets.has(row.id)||targets.size<limit)targets.set(row.id,row);
  }
  return [...targets.values()];
}

export function reconcilePrivateDerivedSourceRefs(
  candidates:readonly StatelessSourceCandidate[],
  published:readonly StatelessIntelligenceSignal[],
  now=Date.now(),
):ReadonlyMap<string,StatelessSourceCandidate> {
  const expected=new Map(published.map(s=>[s.id,s]));
  const found=new Map<string,StatelessSourceCandidate>();
  const collisions=new Set<string>();
  // The retained D1 journal is capped at 600 rows. Reconcile the full
  // bounded journal; refusing any array over 250 silently discarded every
  // reference when the caller supplied the whole journal. This remains a
  // source-reference match only, never original-byte proof or rights approval.
  if(!Number.isFinite(now)||published.length>MAX_PRIVATE_ORIGINAL_REFERENCE_TARGETS||
     candidates.length>10_000)
    return new Map();
  for(const c of candidates){
    if(!c || typeof c.articleUrl!=="string"||!c.articleUrl.startsWith("https://"))continue;
    const derived=deriveStatelessSignals([c],now)[0];
    if(!derived)continue;
    const d=expected.get(derived.id);
    if(!d || Object.keys(d).some(k=>
       JSON.stringify((d as unknown as Record<string,unknown>)[k])!==
       JSON.stringify((derived as unknown as Record<string,unknown>)[k])))continue;
    const prior=found.get(derived.id);
    if(prior && prior.articleUrl!==c.articleUrl)collisions.add(derived.id);
    else if(!prior)found.set(derived.id,c);
  }
  for(const id of collisions)found.delete(id);
  return found;
}
