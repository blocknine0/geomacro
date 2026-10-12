/**
 * On-demand website Intelligence reader. No B2/D1/Supabase/KV/files/queues,
 * no writes, no cron, no background tasks, no durable snapshot or raw logs.
 * Uses a bounded first-party release metadata read, not a paid x402 scorer.
 */
import {
  deriveStatelessSignals, originalPublicationMs, parseFirstPartyFeed, STATELESS_WEBSITE_DELAY_MS, STATELESS_LOOKBACK_MS,
  type StatelessCategory, type StatelessSourceCandidate,
  type StatelessSourceSpec, type StatelessIntelligenceSignal,
} from "./stateless-intelligence-model";
import { euCommissionTopOriginalCandidates } from "./stateless-eu-original-index.server";
import { readPibMinesOriginalCandidates } from "./stateless-pib-mines-original.server";
import { canadaOriginalPublicationDay } from "./stateless-canada-original.server";

const OGL_CREDIT = "Contains public sector information licensed under the Open Government Licence v3.0.";
const SOURCES: readonly StatelessSourceSpec[] = Object.freeze([
  // Additional independent foreign-affairs jurisdiction, source URL from
  // the Government of Canada's published Global Affairs RSS/Atom directory.
  { id: "canada_foreign_statements", category: "geopolitics", media: "atom",
    url: "https://api.io.canada.ca/io-server/gc/news/en/v2?atomtitle=Global+Affairs+Canada+statements&dept=departmentofforeignaffairstradeanddevelopment&format=atom&orderBy=desc&pick=50&publishedDate%3E=2015-01-01&sort=publishedDate&type=statements",
    allowedHosts: ["www.canada.ca", "www.international.gc.ca", "international.canada.ca",
      "api.io.canada.ca"], credit: "Global Affairs Canada", canadaOriginalPage: true },
  { id: "uk_fcdo", category: "geopolitics", media: "atom",
    url: "https://www.gov.uk/government/organisations/foreign-commonwealth-development-office.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  { id: "un_news", category: "geopolitics", media: "rss",
    url: "https://news.un.org/feed/subscribe/en/news/all/rss.xml",
    allowedHosts: ["news.un.org"], credit: null },
  { id: "uk_cabinet", category: "geopolitics", media: "atom",
    url: "https://www.gov.uk/government/organisations/cabinet-office.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  { id: "uk_mod", category: "geopolitics", media: "atom",
    url: "https://www.gov.uk/government/organisations/ministry-of-defence.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  { id: "uk_home", category: "geopolitics", media: "atom",
    url: "https://www.gov.uk/government/organisations/home-office.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  // Statistics Canada's documented subject-specific first-party Daily Atom feeds.
  // Only article <published> (never <updated>) controls release age.
  { id: "statcan_prices", category: "macro", media: "atom",
    url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom",
    allowedHosts: ["www150.statcan.gc.ca"], credit: "Statistics Canada" },
  { id: "statcan_accounts", category: "macro", media: "atom",
    url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/36-eng.atom",
    allowedHosts: ["www150.statcan.gc.ca"], credit: "Statistics Canada" },
  { id: "statcan_trade", category: "macro", media: "atom",
    url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/12-eng.atom",
    allowedHosts: ["www150.statcan.gc.ca"], credit: "Statistics Canada" },
  { id: "statcan_labour", category: "macro", media: "atom",
    url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/14-eng.atom",
    allowedHosts: ["www150.statcan.gc.ca"], credit: "Statistics Canada" },
  // Eurostat's official Atom feed of economy-and-finance NEWS RELEASES,
  // not the dataset-update RSS whose timestamps reflect data operations.
  { id: "eurostat_economy_release", category: "macro", media: "atom",
    url: "https://ec.europa.eu/eurostat/en/search?_estatsearchportlet_WAR_estatsearchportlet_collection=CAT_PREREL&_estatsearchportlet_WAR_estatsearchportlet_theme=PER_ECOFIN&p_p_id=estatsearchportlet_WAR_estatsearchportlet&p_p_lifecycle=2&p_p_mode=view&p_p_resource_id=atom&p_p_state=maximized",
    allowedHosts: ["ec.europa.eu"], credit: "Eurostat" },
  { id: "fed_press", category: "macro", media: "rss",
    url: "https://www.federalreserve.gov/feeds/press_all.xml",
    allowedHosts: ["www.federalreserve.gov"], credit: "Federal Reserve Board" },
  { id: "ecb_press", category: "macro", media: "rss",
    url: "https://www.ecb.europa.eu/rss/press.html",
    allowedHosts: ["www.ecb.europa.eu"], credit: "European Central Bank" },
  { id: "ecb_stats", category: "macro", media: "rss",
    url: "https://www.ecb.europa.eu/rss/statpress.html",
    allowedHosts: ["www.ecb.europa.eu"], credit: "European Central Bank" },
  { id: "uk_treasury", category: "macro", media: "atom",
    url: "https://www.gov.uk/government/organisations/hm-treasury.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  { id: "uk_dbt_macro", category: "macro", media: "atom",
    url: "https://www.gov.uk/government/organisations/department-for-business-innovation-science-and-trade.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  // Natural Resources Canada's official news-release Atom feed (not a
  // search-engine snippet and not a dataset modification timestamp).
  { id: "nrcan_releases", category: "rare_earth", media: "atom",
    url: "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada",
    allowedHosts: ["www.canada.ca", "natural-resources.canada.ca", "www.nrcan.gc.ca",
      "api.io.canada.ca"], credit: "Natural Resources Canada", canadaOriginalPage: true },
  { id: "nrcan_science", category: "rare_earth", media: "rss",
    url: "https://natural-resources.canada.ca/simply-science/rss.xml",
    allowedHosts: ["natural-resources.canada.ca", "www.natural-resources.canada.ca"],
    credit: null },
  { id: "au_industry", category: "rare_earth", media: "rss",
    url: "https://www.minister.industry.gov.au/feed/t-ayres/rss.xml",
    allowedHosts: ["www.minister.industry.gov.au"], credit: null },
  { id: "uk_energy", category: "rare_earth", media: "atom",
    url: "https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  { id: "usgs_minerals", category: "rare_earth", media: "rss",
    url: "https://www.usgs.gov/news/minerals/feed",
    allowedHosts: ["www.usgs.gov"], credit: "U.S. Geological Survey" },
  { id: "eu_top_news", category: "rare_earth", media: "html_index",
    url: "https://single-market-economy.ec.europa.eu/index_en",
    allowedHosts: ["single-market-economy.ec.europa.eu"], credit: "European Commission" },
  { id: "uk_dbt", category: "rare_earth", media: "atom",
    url: "https://www.gov.uk/government/organisations/department-for-business-innovation-science-and-trade.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  { id: "in_pib_mines", category: "rare_earth", media: "html_index",
    url: "https://www.pib.gov.in/AllRelease.aspx?lang=1&reg=6",
    allowedHosts: ["www.pib.gov.in"], credit: null },
]);

const MAX_FEED_BYTES = 384 * 1024;
const MAX_PAGE_BYTES = 128 * 1024;
const TIMEOUT_MS = 5_000;

async function boundedText(response: Response, maxBytes: number): Promise<string | null> {
  if (!response.ok || !response.body) return null;
  const declared = Number(response.headers.get("content-length") ?? "0");
  if (Number.isFinite(declared) && declared > maxBytes) return null;
  const reader = response.body.getReader();
  const parts: Uint8Array[] = [];
  let size = 0;
  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      size += value.byteLength;
      if (size > maxBytes) return null;
      parts.push(value);
    }
    const merged = new Uint8Array(size);
    let offset = 0;
    for (const part of parts) { merged.set(part, offset); offset += part.byteLength; }
    return new TextDecoder("utf-8", { fatal: true }).decode(merged);
  } catch { return null; }
  finally { await reader.cancel().catch(() => undefined); }
}

async function readGovContentOriginalDate(candidate: {
  title: string; articleUrl: string;
}, source: StatelessSourceSpec, now: number): Promise<StatelessSourceCandidate | null> {
  // No visitor-provided URL and no off-host forwarding. Only the fixed
  // GOV.UK API path tied to an already host/path-admitted Atom link.
  if (!source.govContentApi || !candidate.articleUrl.startsWith("https://www.gov.uk/")) return null;
  const path = new URL(candidate.articleUrl).pathname;
  if (!/^\/government\/(?:news|speeches|statements|world-location-news|publications)\/[a-z0-9-]+$/u.test(path))
    return null;
  try {
    const response = await fetch("https://www.gov.uk/api/content" + path, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Accept: "application/json" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!/^application\/json(?:;|$)/iu.test(response.headers.get("content-type") ?? "")) return null;
    const body = await boundedText(response, MAX_PAGE_BYTES);
    if (!body) return null;
    const page = JSON.parse(body) as Record<string, unknown>;
    if (page.base_path !== path || typeof page.title !== "string" ||
        !["news_story", "press_release", "speech", "statement", "publication", "world_location_news_article"].includes(String(page.document_type)))
      return null;
    // Release-title plausibility, not an event or independent corroboration.
    const feedWords = new Set(candidate.title.toLowerCase().match(/[a-z]{5,}/gu) ?? []);
    const pageWords = new Set(page.title.toLowerCase().match(/[a-z]{5,}/gu) ?? []);
    if (![...feedWords].some(word => pageWords.has(word))) return null;
    const ms = originalPublicationMs(typeof page.first_published_at === "string"
      ? page.first_published_at : null, now);
    if (ms === null) return null;
    return {
      sourceId: source.id, category: source.category, title: candidate.title,
      articleUrl: candidate.articleUrl, publishedAt: new Date(ms).toISOString(),
      credit: source.credit,
    };
  } catch { return null; }
}

async function readCanadaNewsOriginalDay(candidate: {
  title: string; articleUrl: string;
}, source: StatelessSourceSpec, now: number,
  note?: (stage: "path_ok" | "http_ok" | "html_ok" | "title_ok" |
    "clock_found" | "clock_consistent" | "date_path_ok" | "original_ok") => void,
): Promise<StatelessSourceCandidate | null> {
  if (!source.canadaOriginalPage ||
      !/^https:\/\/www\.canada\.ca\/en\/(?:natural-resources-canada|global-affairs)\/news\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9-]+\.html$/u.test(candidate.articleUrl))
    return null;
  note?.("path_ok");
  try {
    const response=await fetch(candidate.articleUrl,{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{Accept:"text/html"},signal:AbortSignal.timeout(TIMEOUT_MS),
    });
    if(!response.ok || !/^text\/html(?:;|$)/iu.test(response.headers.get("content-type")??""))return null;
    note?.("http_ok");
    const html=await boundedText(response,384*1024);
    if(!html)return null;
    note?.("html_ok");
    const day=canadaOriginalPublicationDay(html,candidate.articleUrl,candidate.title,now, note);
    if(!day)return null;
    note?.("original_ok");
    return {sourceId:source.id,category:source.category,title:candidate.title,
      articleUrl:candidate.articleUrl,publishedAt:day,datePrecision:"day",
      credit:source.credit};
  }catch{return null}
}

type LaneMetrics = {
  seen: number; relevant: number; original_link_valid: number;
  native_clock_valid: number; undated_original: number;
  recovered_original_page: number; transport_ok: boolean;
  // Optional anonymous first-party stage counters for read-only CI
  // diagnostics. Never log provider URLs, article IDs or raw content.
  canada_original_path_ok?: number;
  canada_original_http_ok?: number;
  canada_original_html_ok?: number;
  canada_original_date_ok?: number;
  canada_title_ok?: number;
  canada_original_clock_found?: number;
  canada_original_clock_consistent?: number;
  canada_original_date_path_ok?: number;
};
async function readSource(source: StatelessSourceSpec, now: number): Promise<{
  candidates: StatelessSourceCandidate[]; healthy: boolean;
  metrics?: LaneMetrics;
}> {
  if(source.id === "in_pib_mines" && source.media === "html_index"){
    const release=await readPibMinesOriginalCandidates(now);
    return {healthy:release.healthy,candidates:release.candidates,
      metrics:{seen:release.inspected,relevant:release.inspected,
        original_link_valid:release.inspected,native_clock_valid:release.original_verified,
        undated_original:0,recovered_original_page:release.original_verified,
        transport_ok:release.healthy}};
  }
  if (source.id === "eu_top_news" && source.media === "html_index") {
    try {
      const response = await fetch(source.url, {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { Accept: "text/html" },
        signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!/^text\/html(?:;|$)/iu.test(response.headers.get("content-type") ?? ""))
        return { candidates: [], healthy: false };
      const html = await boundedText(response, 512 * 1024);
      if (!html) return { candidates: [], healthy: false };
      const release = euCommissionTopOriginalCandidates(html, now);
      return { healthy: true, candidates: release.candidates,
        metrics: { seen: release.inspected_links,
          relevant: release.candidates.length,
          original_link_valid: release.candidates.length,
          native_clock_valid: release.candidates.length,
          undated_original: 0, recovered_original_page: 0,
          transport_ok: true },
      };
    } catch { return { candidates: [], healthy: false }; }
  }
  try {
    const response = await fetch(source.url, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Accept: source.media === "rss" ? "application/rss+xml, application/xml, text/xml" :
        "application/atom+xml, application/xml, text/xml" },
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    const mime = response.headers.get("content-type") ?? "";
    if (!/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu.test(mime))
      return { candidates: [], healthy: false };
    const xml = await boundedText(response, MAX_FEED_BYTES);
    if (!xml) return { candidates: [], healthy: false };
    const parsed = parseFirstPartyFeed(xml, source, now);
    const canadaStage = {path_ok:0,http_ok:0,html_ok:0,original_ok:0,
      title_ok:0,clock_found:0,clock_consistent:0,date_path_ok:0};
    const recovered = await Promise.all(parsed.undatedGov.slice(0, source.canadaOriginalPage ? 8 : 4)
      .map(candidate => source.canadaOriginalPage
        ? readCanadaNewsOriginalDay(candidate, source, now, stage => {canadaStage[stage]++;})
        : readGovContentOriginalDate(candidate, source, now)));
    return { healthy: true,
      candidates: [...parsed.dated, ...recovered.filter((x): x is StatelessSourceCandidate => x !== null)],
      metrics: { ...parsed.metrics, recovered_original_page: recovered.filter(Boolean).length, transport_ok: true,
        ...(source.canadaOriginalPage ? {
          canada_original_path_ok:canadaStage.path_ok,
          canada_original_http_ok:canadaStage.http_ok,
          canada_original_html_ok:canadaStage.html_ok,
          canada_original_date_ok:canadaStage.original_ok,
          canada_title_ok:canadaStage.title_ok,
          canada_original_clock_found:canadaStage.clock_found,
          canada_original_clock_consistent:canadaStage.clock_consistent,
          canada_original_date_path_ok:canadaStage.date_path_ok,
        } : {}),
      },
    };
  } catch { return { candidates: [], healthy: false }; }
}

export type StatelessIntelligenceResult = {
  schema: "geomacro.website-stateless-intelligence.v1";
  category: StatelessCategory;
  checked_at: string;
  website_release_cutoff: string;
  earliest_original: string;
  releases_examined: number;
  feed_count: number;
  healthy_feed_count: number;
  current_24h_count: number;
  last_7d_count: number;
  last_30d_count: number;
  status: "official_observations_available" | "no_eligible_original_releases" | "sources_unavailable";
  signals: StatelessIntelligenceSignal[];
  persistent_storage: false;
  publisher_title_redistributed: false;
  signed_risk_score_generated: false;
  independent_same_event_verification: false;
};

export async function readStatelessWebsiteIntelligence(
  category: StatelessCategory, now = Date.now(),
  onLaneDiagnostic?: (index: number, diagnostics: LaneMetrics) => void,
): Promise<StatelessIntelligenceResult> {
  if (!["geopolitics", "macro", "rare_earth"].includes(category) ||
      !Number.isFinite(now)) throw Error("STATELESS_INTELLIGENCE_CATEGORY_OR_CLOCK_INVALID");
  const sourceGroup = SOURCES.filter(source => source.category === category);
  const batch = await Promise.all(sourceGroup.map(source => readSource(source, now)));
  // The optional callback is used only by the private acceptance runner;
  // no publisher identity, URL or diagnostic lane details reach the browser.
  if (onLaneDiagnostic) batch.forEach((lane, index) => onLaneDiagnostic(index,
    lane.metrics ?? { seen: 0, relevant: 0, original_link_valid: 0,
      native_clock_valid: 0, undated_original: 0,
      recovered_original_page: 0, transport_ok: false }));
  const signals = deriveStatelessSignals(batch.flatMap(x => x.candidates), now);
  const healthy = batch.filter(x => x.healthy).length;
  return {
    schema: "geomacro.website-stateless-intelligence.v1",
    category,
    checked_at: new Date(now).toISOString(),
    website_release_cutoff: new Date(now - STATELESS_WEBSITE_DELAY_MS).toISOString(),
    earliest_original: new Date(now - STATELESS_LOOKBACK_MS).toISOString(),
    releases_examined: batch.reduce((n, x) => n + x.candidates.length, 0),
    feed_count: sourceGroup.length,
    healthy_feed_count: healthy,
    current_24h_count: signals.filter(x => Date.parse(x.published_at) >= now - 86_400_000).length,
    last_7d_count: signals.filter(x => Date.parse(x.published_at) >= now - 7 * 86_400_000).length,
    last_30d_count: signals.length,
    status: signals.length > 0 ? "official_observations_available"
      : healthy > 0 ? "no_eligible_original_releases" : "sources_unavailable",
    signals,
    persistent_storage: false,
    publisher_title_redistributed: false,
    signed_risk_score_generated: false,
    independent_same_event_verification: false,
  };
}
