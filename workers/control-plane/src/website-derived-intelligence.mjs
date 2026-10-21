/**
 * Free website-only rolling derived-news journal. Independent of Supabase,
 * B2 hot-snapshot/commercial checks, signed GRO and x402.
 * Never persist upstream title, URL, article text, publisher id or raw feed.
 * Exact public original-time delay is rechecked on write AND on every read.
 */
// The founder-approved auto-ingest journal is strictly a rolling 72h window.
// Old signed Finds/B2 archival products are independent (not reclassified here).
export const AUTO_INGEST_RETENTION_MS = 72 * 60 * 60_000;
// Backward compatible verification of separately signed historical Finds.
// ONLY the auto-ingest journal below has the founder-approved 72h TTL.
const LOOKBACK_MS = 30 * 86400_000;
const DELAY_MS = 15 * 60_000;
const CATEGORIES = new Set(["geopolitics", "macro", "rare_earth"]);
const TOPICS = new Set(["sanctions and trade restrictions","security and diplomacy",
  "geopolitical security","foreign policy","banking and capital regulation",
  "monetary policy","inflation and prices",
  "FX and external balances","financial conditions","trade and economic relations",
  "official economic statistics","energy supply and cost outlook",
  "resources and energy export outlook","international trade measures and disputes","rare-earth supply",
  "critical-mineral inputs","critical-minerals policy",
  "mineral exploration and production",
  "geopolitical publisher candidate","macro publisher candidate",
  "minerals publisher candidate"]);
const SIGNAL_KEYS = new Set(["id","category","title","why_it_matters","topic",
  "what_changed","geography","development_type","published_at","date_precision",
  "observed_release_count","sources_credited","status",
  "same_event_corrob_verified","severity"]);
const json = (data, status=200) => Response.json(data, {status, headers:{
  "Cache-Control":"no-store", "X-Content-Type-Options":"nosniff",
  "Referrer-Policy":"no-referrer", "Access-Control-Allow-Origin":"*",
}});
function originalTime(s, now) {
  if (s.date_precision === "day") {
    if (!/^\d{4}-\d{2}-\d{2}$/u.test(s.published_at) ||
        !["rare_earth","geopolitics","macro"].includes(s.category)) return null;
    const date = Date.parse(s.published_at+"T00:00:00.000Z");
    if (!Number.isFinite(date) || new Date(date).toISOString().slice(0,10)!==s.published_at)
      return null;
    return {at:date,eligibleAt:date+36*60*60_000+DELAY_MS};
  }
  if (s.date_precision !== "exact" || typeof s.published_at!=="string" ||
      !/^\d{4}-\d{2}-\d{2}T\d\d:\d\d:\d\d(?:\.\d+)?Z$/u.test(s.published_at))
    return null;
  const at = Date.parse(s.published_at);
  return Number.isFinite(at) ? {at,eligibleAt:at+DELAY_MS} : null;
}
function safeProse(s, limit, prefix=null) {
  return typeof s==="string" && s.length>=(prefix?prefix.length+8:25) &&
    s.length<=limit && (!prefix || s.startsWith(prefix)) &&
    !/[<>]/u.test(s) && !/(?:https?:\/\/|www\.|[a-z0-9_-]{4,}\.(?:com|org|gov|net)\/)/iu.test(s);
}
export function verifyDerivedStory(s, now=Date.now()) {
  if (!s || typeof s!=="object" || Array.isArray(s) ||
      Object.keys(s).some(key=>!SIGNAL_KEYS.has(key)) ||
      !CATEGORIES.has(s.category) ||
      typeof s.id!=="string" ||
      !/^(?:geopolitics|macro|rare_earth)-[0-9a-f]{8}$/u.test(s.id) ||
      !TOPICS.has(s.topic) ||
      !safeProse(s.title, 240, "Geomacro finds ") ||
      !safeProse(s.what_changed, 650) ||
      !safeProse(s.why_it_matters, 700) ||
      typeof s.development_type!=="string" || s.development_type.length>80 ||
      !(s.geography===null || typeof s.geography==="string"&&s.geography.length<=70) ||
      s.observed_release_count!==1 ||
      !((s.status==="official_release_observed_unscored" &&
          !s.topic.endsWith(" publisher candidate")) ||
        (s.status==="official_feed_candidate_unscored" &&
          ((s.category==="geopolitics"&&s.topic==="geopolitical publisher candidate")||
           (s.category==="macro"&&s.topic==="macro publisher candidate")||
           (s.category==="rare_earth"&&s.topic==="minerals publisher candidate")) &&
          s.development_type==="unclassified publisher update" &&
          s.geography===null)) ||
      s.same_event_corrob_verified!==false ||
      s.severity!==null ||
      !Array.isArray(s.sources_credited) || s.sources_credited.length>2 ||
      s.sources_credited.some(c=>typeof c!=="string"||c.length>230||/[<>]/u.test(c))
  ) return false;
  const time=originalTime(s,now);
  return Boolean(time && time.at <= now && time.at >= now-LOOKBACK_MS &&
    time.eligibleAt <= now);
}
export async function publishDerivedStories(env, body, now=Date.now()) {
  if (!body || body.schema!=="geomacro.website-derived-news-batch.v1" ||
      // An authenticated EMPTY batch is a legitimate hourly TTL sweep when
      // all publishers are quiet. No raw stories or unsigned products created.
      !Array.isArray(body.signals) || body.signals.length>50 ||
      body.signals.some(s=>!verifyDerivedStory(s,now) ||
        (originalTime(s,now)?.at??-Infinity)<now-AUTO_INGEST_RETENTION_MS)) {
    return json({ok:false,error:"DERIVED_NEWS_BATCH_INVALID"},400);
  }
  if (new Set(body.signals.map(s=>s.id)).size!==body.signals.length)
    return json({ok:false,error:"DERIVED_NEWS_DUPLICATE_IN_BATCH"},400);
  try {
    const statements=body.signals.map(s=>env.DB.prepare(
      "INSERT OR IGNORE INTO website_derived_intelligence (id,category,published_at,date_precision,story_json,first_seen_at) VALUES (?,?,?,?,?,?)"
    ).bind(s.id,s.category,s.published_at,s.date_precision,JSON.stringify(s),new Date(now).toISOString()));
    // D1 batch is atomic. An empty batch is still a retention sweep.
    if(statements.length)await env.DB.batch(statements);
    // Evict both expired original-publication records and records held longer
    // than 72h from FIRST ingestion. YYYY-MM-DD is used for SQL day precision;
    // verifyDerivedStory applies the precise 72h original-date cutoff.
    await env.DB.prepare("DELETE FROM website_derived_intelligence WHERE published_at < ? OR first_seen_at < ?")
      .bind(new Date(now-AUTO_INGEST_RETENTION_MS).toISOString().slice(0,10),
        new Date(now-AUTO_INGEST_RETENTION_MS).toISOString()).run();
    await env.DB.prepare(
      "DELETE FROM website_derived_intelligence WHERE id IN (SELECT id FROM website_derived_intelligence ORDER BY published_at DESC, id DESC LIMIT -1 OFFSET 600)"
    ).run();
    return json({ok:true,schema:"geomacro.website-derived-news-write-receipt.v1",
      accepted:body.signals.length,persistent_derived_only:true,chargeable:false});
  } catch {
    return json({ok:false,error:"DERIVED_NEWS_D1_WRITE_UNAVAILABLE"},503);
  }
}
export async function readDerivedStories(env,now=Date.now(),offset=0) {
  if(!Number.isSafeInteger(offset)||![0,250,500].includes(offset))
    return json({ok:false,error:"DERIVED_NEWS_PAGE_INVALID"},400);
  try {
    const {results=[]}=await env.DB.prepare(
      "SELECT story_json, first_seen_at FROM website_derived_intelligence WHERE published_at>=? AND first_seen_at>=? ORDER BY published_at DESC, id DESC LIMIT 251 OFFSET ?"
    ).bind(new Date(now-AUTO_INGEST_RETENTION_MS).toISOString().slice(0,10),
      new Date(now-AUTO_INGEST_RETENTION_MS).toISOString(),offset).all();
    const signals=[];
    const firstIngest=[];
    for (const row of results.slice(0,250)) {
      try {
        const signal=JSON.parse(row.story_json);
        if (verifyDerivedStory(signal,now) &&
            (originalTime(signal,now)?.at??-Infinity)>=now-AUTO_INGEST_RETENTION_MS) {
          // Audit provenance: server-generated D1 first insertion timestamp,
          // not upstream fetch time and not a claim that website was rendered.
          // Keep this OUTSIDE the strict source-neutral signal schema.
          const firstMs=Date.parse(row.first_seen_at);
          signals.push(signal);
          // NEVER drop a verified existing story merely because its metadata
          // was absent in a legacy row/test transport. The journal audit
          // separately fails closed for missing trusted first-ingest clocks.
          firstIngest.push({id:signal.id,
            first_seen_at:Number.isFinite(firstMs)&&firstMs<=now+60_000&&
              firstMs>=(originalTime(signal,now)?.eligibleAt??Infinity)
                ?new Date(firstMs).toISOString():null});
        }
      } catch { /* reject malformed row, never leak SQL metadata */ }
    }
    return json({ok:true,schema:"geomacro.website-derived-news-feed.v1",
      checked_at:new Date(now).toISOString(),
      original_release_delay_minutes:15,
      retention_days:3,retention_hours:72,
      delivery_scope:"free_website_only",
      scored:false,chargeable:false,supabase_dependency:false,
      page_offset:offset,page_size:250,has_more:results.length>250,
      next_offset:results.length>250&&offset<500?offset+250:null,
      ingest_clock_kind:"D1_FIRST_INSERT_NOT_WEBSITE_FIRST_RENDER",
      first_ingest:firstIngest,signals},200);
  } catch {
    return json({ok:false,error:"DERIVED_NEWS_FEED_UNAVAILABLE",
      chargeable:false,signals:[]},503);
  }
}


/**
 * Fail-visible, self-contained newsroom HTML from the SAME D1 rows. Embedded
 * on the website only while its Lovable SSR/server-function/client fetch
 * path has not produced cards. Browser loads Worker HTML directly, so a
 * broken TanStack RPC/SSR bridge cannot hide already verified historical news.
 * No script, no external CSS, and no upstream identity leaks.
 */
const escapeHtml = text => String(text ?? "").replace(/\s*\u2014\s*/gu,"; ")
  .replace(/&/gu,"&amp;").replace(/</gu,"&lt;").replace(/>/gu,"&gt;")
  .replace(/"/gu,"&quot;").replace(/'/gu,"&#39;");
export async function renderDerivedStoriesHtml(env,now=Date.now()){
  const response=await readDerivedStories(env,now);
  if(response.status!==200)return new Response(
    "<!doctype html><html><meta charset=utf-8><body><p>Intelligence timeline temporarily unavailable.</p></body></html>",
    {status:503,headers:{"Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store",
      "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors https://geomacro.live",
      "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff"}});
  const body=await response.json();
  const labels={geopolitics:"Geopolitics",macro:"Macro / FX",rare_earth:"Critical Minerals"};
  const records=body.signals.filter(s=>verifyDerivedStory(s,now)).slice(0,150);
  const stories=records.map(s=>'<article><div class="label">'+
    (s.status==="official_feed_candidate_unscored"?"SOURCE CANDIDATE · TOPIC UNVERIFIED":"GEOMACRO FINDS")+' · '+
    escapeHtml(labels[s.category])+' · <time>'+escapeHtml(s.published_at)+
    '</time></div><p class=label>Country or region: '+escapeHtml(s.geography??'Not specified in the release')+'</p><h2>'+escapeHtml(s.title.replace(/^Geomacro finds\s+/iu,''))+
    '</h2><section><div><strong>What changed</strong><p>'+escapeHtml(s.what_changed)+
    '</p></div><div><strong>Why it matters</strong><p>'+escapeHtml(s.why_it_matters)+
    '</p></div></section>'+s.sources_credited.map(credit=>'<p class=label>Required credit: '+escapeHtml(credit)+'</p>').join('')+'</article>').join("");
  const message=records.length===0?'<p>No eligible original-dated publisher releases in the current window.</p>':stories;
  const markup='<!doctype html><html lang="en"><head><meta charset="utf-8">'+
    '<meta name="viewport" content="width=device-width,initial-scale=1">'+
    '<title>Geomacro Finds | rolling derived Intelligence</title>'+
    '<style>body{margin:0;padding:4px;background:transparent;color:CanvasText;font:15px system-ui,sans-serif}'+
    'article{border:1px solid #9996;border-radius:14px;padding:20px;margin:0 0 14px;background:Canvas}'+
    '.label{font-size:11px;font-weight:700;letter-spacing:.06em;opacity:.85}'+
    'h2{font-size:20px;line-height:1.35;margin:10px 0}'+
    'section{display:grid;grid-template-columns:1fr 1fr;gap:16px}'+
    'strong{font-size:12px;letter-spacing:.04em;text-transform:uppercase}'+
    'p{line-height:1.6;margin:6px 0}'+
    '@media(max-width:600px){section{grid-template-columns:1fr}article{padding:15px}}'+
    '</style></head><body><main aria-label="Recent Geomacro-derived Intelligence">'+
    message+'</main></body></html>';
  return new Response(markup,{status:200,headers:{
    "Content-Type":"text/html; charset=utf-8","Cache-Control":"no-store",
    "Content-Security-Policy":"default-src 'none'; style-src 'unsafe-inline'; frame-ancestors https://geomacro.live",
    "Referrer-Policy":"no-referrer","X-Content-Type-Options":"nosniff",
  }});
}
