import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { createClient } from "@supabase/supabase-js";

const PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_KEY = "realtime_scope_mesh";
const BUCKET = "geomacro-live-intelligence";
const LOOKBACK_MINUTES = 25;
const BURST_MAX = Math.max(4, Math.min(32, Number(process.env.REALTIME_FANOUT_MAX_BURSTS ?? 16)));
const BURST_COOLDOWN_SECONDS = 10 * 60;
const FRESH_BREAK_SECONDS = 25 * 60;
const UA = "Geomacro-Realtime-Scope-Fanout/1.0 (+https://geomacro.live/)";

const CATEGORY_PATTERNS = {
  GEOPOLITICS: [
    /\bwar\b/i, /\barmed conflict\b/i, /\bmilitary\b/i, /\bmissile/i,
    /\bdrone/i, /\bairstrike/i, /\battack/i, /\bstrike/i, /\binvasion/i,
    /\bceasefire/i, /\btruce\b/i, /\bpeace talks?\b/i, /\bsanction/i,
    /\bembargo/i, /\bexport control/i, /\btariff/i, /\bcoup\b/i,
    /\bprotest/i, /\briot/i, /\bborder/i, /\bnavy\b/i, /\bmilitia/i,
    /\bsecurity council\b/i, /\bnato\b/i, /\bnuclear/i, /\bterror/i,
    /\bchokepoint/i, /\bmaritime security\b/i, /\bcyberattack/i,
    /\bransomware/i, /\binternet shutdown/i, /\bsubsea cable/i,
    /\bgnss\b/i, /\bgps interference/i, /\bgovernment collapse/i,
  ],
  MACRO: [
    /\binflation\b/i, /\bcpi\b/i, /\bppi\b/i, /\bgdp\b/i, /\brecession/i,
    /\bunemployment/i, /\bpayroll/i, /\binterest rate/i, /\brate hike/i,
    /\brate cut/i, /\bcentral bank/i, /\bmonetary policy/i, /\bcurrency/i,
    /\bforeign exchange\b/i, /\bforex\b/i, /\breserve(?:s)?\b/i,
    /\bsovereign debt\b/i, /\bdefault\b/i, /\bbond yield/i, /\bfiscal/i,
    /\bbank run\b/i, /\bbanking crisis\b/i, /\bliquidity/i, /\bpayment/i,
    /\btrade balance\b/i, /\bcurrent account\b/i, /\bcapital control/i,
    /\boil\b/i, /\bnatural gas\b/i, /\blng\b/i, /\benergy\b/i,
    /\bshipping\b/i, /\bport closure/i, /\bsupply chain\b/i, /\blogistics/i,
    /\bfood export/i, /\bfertilizer/i, /\bstrike\b/i, /\bwildfire/i,
    /\bflood/i, /\bcyclone/i, /\bhurricane/i, /\bearthquake/i,
    /\bdrought/i, /\bhealth emergency/i, /\boutbreak/i, /\bmigration/i,
    /\brefugee/i, /\btrade restriction/i, /\bcustoms/i,
  ],
  CRITICAL_MINERALS: [
    /\bcritical mineral/i, /\brare earth/i, /\blithium\b/i, /\bcobalt\b/i,
    /\bnickel\b/i, /\bgraphite\b/i, /\bcopper\b/i, /\bgallium\b/i,
    /\bgermanium\b/i, /\buranium\b/i, /\bneodymium\b/i, /\bpraseodymium\b/i,
    /\bdysprosium\b/i, /\bterbium\b/i, /\bmineral refining/i, /\bmineral processing/i,
    /\bmining\b/i, /\bore\b/i, /\bsmelter/i, /\bpermanent magnet/i,
    /\bstrategic mineral/i, /\bminerals? supply/i, /\bmineral export/i,
  ],
};

function projectRef(url) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function normalize(value) {
  return String(value ?? "").replace(/[_-]+/g, " ").replace(/\s+/g, " ").trim();
}

function ageSeconds(value, nowMs) {
  const t = Date.parse(String(value ?? ""));
  return Number.isFinite(t) ? Math.max(0, (nowMs - t) / 1000) : Number.POSITIVE_INFINITY;
}

function matchesAny(text, patterns) {
  return patterns.some((pattern) => pattern.test(text));
}

function inferCategories(event) {
  const text = [event?.event_type, event?.title, event?.summary, event?.domain, event?.primary_country,
    ...(Array.isArray(event?.countries) ? event.countries : [])].filter(Boolean).join(" ");
  const categories = Object.entries(CATEGORY_PATTERNS)
    .filter(([, patterns]) => matchesAny(text, patterns))
    .map(([category]) => category);
  if (categories.length) return categories;
  const domain = normalize(event?.domain).toLowerCase();
  if (/mineral|rare earth|critical/.test(domain)) return ["CRITICAL_MINERALS"];
  if (/macro|economic|finance|trade|supply|energy/.test(domain)) return ["MACRO"];
  return ["GEOPOLITICS"];
}

function corridorMatches(eventText, corridor) {
  const text = normalize(eventText).toLowerCase();
  const names = [
    corridor.display_name,
    ...(Array.isArray(corridor.chokepoints) ? corridor.chokepoints : []),
  ].filter(Boolean).map((v) => normalize(v).toLowerCase());
  return names.some((name) => name.length >= 5 && text.includes(name));
}

const SHOCK_ALIASES = {
  armed_conflict_escalation: /\bwar\b|\barmed conflict\b|\bmilitary attack|\bmissile strike|\bdrone attack/i,
  ceasefire_deescalation: /\bceasefire\b|\btruce\b|\bpeace talks?\b|\bde[- ]escalat/i,
  sanctions_embargoes_export_controls: /\bsanction|\bembargo|\bexport control/i,
  tariffs_trade_restrictions: /\btariff|\btrade restriction|\bimport ban|\bexport ban/i,
  election_government_transition: /\belection|\breferendum|\bgovernment transition|\bprime minister resign|\bpresident resign/i,
  coup_civil_unrest: /\bcoup\b|\bmass protest|\bcivil unrest\b|\briot|\bmartial law/i,
  monetary_policy_rate_shock: /\bcentral bank\b|\bpolicy rate\b|\brate hike\b|\brate cut\b|\bmonetary policy\b/i,
  inflation_growth_employment_shock: /\binflation\b|\bgdp\b|\brecession\b|\bunemployment\b|\bpayroll/i,
  fx_reserve_external_balance_stress: /\bcurrency\b|\bfx\b|\bforeign exchange\b|\breserve|\bbalance of payments\b/i,
  sovereign_debt_fiscal_shock: /\bsovereign debt\b|\bdebt crisis\b|\bdefault\b|\bdebt restructur|\bfiscal deficit\b/i,
  banking_liquidity_contagion: /\bbank run\b|\bbank failure\b|\bliquidity crisis\b|\bbanking crisis\b/i,
  payments_settlement_disruption: /\bpayment rail\b|\bsettlement\b|\bcorrespondent bank|\bswift\b/i,
  energy_oil_gas_disruption: /\boil\b|\bnatural gas\b|\blng\b|\bpipeline\b|\brefinery/i,
  electricity_grid_disruption: /\bpower grid\b|\bblackout\b|\belectricity outage/i,
  food_agriculture_fertilizer_shock: /\bfood export|\bfertilizer|\bcrop|\bgrain|\bharvest/i,
  critical_minerals_rare_earth_disruption: /\bcritical mineral|\brare earth|\blithium\b|\bcobalt\b|\bnickel\b|\bgraphite\b/i,
  shipping_chokepoint_disruption: /\bshipping\b|\bchokepoint|\bstrait of\b|\bcanal\b|\bport closure\b|\bred sea\b/i,
  supply_chain_logistics_disruption: /\bsupply chain\b|\blogistics\b|\bfreight\b|\bcontainer\b|\bport congestion/i,
  border_customs_transit_disruption: /\bborder closure\b|\bcustoms\b|\btransit restriction\b|\bborder crossing/i,
  natural_hazard_physical_disruption: /\bearthquake\b|\bflood\b|\bwildfire\b|\bcyclone\b|\bhurricane\b|\btsunami/i,
  climate_water_heat_stress: /\bdrought\b|\bheatwave\b|\bwater stress\b|\bwater shortage/i,
  public_health_emergency: /\boutbreak\b|\bepidemic\b|\bpandemic\b|\bpublic health emergency\b/i,
  migration_displacement_shock: /\bmigration\b|\bdisplacement\b|\brefugee influx\b|\binternally displaced/i,
  labor_strike_workforce_disruption: /\blabor strike\b|\blabour strike\b|\bstriking workers\b|\bworkforce shortage/i,
  cyber_systemic_attack: /\bcyberattack\b|\bransomware\b|\bknown exploited vulnerabilit/i,
  telecom_internet_shutdown: /\binternet shutdown\b|\btelecom outage\b|\bmobile network outage\b/i,
  submarine_cable_gnss_navigation_disruption: /\bsubsea cable\b|\bsubmarine cable\b|\bgnss\b|\bgps disruption\b|\bnavigation interference/i,
  regulatory_legal_policy_shock: /\bregulatory change\b|\bnew regulation\b|\blicensing restriction\b|\bforeign investment restriction/i,
  information_influence_disinformation_shock: /\bdisinformation\b|\bmisinformation\b|\binformation operation\b|\bforeign influence/i,
  insurance_market_withdrawal_war_risk: /\binsurance withdrawal\b|\bwar risk premium\b|\bwar-risk insurance/i,
  expropriation_nationalization_shock: /\bexpropriat|\bnationali[sz]ation\b|\bstate takeover\b|\basset seizure/i,
  investment_screening_restriction: /\binvestment screening\b|\bforeign investment review\b|\binbound investment restriction/i,
  technology_semiconductor_export_control_shock: /\bsemiconductor export control|\bchip export restriction|\badvanced chip ban\b/i,
  capital_controls_convertibility_shock: /\bcapital control|\bconvertibility restriction\b|\bcurrency control/i,
  rare_material_long_tail_supply_shock: /\brare material shortage\b|\bstrategic material shortage\b|\bminor metal shortage\b/i,
  trade_corridor_disruption: /\btrade corridor\b|\btransit corridor\b|\btrade route\b|\broute disruption\b/i,
};
function shockMatches(eventText, shock) {
  const alias = SHOCK_ALIASES[String(shock.shock_id)];
  if (alias && alias.test(eventText)) return true;
  const tokens = (String(shock.display_name) + " " + String(shock.shock_id))
    .toLowerCase().replace(/[_-]+/g, " ").split(/\s+/)
    .filter((token) => token.length >= 5 && !["shock","disruption","change","stress"].includes(token));
  const text = eventText.toLowerCase();
  return tokens.length >= 2 && tokens.filter((token) => text.includes(token)).length >= 2;
}

function categoryForShock(shock) {
  const id = String(shock.shock_id);
  if (/critical_mineral|rare_material/i.test(id)) return "CRITICAL_MINERALS";
  if (/monetary|inflation|fx_|sovereign|banking|payments|energy|electricity|food_|shipping|supply_chain|border|climate|public_health|migration|labor|tariff|trade_|investment|capital_controls|insurance/i.test(id)) return "MACRO";
  return "GEOPOLITICS";
}

function canonicalUrl(raw) {
  try {
    const u = new URL(String(raw));
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    for (const key of [...u.searchParams.keys()]) if (key.toLowerCase().startsWith("utm_")) u.searchParams.delete(key);
    u.searchParams.sort();
    return u.toString();
  } catch { return null; }
}

function pageTitle(html) {
  const m = String(html).match(/<title[^>]*>([\s\S]*?)<\/title>/i);
  return normalize(m?.[1]?.replace(/<[^>]+>/g, " ")).slice(0, 800);
}

function links(html, base, limit = 100) {
  const out = [];
  const seen = new Set();
  let match;
  const re = /<a\b[^>]*href=["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/gi;
  const sourceHost = (() => { try { return new URL(base).hostname; } catch { return ""; } })();
  while ((match = re.exec(String(html))) && out.length < limit) {
    try {
      const url = new URL(match[1], base);
      if (!/^https?:$/.test(url.protocol)) continue;
      if (sourceHost && url.hostname !== sourceHost) continue;
      const label = normalize(match[2].replace(/<[^>]+>/g, " "));
      if (label.length < 8 || seen.has(url.href)) continue;
      if (!/(alert|incident|warning|news|press|notice|advis|release|circular|statement|update|bulletin|outbreak|sanction|trade|security|navigation)/i.test(url.href + " " + label)) continue;
      seen.add(url.href);
      out.push({ url: url.href, title: label.slice(0, 800) });
    } catch {}
  }
  return out;
}

async function fetchJson(url) {
  const response = await fetch(url, { headers: { accept: "application/json", "user-agent": UA } });
  if (!response.ok) throw new Error("HTTP " + response.status + " from " + url);
  return response.json();
}

async function fetchWeb(url) {
  const attempts = 3;
  let lastError = null;

  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);

    try {
      const response = await fetch(url, {
        redirect: "follow",
        signal: controller.signal,
        headers: {
          accept: "text/html,application/xhtml+xml,application/xml,text/xml;q=0.9,application/json;q=0.8,*/*;q=0.2",
          "user-agent": UA,
        },
      });

      if (!response.ok) {
        const retryable = [408, 425, 429, 500, 502, 503, 504].includes(response.status);
        throw Object.assign(
          new Error("HTTP " + response.status + " from " + url),
          { retryable },
        );
      }

      return {
        finalUrl: response.url || url,
        contentType: response.headers.get("content-type") ?? "",
        text: await response.text(),
      };
    } catch (error) {
      lastError = error;
      const retryable =
        error?.name === "AbortError" ||
        Boolean(error?.retryable) ||
        /fetch failed|ECONNRESET|ETIMEDOUT|ENETUNREACH|EAI_AGAIN/i.test(String(error?.message ?? ""));
      if (!retryable || attempt === attempts) break;
      await new Promise((resolve) => setTimeout(resolve, attempt * 2_000));
    } finally {
      clearTimeout(timer);
    }
  }

  throw lastError instanceof Error ? lastError : new Error("WEB_DIRECT_FETCH_FAILED");
}

async function writeFragment(db, target, records, nowIso) {
  const unique = [...new Map(records.filter((row) => row?.u).map((row) => [row.i, row])).values()];
  if (!unique.length) return { fragmentId: null, accepted: 0, seen: 0 };
  const fingerprints = unique.map((row) => row.i);
  const existing = new Set();
  for (let i = 0; i < fingerprints.length; i += 200) {
    const { data, error } = await db.from("live_recent_fingerprints").select("fingerprint").in("fingerprint", fingerprints.slice(i, i + 200));
    if (error) throw error;
    for (const row of data ?? []) existing.add(row.fingerprint);
  }
  const accepted = unique.filter((row) => !existing.has(row.i));
  if (!accepted.length) return { fragmentId: null, accepted: 0, seen: unique.length };

  const payload = Buffer.from(accepted.map((row) => JSON.stringify(row)).join("\n") + "\n", "utf8");
  const compressed = gzipSync(payload);
  const payloadSha256 = sha256(payload);
  const compressedSha256 = sha256(compressed);
  const { data: previous, error: previousError } = await db.from("live_fragment_manifest")
    .select("compressed_sha256").eq("source_key", SOURCE_KEY).eq("stream_key", target.target_id)
    .order("period_end", { ascending: false }).limit(1).maybeSingle();
  if (previousError) throw previousError;
  const previousHash = previous?.compressed_sha256 ?? null;
  const chainSha256 = sha256((previousHash ?? "GENESIS") + ":" + compressedSha256);
  const safeId = String(target.target_id).replace(/[^A-Za-z0-9._-]+/g, "_").slice(0, 180);
  const objectPath = "fanout/v1/" + target.scope_type.toLowerCase() + "/" + target.scope_code + "/" + target.category.toLowerCase() + "/" + safeId + "/" + nowIso.replace(/[:.]/g, "-") + "-" + compressedSha256.slice(0, 16) + ".ndjson.gz";

  const { error: uploadError } = await db.storage.from(BUCKET).upload(objectPath, compressed, { contentType: "application/gzip", upsert: false });
  if (uploadError) throw uploadError;
  const { data: downloaded, error: downloadError } = await db.storage.from(BUCKET).download(objectPath);
  if (downloadError || !downloaded) throw downloadError ?? new Error("FANOUT_STORAGE_READBACK_FAILED");
  if (sha256(Buffer.from(await downloaded.arrayBuffer())) !== compressedSha256) throw new Error("FANOUT_STORAGE_HASH_MISMATCH");

  const { data: manifest, error: manifestError } = await db.from("live_fragment_manifest").insert({
    source_key: SOURCE_KEY,
    stream_key: target.target_id,
    storage_bucket: BUCKET,
    object_path: objectPath,
    schema_version: "live-evidence-v1.0.0",
    compression: "gzip",
    period_start: accepted.map((row) => row.d).filter(Boolean).sort()[0] ?? nowIso,
    period_end: nowIso,
    item_count: accepted.length,
    uncompressed_bytes: payload.byteLength,
    compressed_bytes: compressed.byteLength,
    payload_sha256: payloadSha256,
    compressed_sha256: compressedSha256,
    previous_fragment_sha256: previousHash,
    chain_sha256: chainSha256,
    topics: [...new Set(accepted.flatMap((row) => row.q ?? []).map(String))].sort(),
    countries: [...new Set(accepted.flatMap((row) => row.countries ?? []).map(String))].slice(0, 100),
    source_domains: [...new Set(accepted.map((row) => row.h).filter(Boolean))].sort(),
    sealed_at: nowIso,
    verified_at: nowIso,
    verification_method: "storage-readback-sha256",
  }).select("id").single();
  if (manifestError) throw manifestError;

  const expiresAt = new Date(Date.parse(nowIso) + 30 * 86400000).toISOString();
  for (let i = 0; i < accepted.length; i += 500) {
    const rows = accepted.slice(i, i + 500).map((row) => ({
      fingerprint: row.i, source_key: SOURCE_KEY, first_seen_at: nowIso,
      last_seen_at: nowIso, fragment_id: manifest.id, expires_at: expiresAt,
    }));
    const { error } = await db.from("live_recent_fingerprints").upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true });
    if (error) throw error;
  }
  return { fragmentId: manifest.id, accepted: accepted.length, seen: unique.length };
}

async function main() {
  const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Authoritative Supabase credentials are required");
  if (projectRef(url) !== PROJECT_REF) throw new Error("Non-authoritative Supabase project");

  const db = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = Date.now();
  const nowIso = new Date(now).toISOString();

  const [eventsQ, corridorsQ, shocksQ, targetsQ] = await Promise.all([
    db.from("live_structured_events")
      .select("id,story_key,domain,event_type,title,summary,primary_country,countries,status,last_seen_at,last_observed_at")
      .gte("last_observed_at", new Date(now - LOOKBACK_MINUTES * 60000).toISOString())
      .lte("last_observed_at", nowIso)
      .in("status", ["active", "monitoring"])
      .order("last_observed_at", { ascending: false })
      .limit(300),
    db.from("live_strategic_corridor_catalog").select("corridor_id,display_name,corridor_type,chokepoints,monitoring_scope"),
    db.from("live_global_shock_taxonomy").select("shock_id,display_name,required").eq("required", true),
    db.from("live_realtime_scope_targets")
      .select("target_id,scope_type,scope_code,category,transport,source_id,target_url,query_hint,activation_mode,cadence_seconds,last_triggered_at,last_success_at,last_attempt_at,consecutive_failures,live_external_sources!inner(enabled_for_ingestion)")
      .eq("enabled", true)
      .eq("live_external_sources.enabled_for_ingestion", true),
  ]);
  if (eventsQ.error) throw eventsQ.error;
  if (corridorsQ.error) throw corridorsQ.error;
  if (shocksQ.error) throw shocksQ.error;
  if (targetsQ.error) throw targetsQ.error;

  const events = eventsQ.data ?? [];
  const corridors = corridorsQ.data ?? [];
  const shocks = shocksQ.data ?? [];
  const targets = targetsQ.data ?? [];
  const burstTargets = targets.filter((t) => t.transport === "GDELT_BURST");
  const directTargets = targets.filter((t) => t.transport === "WEB_DIRECT");

  const candidateKeys = new Map();
  for (const event of events) {
    if (ageSeconds(event.last_observed_at, now) > FRESH_BREAK_SECONDS) continue;
    const text = [event.event_type, event.title, event.summary, event.domain, event.primary_country,
      ...(Array.isArray(event.countries) ? event.countries : [])].filter(Boolean).join(" ");
    const categories = inferCategories(event);

    for (const corridor of corridors) {
      if (!corridorMatches(text, corridor)) continue;
      for (const category of categories) {
        const target = burstTargets.find((t) => t.scope_type === "CORRIDOR" && t.scope_code === corridor.corridor_id && t.category === category);
        if (!target) continue;
        const storyKey = String(event.story_key ?? event.id ?? sha256(text)).slice(0, 500);
        candidateKeys.set(target.target_id + ":" + storyKey, { event, target, why: "corridor_match" });
      }
    }

    for (const shock of shocks) {
      if (!shockMatches(text, shock)) continue;
      const category = categoryForShock(shock);
      const target = burstTargets.find((t) => t.scope_type === "HOT_TOPIC" && t.scope_code === shock.shock_id && t.category === category);
      if (!target) continue;
      const storyKey = String(event.story_key ?? event.id ?? sha256(text)).slice(0, 500);
      candidateKeys.set(target.target_id + ":" + storyKey, { event, target, why: "hot_topic_match" });
    }
  }

  const candidates = [...candidateKeys.values()]
    .sort((a, b) => Date.parse(String(b.event.last_observed_at ?? 0)) - Date.parse(String(a.event.last_observed_at ?? 0)))
    .slice(0, BURST_MAX);

  const bursts = [];
  for (const item of candidates) {
    const event = item.event;
    const target = item.target;
    const storyKey = String(event.story_key ?? event.id ?? sha256(JSON.stringify(event))).slice(0, 500);
    const { data: existing, error: existingError } = await db.from("live_realtime_escalation_queue")
      .select("queue_id,last_burst_at,burst_count").eq("scope_type", target.scope_type)
      .eq("scope_code", target.scope_code).eq("category", target.category).eq("trigger_story_key", storyKey).maybeSingle();
    if (existingError) throw existingError;
    if (Number.isFinite(ageSeconds(existing?.last_burst_at, now)) && ageSeconds(existing.last_burst_at, now) < BURST_COOLDOWN_SECONDS) continue;

    const { data: queueRow, error: queueError } = await db.from("live_realtime_escalation_queue").upsert({
      scope_type: target.scope_type, scope_code: target.scope_code, category: target.category,
      trigger_event_id: event.id, trigger_story_key: storyKey, trigger_headline: String(event.title ?? "").slice(0, 800),
      first_break_at: String(event.last_observed_at ?? nowIso), last_observed_at: String(event.last_observed_at ?? nowIso),
      status: "QUEUED", queued_at: nowIso,
    }, { onConflict: "scope_type,scope_code,category,trigger_story_key" }).select("queue_id").single();
    if (queueError) throw queueError;

    const hint = String(target.query_hint ?? "").trim();
    const headline = String(event.title ?? "").trim().slice(0, 220).replace(/["\\]/g, " ");
    const queryText = headline ? '"' + headline + '" OR (' + hint.slice(0, 240).replace(/["\\]/g, " ") + ')' : hint.slice(0, 400);
    const queryHash = sha256(queryText);
    const { data: burstRun, error: runInsertError } = await db.from("live_realtime_burst_runs").insert({
      target_id: target.target_id, queue_id: queueRow.queue_id, started_at: nowIso, status: "running",
      query_hash: queryHash, query_text: queryText,
    }).select("id").single();
    if (runInsertError) throw runInsertError;

    try {
      const urlObj = new URL("https://api.gdeltproject.org/api/v2/doc/doc");
      urlObj.searchParams.set("query", queryText);
      urlObj.searchParams.set("mode", "ArtList");
      urlObj.searchParams.set("maxrecords", "75");
      urlObj.searchParams.set("format", "json");
      urlObj.searchParams.set("sort", "DateDesc");
      urlObj.searchParams.set("timespan", "15m");
      const body = await fetchJson(urlObj.toString());
      const articles = Array.isArray(body?.articles) ? body.articles : [];
      const records = articles.map((article) => {
        const u = canonicalUrl(article?.url);
        const title = normalize(article?.title);
        if (!u || !title) return null;
        return {
          i: sha256(u), u, d: article?.seendate ?? article?.published_at ?? nowIso,
          h: article?.domain ?? null, o: article?.domain ?? "GDELT", t: title.slice(0, 800),
          x: normalize(article?.snippet ?? article?.summary ?? article?.description).slice(0, 2400) || null,
          l: article?.language ?? "und", a: null,
          q: [target.category.toLowerCase(), "realtime_break_burst", target.scope_type.toLowerCase(), target.scope_code],
          g: nowIso, scope_type: target.scope_type, scope_code: target.scope_code,
          first_break_event_id: event.id, trigger_story_key: storyKey,
          countries: Array.isArray(event.countries) ? event.countries.slice(0, 50) : [],
        };
      }).filter(Boolean);
      const saved = await writeFragment(db, target, records, nowIso);
      const latestSourceTime = records.map((r) => Date.parse(String(r.d))).filter(Number.isFinite).sort((a,b) => b-a)[0];
      const { error: runUpdateError } = await db.from("live_realtime_burst_runs").update({
        finished_at: new Date().toISOString(), status: records.length ? "succeeded" : "empty",
        records_seen: articles.length, records_accepted: saved.accepted,
        latest_source_time: Number.isFinite(latestSourceTime) ? new Date(latestSourceTime).toISOString() : null,
      }).eq("id", burstRun.id);
      if (runUpdateError) throw runUpdateError;

      await db.from("live_realtime_escalation_queue").update({
        status: "BURSTED", burst_count: Number(existing?.burst_count ?? 0) + 1,
        last_burst_at: nowIso, last_observed_at: String(event.last_observed_at ?? nowIso), last_error: null,
      }).eq("queue_id", queueRow.queue_id);
      await db.from("live_realtime_scope_targets").update({
        last_triggered_at: nowIso, last_success_at: nowIso, last_attempt_at: nowIso,
        consecutive_failures: 0, discovery_state: "REACHABLE", last_error: null, updated_at: nowIso,
      }).eq("target_id", target.target_id);
      bursts.push({ target_id: target.target_id, query_hash: queryHash, reason: item.why, records_seen: articles.length, records_accepted: saved.accepted });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.from("live_realtime_burst_runs").update({ finished_at: new Date().toISOString(), status: "failed", error_detail: message.slice(0, 2000) }).eq("id", burstRun.id);
      await db.from("live_realtime_escalation_queue").update({ status: "FAILED", last_burst_at: nowIso, last_error: message.slice(0, 1000) }).eq("queue_id", queueRow.queue_id);
      await db.from("live_realtime_scope_targets").update({
        last_triggered_at: nowIso, last_attempt_at: nowIso,
        consecutive_failures: Number(target.consecutive_failures ?? 0) + 1,
        discovery_state: "UNREACHABLE", last_error: message.slice(0, 1000), updated_at: nowIso,
      }).eq("target_id", target.target_id);
    }
  }

  const directResults = [];
  for (const target of directTargets) {
    const lastAttemptAge = ageSeconds(target.last_attempt_at, now);
    if (Number.isFinite(lastAttemptAge) && lastAttemptAge < Number(target.cadence_seconds ?? 600)) continue;
    const started = nowIso;
    try {
      const fetched = await fetchWeb(String(target.target_url));
      const title = pageTitle(fetched.text);
      const discovered = links(fetched.text, fetched.finalUrl, 80);
      const records = [];
      const final = canonicalUrl(fetched.finalUrl);
      if (title && final) records.push({
        i: sha256("page:" + target.target_id + ":" + final + ":" + title),
        u: final, d: started, h: new URL(final).hostname, o: target.source_id, t: title,
        x: null, l: "und", a: null,
        q: [target.category.toLowerCase(), "realtime_direct_source", target.scope_type.toLowerCase(), target.scope_code],
        g: started, scope_type: target.scope_type, scope_code: target.scope_code,
      });
      for (const item of discovered) {
        const u = canonicalUrl(item.url);
        if (!u) continue;
        records.push({
          i: sha256("link:" + target.target_id + ":" + u),
          u, d: started, h: new URL(u).hostname, o: target.source_id, t: item.title,
          x: null, l: "und", a: null,
          q: [target.category.toLowerCase(), "realtime_direct_source", target.scope_type.toLowerCase(), target.scope_code],
          g: started, scope_type: target.scope_type, scope_code: target.scope_code,
        });
      }
      const saved = await writeFragment(db, target, records, started);
      await db.from("live_realtime_scope_targets").update({
        last_attempt_at: started, last_success_at: started, consecutive_failures: 0,
        discovery_state: "REACHABLE", last_error: null, updated_at: new Date().toISOString(),
      }).eq("target_id", target.target_id);
      directResults.push({ target_id: target.target_id, records_seen: records.length, records_accepted: saved.accepted });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      await db.from("live_realtime_scope_targets").update({
        last_attempt_at: started, consecutive_failures: Number(target.consecutive_failures ?? 0) + 1,
        discovery_state: "UNREACHABLE", last_error: message.slice(0, 1000), updated_at: new Date().toISOString(),
      }).eq("target_id", target.target_id);
      directResults.push({ target_id: target.target_id, error: message.slice(0, 200) });
    }
  }

  console.log(JSON.stringify({
    ok: true, generated_at: nowIso, fresh_events_considered: events.length,
    burst_candidates: candidates.length, bursts_executed: bursts.length,
    direct_targets_checked: directResults.length, bursts, direct: directResults,
    contract: {
      corridor_targets_per_category: 35,
      corridor_category_target_total: 35 * 3,
      hot_topic_targets_per_category: shocks.length,
      hot_topic_category_target_total: shocks.length * 3,
      fanout_mode: "global_first_break_then_scope_burst",
      no_claim_of_total_event_observation: true,
    },
  }, null, 2));
}

main().catch((error) => {
  console.error(error instanceof Error ? error.stack ?? error.message : String(error));
  process.exit(1);
});
