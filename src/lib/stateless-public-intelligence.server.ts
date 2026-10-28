import {fetchWithoutRedirect} from "./fetch-without-redirect";
import type {RunScopedAustralianResourcesFetch} from "./stateless-run-shared-official-fetch";
import {GLOBAL_OFFICIAL_RELEASE_FEEDS,globalOriginalArticleUrl,ieaMineralsIndexCandidates,verifiedIeaOriginalPublication} from '../../scripts/lib/global-official-release-feeds.mjs';
/**
 * On-demand website Intelligence reader. No B2/D1/Supabase/KV/files/queues,
 * no writes, no cron, no background tasks, no durable snapshot or raw logs.
 * Uses a bounded first-party release metadata read, not a paid x402 scorer.
 */
import {
  deriveStatelessSignals, topicForOriginal, originalPublicationMs, parseFirstPartyFeed, STATELESS_WEBSITE_DELAY_MS, STATELESS_LOOKBACK_MS,
  type StatelessCategory, type StatelessSourceCandidate,
  type StatelessSourceSpec, type StatelessIntelligenceSignal,
} from "./stateless-intelligence-model";
import { euCommissionTopOriginalCandidates } from "./stateless-eu-original-index.server";
import { australianNewsIndexCandidates, australianArticleMatchesOriginal } from "./stateless-australian-geoscience-original.server";
import { australianResourcesIndexCandidates, verifyAustralianResourcesOriginalArticle } from "./stateless-au-resources-original.server";
import { readPibMinesOriginalCandidates } from "./stateless-pib-mines-original.server";
import {doeMineralsIndexCandidates,doeMineralsOriginalArticleMatches} from "./stateless-us-doe-minerals-original.server";
import { canadaOriginalPublicationDay, canadaOriginalMineralsTopic, canadaOriginalPrecisePublicationTime } from "./stateless-canada-original.server";
import { verifiedStatcanOriginalReleaseDay } from "./stateless-statcan-original.server";

const OGL_CREDIT = "Contains public sector information licensed under the Open Government Licence v3.0.";
const SOURCES: readonly StatelessSourceSpec[] = Object.freeze([
  // NZ Government explicitly publishes this first-party releases RSS; its
  // Crown copyright terms require source acknowledgement. NEVER silently
  // promote those messages into no-attribution commercial derived outputs.
  // Three strict *topic* lanes over one official publisher are not three
  // independent corroborating sources or full New Zealand media coverage.
  {id:"nz_beehive_geopolitics",category:"geopolitics",media:"rss",
    url:"https://www.beehive.govt.nz/rss.xml",
    allowedHosts:["www.beehive.govt.nz"],credit:"New Zealand Government (Beehive)"},
  {id:"nz_beehive_macro",category:"macro",media:"rss",
    url:"https://www.beehive.govt.nz/rss.xml",
    allowedHosts:["www.beehive.govt.nz"],credit:"New Zealand Government (Beehive)"},
  {id:"nz_beehive_minerals",category:"rare_earth",media:"rss",
    url:"https://www.beehive.govt.nz/rss.xml",
    allowedHosts:["www.beehive.govt.nz"],credit:"New Zealand Government (Beehive)"},
  // WTO's own RSS requires explicit "WTO news" acknowledgement. Its trade
  // releases are global policy discovery, not macro FX ticks, not a 2nd
  // independent issuer, not a merchant rights receipt or a scored event.
  {id:"wto_trade_original_rss",category:"macro",media:"rss",
    url:"https://www.wto.org/library/rss/latest_news_e.xml",
    allowedHosts:["www.wto.org"],credit:"WTO news"},

  // Shared official resources originals enter geopolitics ONLY when the
  // independently evaluated title matches an existing geopolitical policy
  // rule. Ordinary minerals/export headlines cannot leak into this lane.
  { id: "au_resources_geopolitics_index", category: "geopolitics", media: "html_index",
    url: "https://www.minister.industry.gov.au/king/media?type=media_releases",
    allowedHosts: ["www.minister.industry.gov.au"], credit: null },
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
  // Separate original UK sanctions issuers. Same first-party Content API
  // verifies first_published_at for undated GOV.UK Atom entries; never use
  // Atom updated/HTTP/reader clock as an original-event timestamp.
  { id: "uk_ofsi_sanctions", category: "geopolitics", media: "atom",
    url: "https://www.gov.uk/government/organisations/office-of-financial-sanctions-implementation.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  { id: "uk_otsi_trade_sanctions", category: "geopolitics", media: "atom",
    url: "https://www.gov.uk/government/organisations/office-of-trade-sanctions-implementation.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  // UN News subject/region publisher feeds complement (do not independently
  // corroborate) the existing all-news feed. Stable article fingerprinting
  // collapses one UN release repeated across several UN feed variants.
  { id: "un_news_security", category: "geopolitics", media: "rss",
    url: "https://news.un.org/feed/subscribe/en/news/topic/peace-and-security/feed/rss.xml",
    allowedHosts: ["news.un.org"], credit: null },
  { id: "un_news_africa", category: "geopolitics", media: "rss",
    url: "https://news.un.org/feed/subscribe/en/news/region/africa/feed/rss.xml",
    allowedHosts: ["news.un.org"], credit: null },
  { id: "uk_home", category: "geopolitics", media: "atom",
    url: "https://www.gov.uk/government/organisations/home-office.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  // Statistics Canada's documented subject-specific first-party Daily Atom feeds.
  // Only article <published> (never <updated>) controls release age.
  { id: "statcan_prices", category: "macro", media: "atom",
    url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/18-eng.atom",
    allowedHosts: ["www150.statcan.gc.ca", "www.statcan.gc.ca"], credit: "Statistics Canada", statcanOriginalPage: true },
  { id: "statcan_accounts", category: "macro", media: "atom",
    url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/36-eng.atom",
    allowedHosts: ["www150.statcan.gc.ca", "www.statcan.gc.ca"], credit: "Statistics Canada", statcanOriginalPage: true },
  { id: "statcan_trade", category: "macro", media: "atom",
    url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/12-eng.atom",
    allowedHosts: ["www150.statcan.gc.ca", "www.statcan.gc.ca"], credit: "Statistics Canada", statcanOriginalPage: true },
  { id: "statcan_labour", category: "macro", media: "atom",
    url: "https://www150.statcan.gc.ca/n1/rss/dai-quo/14-eng.atom",
    allowedHosts: ["www150.statcan.gc.ca", "www.statcan.gc.ca"], credit: "Statistics Canada", statcanOriginalPage: true },
  // Eurostat's official Atom feed of economy-and-finance NEWS RELEASES,
  // not the dataset-update RSS whose timestamps reflect data operations.
  { id: "eurostat_economy_release", category: "macro", media: "atom",
    url: "https://ec.europa.eu/eurostat/en/search?_estatsearchportlet_WAR_estatsearchportlet_collection=CAT_PREREL&_estatsearchportlet_WAR_estatsearchportlet_theme=PER_ECOFIN&p_p_id=estatsearchportlet_WAR_estatsearchportlet&p_p_lifecycle=2&p_p_mode=view&p_p_resource_id=atom&p_p_state=maximized",
    allowedHosts: ["ec.europa.eu"], credit: "Eurostat" },
  // EIA's official Press Releases RSS (as linked on eia.gov/tools/rssfeeds).
  // These are US issuer-original dated macro/energy-cost observations ONLY.
  // Native RSS pubDate is not independently verified market impact, article
  // commercial rights, GRO/GRI certification or numerical inflation/FX data.
  { id: "eia_press_macro", category: "macro", media: "rss",
    url: "https://www.eia.gov/rss/press_rss.xml",
    allowedHosts: ["www.eia.gov"], credit: "U.S. Energy Information Administration" },
  // An additional independent central-bank cooperation and regulatory publisher,
  // using its officially documented first-party RSS native publication clock.
  // Do not use the provider's fetch time or its landing-page modification time.
  { id: "bis_press", category: "macro", media: "rss",
    url: "https://www.bis.org/doclist/all_pressrels.rss",
    allowedHosts: ["www.bis.org"], credit: "Bank for International Settlements" },
  // BLS names these .rss endpoints but serves Atom XML with original
  // <published> and <link href> metadata (verified on exact GitHub runner).
  // Never substitute <updated>, fetch time, or a current headline as clock.
  { id: "bls_cpi", category: "macro", media: "atom",
    url: "https://www.bls.gov/feed/cpi.rss",
    allowedHosts: ["www.bls.gov"], credit: null },
  { id: "bls_employment", category: "macro", media: "atom",
    url: "https://www.bls.gov/feed/empsit.rss",
    allowedHosts: ["www.bls.gov"], credit: null },
  { id: "bls_external_prices", category: "macro", media: "atom",
    url: "https://www.bls.gov/feed/ximpim.rss",
    allowedHosts: ["www.bls.gov"], credit: null },
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
  // Australian Resources Minister first-party HTML media index, separate from
  // the intermittently unreachable Industry Minister RSS; exact original
  // publication day is independently checked against the matched article.
  { id: "au_resources_macro_index", category: "macro", media: "html_index",
    url: "https://www.minister.industry.gov.au/king/media?type=media_releases",
    allowedHosts: ["www.minister.industry.gov.au"], credit: null },
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
  // Independent original news index; publisher-printed original day is
  // bound to the linked article heading before deriving a news observation.
  { id: "au_geoscience", category: "rare_earth", media: "html_index",
    url: "https://www.ga.gov.au/news",
    allowedHosts: ["www.ga.gov.au"], credit: null },
  // Reuse existing independently observed Australian minister original feed.
  // Free derived observation only; this is NOT rights-certified commercial GRO.
  { id: "au_industry_minister", category: "rare_earth", media: "rss",
    url: "https://www.minister.industry.gov.au/feed/t-ayres/rss.xml",
    allowedHosts: ["www.minister.industry.gov.au"], credit: null },
  { id: "au_resources_minerals_index", category: "rare_earth", media: "html_index",
    url: "https://www.minister.industry.gov.au/king/media?type=media_releases",
    allowedHosts: ["www.minister.industry.gov.au"], credit: null },
  { id: "uk_energy", category: "rare_earth", media: "atom",
    url: "https://www.gov.uk/government/organisations/department-for-energy-security-and-net-zero.atom",
    allowedHosts: ["www.gov.uk"], credit: OGL_CREDIT, govContentApi: true },
  // Official U.S. DOE news RSS already inventoried in the canonical free-source
  // update collector. Independent issuer from UK/Canada/EU; its generic news
  // is admitted only when native article publication and mineral topic match.
  { id: "us_doe_news_minerals", category: "rare_earth", media: "rss",
    url: "https://www.energy.gov/rss/energygov/2193718",
    allowedHosts: ["www.energy.gov"], credit: "U.S. Department of Energy" },
  // First-party fixed DOE HTML fallback. Never use page-crawl clock, never
  // add rights/independent corroboration or extra primary publisher traffic.
  { id: "us_doe_cmei_minerals_index", category: "rare_earth", media: "html_index",
    url: "https://www.energy.gov/cmm/critical-minerals-and-materials-program",
    allowedHosts: ["www.energy.gov"], credit: "U.S. Department of Energy" },
  // Actual publisher-issued RSS publication clocks; independent of the
  // EU DG GROW landing-page index and previous HTTP-403 mineral feed.
  { id: "eu_representation_news", category: "rare_earth", media: "rss",
    url: "https://luxembourg.representation.ec.europa.eu/node/27/rss_en",
    allowedHosts: ["luxembourg.representation.ec.europa.eu"], credit: null },
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

// Reuse the same international connector definitions in on-demand website
// reads and the protected half-hour update collector. Existing BIS is reused.
const GLOBAL_SOURCES:readonly StatelessSourceSpec[]=GLOBAL_OFFICIAL_RELEASE_FEEDS
  .filter((s:{websiteId?:string;url?:string;category?:string})=>
    !SOURCES.some(old=>old.id===s.websiteId ||
      (old.url===s.url && old.category===s.category)))
  .map(s=>({
    id:s.id,category:s.category,media:s.format==='rss'?'rss' as const:'html_index' as const,
    url:s.url,allowedHosts:[s.host],credit:s.credit,...(s.format==='json'?{govContentApi:true}:{}),
  }));

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
    const response = await fetchWithoutRedirect("https://www.gov.uk/api/content" + path, {
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
    "clock_found" | "clock_consistent" | "date_path_ok" |
    "calendar_ok" | "not_future" | "within_30d" | "original_ok") => void,
): Promise<StatelessSourceCandidate | null> {
  if (!source.canadaOriginalPage ||
      !/^https:\/\/www\.canada\.ca\/en\/(?:natural-resources-canada|global-affairs)\/news\/20\d{2}\/(?:0[1-9]|1[0-2])\/[a-z0-9-]+\.html$/u.test(candidate.articleUrl))
    return null;
  note?.("path_ok");
  try {
    const response=await fetchWithoutRedirect(candidate.articleUrl,{
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
    const originalBodyTopic=source.id==="nrcan_releases"?
      canadaOriginalMineralsTopic(html,candidate.articleUrl,candidate.title,now)??undefined:undefined;
    if(source.id==="nrcan_releases" && !originalBodyTopic &&
       !topicForOriginal(candidate.title,source.category,source.id,true))return null;
    // Preserve the original-day body topic unless the title itself proves
    // a valid exact-time category: the private NRCan body-topic contract
    // deliberately admits only day-precision source references.
    const titleClassified=topicForOriginal(candidate.title,source.category,source.id,false);
    const precise=titleClassified
      ?canadaOriginalPrecisePublicationTime(html,day,now):null;
    return {sourceId:source.id,category:source.category,title:candidate.title,
      articleUrl:candidate.articleUrl,publishedAt:precise??day,
      ...(precise?{}:{datePrecision:"day" as const}),
      ...(!precise&&originalBodyTopic?{originalBodyTopic}:{}),
      credit:source.credit};
  }catch{return null}
}


async function readStatcanDailyOriginalDay(
  candidate: { title: string; articleUrl: string },
  source: StatelessSourceSpec, now: number,
): Promise<StatelessSourceCandidate | null> {
  if (!source.statcanOriginalPage) return null;
  let canonical: string;
  try {
    const article = new URL(candidate.articleUrl);
    if (article.username || article.password || article.port || article.hash ||
        article.search || article.protocol !== "https:") return null;
    const isAlias = article.hostname === "www.statcan.gc.ca" &&
      /^\/daily-quotidien\/\d{6}\/dq\d{6}[a-z]-eng\.htm$/iu.test(article.pathname);
    const isCanonical = article.hostname === "www150.statcan.gc.ca" &&
      /^\/n1\/daily-quotidien\/\d{6}\/dq\d{6}[a-z]-eng\.htm$/iu.test(article.pathname);
    if (!isAlias && !isCanonical) return null;
    // Exact same official article path as the issuer's observed
    // canonical redirect, without following arbitrary redirects.
    canonical = isAlias
      ? "https://www150.statcan.gc.ca/n1" + article.pathname
      : article.href;
  } catch { return null; }
  try {
    const response = await fetchWithoutRedirect(canonical, {
      method: "GET", redirect: "error", cache: "no-store",
      headers: { Accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS),
    });
    if (!response.ok ||
        !/^text\/html(?:;|$)/iu.test(response.headers.get("content-type") ?? ""))
      return null;
    const html = await boundedText(response, 256 * 1024);
    if (!html) return null;
    const day = verifiedStatcanOriginalReleaseDay(html, canonical, candidate.title, now);
    if (!day) return null;
    return {
      sourceId: source.id, category: source.category, title: candidate.title,
      articleUrl: candidate.articleUrl, publishedAt: day,
      datePrecision: "day", credit: source.credit,
    };
  } catch { return null; }
}

/**
 * A bounded, same-publisher, opt-in HTTP feed redirect for the one fixed
 * Canadian government science RSS lane observed redirecting in production.
 * Never follow off-host/unknown-host or user-supplied URLs, never retry 403,
 * and never confuse a redirect or fetch clock with a publisher release time.
 */
export async function fetchFirstPartyOriginalFeed(
  source: StatelessSourceSpec,
  fetchImpl: typeof fetch = fetch,
): Promise<Response> {
  // Use the exact publicly verified BLS native Atom negotiation already
  // exercised by bls-atom-native-readonly-acceptance.yml. BLS emits Atom
  // from its .rss addresses; avoid generic content negotiation that can 406.
  const accepted = ["bls_cpi","bls_employment","bls_external_prices"].includes(source.id)
    ? "application/atom+xml,application/xml;q=0.9"
    : source.media === "rss"
      ? "application/rss+xml, application/xml, text/xml"
      : "application/atom+xml, application/xml, text/xml";
  let target = source.url;
  for (let hop = 0; hop <= 2; hop++) {
    // The Australian minister feed has intermittent transport timeouts.
    // Retry once ONLY on a real timeout from this fixed first-party feed:
    // never retry a 403/429, redirect, bad body or a user-controlled URL.
    const request = () => fetchImpl(target, {
      method: "GET", redirect: "manual", cache: "no-store",
      headers: { Accept: accepted },
      signal: AbortSignal.timeout(source.id === "au_industry_minister" ? 8_000 : TIMEOUT_MS),
    });
    let response: Response;
    try { response = await request(); }
    catch (error) {
      const name=error instanceof Error?error.name:"";
      if(source.id!=="au_industry_minister" || hop!==0 ||
         name!=="TimeoutError") throw error;
      response = await request();
    }
    // Only a confirmed missing/server-broken Fed All Press Releases
    // endpoint may use the separately published Fed monetary RSS. This is
    // ONE same-issuer substitute; never bypass 401/403/429, HTML WAF or
    // any off-domain redirect, and never treat it as independent evidence.
    if(source.id==="fed_press" && hop===0 &&
       source.url==="https://www.federalreserve.gov/feeds/press_all.xml" &&
       target===source.url &&
       (response.status===404||response.status>=500&&response.status<=599)){
      await response.body?.cancel().catch(()=>undefined);
      target="https://www.federalreserve.gov/feeds/press_monetary.xml";
      continue;
    }
    if (![301, 302, 307, 308].includes(response.status)) return response;
    // UN Geneva's published RSS index currently issues an HTTP redirect.
    // Allow ONLY its exact canonical /en feed, one hop, on the SAME issuer
    // HTTPS host. A redirect cannot qualify any article or publication clock.
    if(source.id==="ungeneva_press_global" && hop===0 &&
       target==="https://www.ungeneva.org/news-media/press-releases-list/rss.xml" &&
       source.url===target &&
       source.allowedHosts.length===1 &&
       source.allowedHosts[0]==="www.ungeneva.org"){
      const location=response.headers.get("location");
      if(!location||location.length>320)return response;
      let next:URL;
      try{next=new URL(location,target);}catch{return response;}
      if(next.href!=="https://www.ungeneva.org/en/news-media/press-releases-list/rss.xml"||
         next.search||next.hash||next.username||next.password||next.port)return response;
      await response.body?.cancel().catch(()=>undefined);
      target=next.href;
      continue;
    }
    // Unrelated providers are never granted a new redirect privilege.
    if (source.id !== "nrcan_science" || hop === 2) return response;
    const location = response.headers.get("location");
    if (!location || location.length > 1600) return response;
    let next: URL;
    try { next = new URL(location, target); } catch { return response; }
    if (next.protocol !== "https:" || next.username || next.password ||
        next.port || next.hash || next.pathname.startsWith("//") ||
        !source.allowedHosts.includes(next.hostname.toLowerCase()) ||
        !/\/(?:[^?#]{0,250}\/)?(?:rss(?:\.xml)?|feed(?:\.xml)?|atom(?:\.xml)?)$/iu.test(next.pathname))
      return response;
    if (next.href === target) return response;
    target = next.href;
  }
  throw Error("SOURCE_REDIRECT_BOUND_EXCEEDED");
}
type LaneMetrics = {
  seen: number; relevant: number; original_link_valid: number;
  native_clock_valid: number; undated_original: number;
  recovered_original_page: number; transport_ok: boolean;
  transport_failure_class?: "http_4xx" | "http_5xx" | "mime" | "body" | "timeout" | "redirect" | "network";
  // Fixed XML envelope counts only, no payload/title/URL leak in CI.
  feed_envelope?: "rss" | "atom" | "rdf" | "other";
  feed_item_count?: number;
  feed_entry_count?: number;
  feed_doctype_seen?: boolean;
  feed_native_pubdate_count?: number;
  feed_dc_date_count?: number;
  feed_dc_issued_count?: number;
  feed_native_published_count?: number;
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
  canada_original_calendar_ok?: number;
  canada_original_not_future?: number;
  canada_original_within_30d?: number;
};
async function readSource(source: StatelessSourceSpec, now: number,
  sharedResources?: RunScopedAustralianResourcesFetch): Promise<{
  candidates: StatelessSourceCandidate[]; healthy: boolean;
  metrics?: LaneMetrics;
}> {
  const failed = (kind: NonNullable<LaneMetrics["transport_failure_class"]>) => ({
    candidates: [] as StatelessSourceCandidate[], healthy: false,
    metrics: { seen: 0, relevant: 0, original_link_valid: 0,
      native_clock_valid: 0, undated_original: 0, recovered_original_page: 0,
      transport_ok: false, transport_failure_class: kind } satisfies LaneMetrics,
  });
  if(source.id.startsWith('govuk_global_')){
    try{
      const response=await fetchWithoutRedirect(source.url,{redirect:'error',headers:{Accept:'application/json'},signal:AbortSignal.timeout(TIMEOUT_MS)});
      const body=await boundedText(response,192*1024);if(!body)return {healthy:false,candidates:[]};
      const data=JSON.parse(body);if(!Array.isArray(data.results)||!Number.isFinite(data.total))return {healthy:false,candidates:[]};
      const spec=GLOBAL_OFFICIAL_RELEASE_FEEDS.find((s:{id:string})=>s.id===source.id);
      const seen=new Set<string>();
      const leads=data.results.slice(0,10).flatMap((row:{title?:unknown;link?:unknown})=>{
        if(!spec||typeof row.title!=='string'||typeof row.link!=='string'||row.title.length>300||/[<>]/u.test(row.title)||!spec.topic.test(row.title)||!row.link.startsWith('/government/'))return [];
        const articleUrl=globalOriginalArticleUrl('https://www.gov.uk'+row.link,spec);
        if(!articleUrl||seen.has(articleUrl))return [];seen.add(articleUrl);
        return [{title:row.title,articleUrl}];
      }).slice(0,4);
      // Search public_timestamp is an index clock. Independently read each
      // exact originating Content API first_published_at before derivation.
      const recovered=await Promise.all(leads.map((lead:{title:string;articleUrl:string})=>readGovContentOriginalDate(lead,source,now)));
      const candidates=recovered.filter((x:StatelessSourceCandidate|null):x is StatelessSourceCandidate=>x!==null);
      return {healthy:true,candidates,metrics:{seen:data.results.length,relevant:leads.length,original_link_valid:leads.length,native_clock_valid:candidates.length,undated_original:leads.length,recovered_original_page:candidates.length,transport_ok:true}};
    }catch{return {healthy:false,candidates:[]};}
  }
  if(source.id==='iea_minerals_global'){
    try{
      const response=await fetchWithoutRedirect(source.url,{redirect:'error',headers:{Accept:'text/html'},signal:AbortSignal.timeout(TIMEOUT_MS)});
      if(!response.ok)return failed(response.status>=500?'http_5xx':'http_4xx');
      if(!/^text\/html(?:;|$)/iu.test(response.headers.get('content-type')??''))return failed('mime');
      const html=await boundedText(response,MAX_FEED_BYTES);
      if(!html)return failed('body');
      const indexed=ieaMineralsIndexCandidates(html).slice(0,2);
      const rows=await Promise.all(indexed.map(async(candidate:{title:string;articleUrl:string})=>{
        try{
          const response=await fetchWithoutRedirect(candidate.articleUrl,{redirect:'error',headers:{Accept:'text/html'},signal:AbortSignal.timeout(TIMEOUT_MS)});
          const body=await boundedText(response,MAX_FEED_BYTES);
          const date=body?verifiedIeaOriginalPublication(body,candidate,new Date(now),STATELESS_LOOKBACK_MS):null;
          return date?{...candidate,sourceId:source.id,category:source.category,publishedAt:date,credit:source.credit}:null;
        }catch{return null;}
      }));
      const candidates=rows.filter((x):x is StatelessSourceCandidate=>x!==null);
      return {healthy:true,candidates,metrics:{seen:indexed.length,relevant:indexed.length,original_link_valid:indexed.length,native_clock_valid:candidates.length,undated_original:0,recovered_original_page:candidates.length,transport_ok:true}};
    }catch(error){
      const e=error instanceof Error?error:null;
      return failed(e?.name==="TimeoutError"||e?.name==="AbortError"?"timeout":"network");
    }
  }
  if(source.id==="us_doe_cmei_minerals_index"&&source.media==="html_index"){
    try{
      const response=await fetchWithoutRedirect(source.url,{
        method:"GET",redirect:"error",cache:"no-store",
        headers:{Accept:"text/html"},signal:AbortSignal.timeout(TIMEOUT_MS)});
      if(!response.ok)return failed(response.status>=500?"http_5xx":"http_4xx");
      if(!/^text\/html(?:;|$)/iu.test(response.headers.get("content-type")??""))
        return failed("mime");
      const html=await boundedText(response,512*1024);
      if(!html)return failed("body");
      const indexed=doeMineralsIndexCandidates(html,now);
      const checks=await Promise.all(indexed.slice(0,2).map(async original=>{
        try{
          const r=await fetchWithoutRedirect(original.articleUrl,{
            method:"GET",redirect:"error",cache:"no-store",
            headers:{Accept:"text/html"},signal:AbortSignal.timeout(TIMEOUT_MS)});
          if(!r.ok||!/^text\/html(?:;|$)/iu.test(r.headers.get("content-type")??""))
            return null;
          const article=await boundedText(r,256*1024);
          return article&&doeMineralsOriginalArticleMatches(article,original)?
            original:null;
        }catch{return null}
      }));
      const verified=checks.filter((x):x is StatelessSourceCandidate=>x!==null);
      return {healthy:true,candidates:verified,metrics:{
        seen:indexed.length,relevant:indexed.length,
        original_link_valid:indexed.length,native_clock_valid:verified.length,
        undated_original:0,recovered_original_page:verified.length,
        transport_ok:true,
      }};
    }catch(error){
      const e=error instanceof Error?error:null;
      return failed(e?.name==="TimeoutError"||e?.name==="AbortError"?"timeout":"network");
    }
  }
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
      const response = await fetchWithoutRedirect(source.url, {
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

  if ((source.id === "au_resources_macro_index" ||
       source.id === "au_resources_minerals_index" ||
       source.id === "au_resources_geopolitics_index") &&
      source.media === "html_index") {
    try {
      const response = sharedResources
        ? await sharedResources.fetch(source.url)
        : await fetchWithoutRedirect(source.url, {
          method: "GET", redirect: "error", cache: "no-store",
          headers: { Accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS),
        });
      if (!response.ok) return failed(response.status >= 500 ? "http_5xx" : "http_4xx");
      if (!/^text\/html(?:;|$)/iu.test(response.headers.get("content-type") ?? ""))
        return failed("mime");
      const html = await boundedText(response, 512 * 1024);
      if (!html) return failed("body");
      const indexed = australianResourcesIndexCandidates(html, source.category, now);
      const verified = await Promise.all(indexed.map(async candidate => {
        try {
          const article = sharedResources
            ? await sharedResources.fetch(candidate.articleUrl)
            : await fetchWithoutRedirect(candidate.articleUrl, {
              method: "GET", redirect: "error", cache: "no-store",
              headers: { Accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS),
            });
          if (!article.ok ||
              !/^text\/html(?:;|$)/iu.test(article.headers.get("content-type") ?? ""))
            return null;
          const text = await boundedText(article, 256 * 1024);
          return text && verifyAustralianResourcesOriginalArticle(text, candidate, now)
            ? candidate : null;
        } catch { return null; }
      }));
      const accepted = verified.filter((x): x is StatelessSourceCandidate => x !== null);
      return { healthy: true, candidates: accepted,
        metrics: { seen: indexed.length, relevant: indexed.length,
          original_link_valid: indexed.length, native_clock_valid: accepted.length,
          undated_original: 0, recovered_original_page: accepted.length,
          transport_ok: true },
      };
    } catch (error) {
      const e = error instanceof Error ? error : null;
      return failed(e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network");
    }
  }
  if (source.id === "au_geoscience" && source.media === "html_index") {
    try {
      const response = await fetchWithoutRedirect(source.url, {
        method: "GET", redirect: "error", cache: "no-store",
        headers: { Accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS),
      });
      if (!response.ok) return failed(response.status >= 500 ? "http_5xx" : "http_4xx");
      if (!/^text\/html(?:;|$)/iu.test(response.headers.get("content-type") ?? ""))
        return failed("mime");
      const html = await boundedText(response, 512 * 1024);
      if (!html) return failed("body");
      const indexed = australianNewsIndexCandidates(html, now);
      const recovered = await Promise.all(indexed.slice(0, 6).map(async candidate => {
        try {
          const article = await fetchWithoutRedirect(candidate.articleUrl, {
            method: "GET", redirect: "error", cache: "no-store",
            headers: { Accept: "text/html" }, signal: AbortSignal.timeout(TIMEOUT_MS),
          });
          if (!article.ok ||
              !/^text\/html(?:;|$)/iu.test(article.headers.get("content-type") ?? "")) return null;
          const body = await boundedText(article, 256 * 1024);
          return body && australianArticleMatchesOriginal(body, candidate.title)
            ? candidate : null;
        } catch { return null; }
      }));
      const verified = recovered.filter((value): value is StatelessSourceCandidate => value !== null);
      return { healthy: true, candidates: verified,
        metrics: { seen: indexed.length, relevant: indexed.length,
          original_link_valid: indexed.length, native_clock_valid: verified.length,
          undated_original: 0, recovered_original_page: verified.length,
          transport_ok: true },
      };
    } catch (error) {
      const e = error instanceof Error ? error : null;
      return failed(e?.name === "TimeoutError" || e?.name === "AbortError" ? "timeout" : "network");
    }
  }
  try {
    const response = await fetchFirstPartyOriginalFeed(source);
    if (response.status >= 300 && response.status < 400) return failed("redirect");
    if (!response.ok) return failed(response.status >= 500 ? "http_5xx" : "http_4xx");
    const mime = response.headers.get("content-type") ?? "";
    if (!/^(?:application\/(?:rss\+xml|atom\+xml|xml)|text\/xml)(?:;|$)/iu.test(mime))
      return failed("mime");
    const xml = await boundedText(response, MAX_FEED_BYTES);
    if (!xml) return failed("body");
    const parsed = parseFirstPartyFeed(xml, source, now);
    const canadaStage = {path_ok:0,http_ok:0,html_ok:0,original_ok:0,
      title_ok:0,clock_found:0,clock_consistent:0,date_path_ok:0,
      calendar_ok:0,not_future:0,within_30d:0};
    const recovered = await Promise.all(parsed.undatedGov.slice(0,
      source.canadaOriginalPage ? 8 : source.statcanOriginalPage ? 2 : 4)
      .map(candidate => source.statcanOriginalPage
        ? readStatcanDailyOriginalDay(candidate, source, now)
        : source.canadaOriginalPage
          ? readCanadaNewsOriginalDay(candidate, source, now, stage => {canadaStage[stage]++;})
          : readGovContentOriginalDate(candidate, source, now)));
    return { healthy: true,
      candidates: [...parsed.dated, ...recovered.filter((x): x is StatelessSourceCandidate => x !== null)],
      metrics: { ...parsed.metrics, recovered_original_page: recovered.filter(Boolean).length, transport_ok: true,
        feed_envelope: /<rss(?:\s|>)/iu.test(xml) ? "rss" :
          /<(?:atom:)?feed(?:\s|>)/iu.test(xml) ? "atom" :
          /<rdf:RDF(?:\s|>)/iu.test(xml) ? "rdf" : "other",
        feed_item_count: [...xml.matchAll(/<item(?:\s[^>]*)?>/giu)].length,
        feed_entry_count: [...xml.matchAll(/<(?:atom:)?entry(?:\s[^>]*)?>/giu)].length,
        feed_doctype_seen: /<!DOCTYPE|<!ENTITY/iu.test(xml),
        feed_native_pubdate_count: [...xml.matchAll(/<pubDate(?:\s[^>]*)?>/giu)].length,
        feed_dc_date_count: [...xml.matchAll(/<dc:date(?:\s[^>]*)?>/giu)].length,
        feed_dc_issued_count: [...xml.matchAll(/<(?:dc:issued|dcterms:issued)(?:\s[^>]*)?>/giu)].length,
        feed_native_published_count: [...xml.matchAll(/<published(?:\s[^>]*)?>/giu)].length,
        ...(source.canadaOriginalPage ? {
          canada_original_path_ok:canadaStage.path_ok,
          canada_original_http_ok:canadaStage.http_ok,
          canada_original_html_ok:canadaStage.html_ok,
          canada_original_date_ok:canadaStage.original_ok,
          canada_title_ok:canadaStage.title_ok,
          canada_original_clock_found:canadaStage.clock_found,
          canada_original_clock_consistent:canadaStage.clock_consistent,
          canada_original_date_path_ok:canadaStage.date_path_ok,
          canada_original_calendar_ok:canadaStage.calendar_ok,
          canada_original_not_future:canadaStage.not_future,
          canada_original_within_30d:canadaStage.within_30d,
        } : {}),
      },
    };
  } catch (error) {
    const e = error instanceof Error ? error : null;
    const reason = e?.name === "TimeoutError" || e?.name === "AbortError"
      ? "timeout" : /redirect/i.test(e?.message ?? "") ? "redirect" : "network";
    return failed(reason);
  }
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
  primary_healthy_feed_count?:number;
  recent_primary_release_count?:number;
  // Safe issuer-ID-only diagnostic; no article URL/title/bytes or secrets.
  primary_publisher_status?:Array<{id:string;reachable:boolean;native_candidate_count:number;recent_release_count:number}>;
  fallback_publisher_status?:Array<{id:string;reachable:boolean;native_candidate_count:number}>;
  fallback_reason?:"PRIMARY_TRANSPORT_UNAVAILABLE"|"NO_RECENT_QUALIFYING_PRIMARY_RELEASE"|null;
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
  onPrivateOriginals?: (candidates:readonly StatelessSourceCandidate[])=>void,
  maxSignals=50,
  sharedResources?: RunScopedAustralianResourcesFetch,
): Promise<StatelessIntelligenceResult> {
  if (!["geopolitics", "macro", "rare_earth"].includes(category) ||
      !Number.isFinite(now)) throw Error("STATELESS_INTELLIGENCE_CATEGORY_OR_CLOCK_INVALID");
  const sourceGroup = [...SOURCES,...GLOBAL_SOURCES].filter(source => source.category === category);
  // BLS publishes three native Atom feeds on the same host. Its live runner
  // acceptance succeeds with sequential requests, while wide concurrent
  // website collection has shown intermittent first-party HTTP 4xx. Serialize
  // only these fixed official lanes, preserving the canonical lane indexes and
  // parallel execution of all unrelated sources. Never retry an HTTP refusal.
  const blsIds = new Set(["bls_cpi","bls_employment","bls_external_prices"]);
  let previousBls:Promise<void> = Promise.resolve();
  const batch = await Promise.all(sourceGroup.map(source => {
    if(!blsIds.has(source.id))return readSource(source,now,sharedResources);
    const next=previousBls.then(()=>readSource(source,now,sharedResources));
    previousBls=next.then(()=>undefined);
    return next;
  }));
  // The optional callback is used only by the private acceptance runner;
  // no publisher identity, URL or diagnostic lane details reach the browser.
  if (onLaneDiagnostic) batch.forEach((lane, index) => onLaneDiagnostic(index,
    lane.metrics ?? { seen: 0, relevant: 0, original_link_valid: 0,
      native_clock_valid: 0, undated_original: 0,
      recovered_original_page: 0, transport_ok: false }));
  const allOriginals=batch.flatMap(x=>x.candidates);
  // A new global index can surface an article already admitted by an older
  // issuer feed. Keep the established card identity and count that exact
  // original once; the added search is not independent corroboration.
  const legacyUrls=new Set(allOriginals.filter(c=>SOURCES.some(s=>s.id===c.sourceId)).map(c=>c.articleUrl));
  const addedIds=new Set(GLOBAL_SOURCES.map(s=>s.id));
  const originalCandidates=allOriginals.filter(c=>!addedIds.has(c.sourceId)||!legacyUrls.has(c.articleUrl));
  // This callback is PRIVATE to trusted server-side operators. Never add it
  // to StatelessIntelligenceResult or public derived-news D1 payloads.
  onPrivateOriginals?.(originalCandidates);
  const signals = deriveStatelessSignals(originalCandidates, now,{maxSignals});
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


// A narrowly scoped rapid-response ORIGINAL publisher lane. This is not 195
// local publishers or a guarantee of one published story every five minutes.
// Source specs, RSS/Atom parsing, source-native clocks, credits, zero-added-delay
// delay, and Geomacro-authored text all come from the EXISTING canonical
// first-party reader; do not construct a new license-agnostic news crawler.
export const FIVE_MINUTE_NEWS_FASTLANE = Object.freeze([
  // Distinct official issuer channels, strictly limited to source-native
  // publication dates and source-owned original article URLs. A transport
  // success cannot unlock payment/signatures/GRI or imply 195x3 coverage.
  {category:"geopolitics",id:"un_news"},
  {category:"geopolitics",id:"uk_fcdo"},
  {category:"geopolitics",id:"un_press_global"},
  // EU Council: issuer-original EU Council policy and foreign affairs releases.
  // Individual third-party copyright exceptions remain excluded from reuse.
  {category:"geopolitics",id:"eu_council_press_original"},
  // Main production proved NZ Beehive returned HTML on ALL six official
  // feed paths. Promote three previously reachable independent government/
  // multilateral source adapters instead, preserving strict native clocks.
  // The blocked Beehive remains in the source registry for reassessment.
  {category:"geopolitics",id:"canada_foreign_statements"},

  {category:"macro",id:"fed_press"},
  {category:"macro",id:"wto_trade_original_rss"},
  {category:"macro",id:"ecb_press"},
  {category:"macro",id:"boc_press_global"},
  {category:"macro",id:"bis_press"},
  // GOV.UK Search API is discovery only; every UK release must separately
  // resolve its originating page and Content API first_published_at.
  {category:"macro",id:"govuk_global_economy"},

  {category:"rare_earth",id:"nrcan_releases"},
  {category:"rare_earth",id:"us_doe_news_minerals"},
  {category:"rare_earth",id:"bc_minerals_global"},
  {category:"rare_earth",id:"uk_dbt"},
  {category:"rare_earth",id:"govuk_global_minerals"},
] as const);
export const FASTLANE_MAX_PRIMARY_FEEDS_PER_RUN=16 as const;
/**
 * Conditional first-party alternatives, only if EVERY primary issuer within
 * that category failed transport or has no qualifying recent release.
 * no new credential/rights model, no raw redistribution.
 * Different origin families reduce the correlated-outage risk.
 */
export const FIVE_MINUTE_NEWS_FALLBACK=Object.freeze([
  {category:"geopolitics",id:"ungeneva_press_global"},
  {category:"macro",id:"boj_press_global"},
  {category:"rare_earth",id:"iea_minerals_global"},
] as const);
export const FASTLANE_MAX_FALLBACK_READS_PER_RUN=3 as const;
// Reuse existing original publishers, one alternative per quiet domain.
export const FIVE_MINUTE_NEWS_FALLBACK_ROTATION=Object.freeze({
 // Existing official first-party alternatives, each distinct from EVERY
 // primary in its own category. Do not double-poll newly promoted primaries.
 geopolitics:["ungeneva_press_global","uk_ofsi_sanctions"],
 macro:["boj_press_global","un_news_economy"],
 rare_earth:["iea_minerals_global","un_news_minerals","au_geoscience","us_doe_cmei_minerals_index"],
} as const);
export function selectFiveMinuteFallback(category:keyof typeof FIVE_MINUTE_NEWS_FALLBACK_ROTATION,now:number){
 if(!Number.isFinite(now)||!Object.hasOwn(FIVE_MINUTE_NEWS_FALLBACK_ROTATION,category))
   throw Error("ORIGINAL_FASTLANE_FALLBACK_CLOCK_OR_CATEGORY_INVALID");
 const ids=FIVE_MINUTE_NEWS_FALLBACK_ROTATION[category],slot=Math.floor(now/(5*60_000));
 return {category,id:ids[((slot%ids.length)+ids.length)%ids.length]};
}
export const FASTLANE_RECENT_RELEASE_MS=60*60_000;
export function recentFastlaneReleaseCount(candidates:readonly StatelessSourceCandidate[],now:number,maxSignals=20){
 return deriveStatelessSignals([...candidates],now,{maxSignals}).filter(s=>
   s.date_precision==="exact"&&Date.parse(s.published_at)>=now-FASTLANE_RECENT_RELEASE_MS).length;
}
export function decideFiveMinuteFallbackCategories(
  primary: readonly {category:string;healthy:boolean;recent_releases?:number}[],
): Array<"geopolitics"|"macro"|"rare_earth"> {
  const domains=["geopolitics","macro","rare_earth"] as const;
  if(!Array.isArray(primary)||
     primary.some(x=>!x||!domains.includes(x.category as typeof domains[number])||
       typeof x.healthy!=="boolean"||
       (x.recent_releases!==undefined&&(!Number.isSafeInteger(x.recent_releases)||
         x.recent_releases<0||x.recent_releases>40))))
    throw Error("ORIGINAL_FASTLANE_PRIMARY_HEALTH_INVALID");
  return domains.filter(category=>
    primary.some(x=>x.category===category)&&
    (!primary.some(x=>x.category===category&&x.healthy)||
     primary.filter(x=>x.category===category).every(x=>x.recent_releases===0)));
}
export async function readFiveMinuteNewsFastlane(now=Date.now(),maxSignals=20,
 onPrivateOriginalCandidates?:(candidates:readonly StatelessSourceCandidate[])=>void,
 dependencies:{readPinnedSource?:typeof readSource}={}):
 Promise<StatelessIntelligenceResult[]>{
 if(!Number.isFinite(now)||!Number.isSafeInteger(maxSignals)||
    maxSignals<1||maxSignals>40)throw Error("ORIGINAL_FASTLANE_CLOCK_OR_BUDGET_INVALID");
 // Strict original-source budget; global additions must reuse the existing
 // allowlisted issuer-date and article-path parser, never generic RSS URLs.
 if(FIVE_MINUTE_NEWS_FASTLANE.length>FASTLANE_MAX_PRIMARY_FEEDS_PER_RUN)
   throw Error("ORIGINAL_FASTLANE_PRIMARY_REQUEST_BUDGET_EXCEEDED");
 const officialSources=[...SOURCES,...GLOBAL_SOURCES];
 const selected=FIVE_MINUTE_NEWS_FASTLANE.map(({category,id})=>{
   const matches=officialSources.filter(s=>s.id===id && s.category===category);
   if(matches.length!==1)throw Error("ORIGINAL_FASTLANE_PINNED_PUBLISHER_INVALID");
   return {category,source:matches[0]};
 });
 // One unreachable origin must not suppress healthy independent publishers.
 // Do not let a rare parsing exception escape Promise.all and cancel other
 // categories; a health=false lane is still correctly reported as degraded.
 const safely=(source:StatelessSourceSpec)=>(dependencies.readPinnedSource
   ?dependencies.readPinnedSource(source,now):readSource(source,now))
   .catch(()=>({candidates:[] as StatelessSourceCandidate[],healthy:false}));
 const batches=await Promise.all(selected.map(({source})=>safely(source)));
 // Reachable feeds with no recent qualifying release cannot satisfy the
 // near-realtime lane. Try one existing alternative without declaring the
 // healthy primary down, widening clocks, or adding an unbounded search.
 const primaryHealth=selected.map((p,i)=>({category:p.category,healthy:batches[i].healthy,
   recent_releases:recentFastlaneReleaseCount(batches[i].candidates,now,maxSignals)}));
 // The existing aggregate 4/5,5/6,4/5 production receipt cannot identify
 // which issuer needs a free substitute. Emit PUBLIC allowlist IDs and counts
 // only; never return private original article URLs or issuer headline text.
 const primaryPublisherStatus=selected.map((p,i)=>({
   category:p.category,id:p.source.id,reachable:batches[i].healthy,
   native_candidate_count:batches[i].candidates.length,
   recent_release_count:primaryHealth[i].recent_releases,
 }));
 const fallbackCategories=decideFiveMinuteFallbackCategories(
   primaryHealth);
 const fallbackSelected=fallbackCategories.map(category=>{
   const entry=selectFiveMinuteFallback(category,now);
   const matches=officialSources.filter(s=>s.id===entry.id&&s.category===entry.category);
   if(matches.length!==1)throw Error("ORIGINAL_FASTLANE_FALLBACK_PUBLISHER_INVALID");
   return {category,source:matches[0]};
 });
 if(fallbackSelected.length>FASTLANE_MAX_FALLBACK_READS_PER_RUN)
   throw Error("ORIGINAL_FASTLANE_FALLBACK_BUDGET_EXCEEDED");
 const fallbackBatches=await Promise.all(fallbackSelected.map(
   ({source})=>safely(source)));
 // Retain the EXISTING bounded three-domain derivation, original dates,
 // source credits, privacy and source-native future-clock rejection.
 const domains=["geopolitics","macro","rare_earth"] as const;
 return domains.map(category=>{
   const scopes=[
     ...selected.flatMap((p,i)=>p.category===category?[batches[i]]:[]),
     ...fallbackSelected.flatMap((p,i)=>
       p.category===category?[fallbackBatches[i]]:[]),
   ];
   const candidates=scopes.flatMap(b=>b.candidates);
   // Private producer IPC only; never add originals to the public result.
   onPrivateOriginalCandidates?.(candidates);
   const signals=deriveStatelessSignals(candidates,now,{maxSignals});
   const healthy=scopes.filter(b=>b.healthy).length;
   return {
     schema:"geomacro.website-stateless-intelligence.v1",
     category,checked_at:new Date(now).toISOString(),
     website_release_cutoff:new Date(now-STATELESS_WEBSITE_DELAY_MS).toISOString(),
     earliest_original:new Date(now-STATELESS_LOOKBACK_MS).toISOString(),
     releases_examined:candidates.length,feed_count:scopes.length,
     healthy_feed_count:healthy,
     primary_healthy_feed_count:primaryHealth.filter(p=>p.category===category&&p.healthy).length,
     recent_primary_release_count:primaryHealth.filter(p=>p.category===category)
       .reduce((n,p)=>n+p.recent_releases,0),
     primary_publisher_status:primaryPublisherStatus.filter(p=>p.category===category)
       .map(({id,reachable,native_candidate_count,recent_release_count})=>
         ({id,reachable,native_candidate_count,recent_release_count})),
     fallback_publisher_status:fallbackSelected.flatMap((p,i)=>p.category===category?
       [{id:p.source.id,reachable:fallbackBatches[i].healthy,
         native_candidate_count:fallbackBatches[i].candidates.length}]:[]),
     fallback_reason:fallbackCategories.includes(category)?
       primaryHealth.some(p=>p.category===category&&p.healthy)?
         "NO_RECENT_QUALIFYING_PRIMARY_RELEASE":"PRIMARY_TRANSPORT_UNAVAILABLE":null,
     current_24h_count:signals.filter(s=>Date.parse(s.published_at)>=now-86400000).length,
     last_7d_count:signals.filter(s=>Date.parse(s.published_at)>=now-7*86400000).length,
     last_30d_count:signals.length,
     status:signals.length>0?"official_observations_available":
       healthy>0?"no_eligible_original_releases":"sources_unavailable",
     signals,persistent_storage:false,publisher_title_redistributed:false,
     signed_risk_score_generated:false,independent_same_event_verification:false,
   };
 });
}
