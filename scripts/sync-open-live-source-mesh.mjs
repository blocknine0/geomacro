import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const BUCKET = "geomacro-live-intelligence";
const SCHEMA_VERSION = "live-evidence-v1.0.0";
const OUTPUT = process.env.OPEN_LIVE_SOURCE_SYNC_OUTPUT ?? null;
const FINGERPRINT_TTL_DAYS = 30;

function projectRef(url) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function sha256(value) {
  return createHash("sha256").update(value, "utf8").digest("hex");
}

function canonicalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    u.searchParams.sort();
    return u.toString();
  } catch {
    return null;
  }
}

function isoFrom(value, fallback) {
  if (typeof value === "number" && Number.isFinite(value)) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  if (typeof value === "string" && value.trim()) {
    const date = new Date(value);
    if (!Number.isNaN(date.getTime())) return date.toISOString();
  }
  return fallback;
}

function record(fingerprintInput, sourceUrl, sourceDomain, outletName, title, description, publishedAt, topics) {
  const canonicalUrl = canonicalizeUrl(sourceUrl);
  if (!canonicalUrl || !title) return null;
  return {
    i: sha256(fingerprintInput),
    u: canonicalUrl,
    d: publishedAt,
    h: sourceDomain,
    o: outletName,
    t: String(title).slice(0, 800),
    x: description ? String(description).slice(0, 2400) : null,
    l: "en",
    a: outletName,
    q: topics,
    g: publishedAt,
  };
}

async function fetchJson(url, options = {}) {
  const response = await fetch(url, {
    ...options,
    headers: {
      accept: "application/json",
      "user-agent": "Geomacro-RealTime-Source-Mesh/1.0",
      ...(options.headers ?? {}),
    },
  });
  if (!response.ok) throw new Error(`HTTP ${response.status} from ${url}`);
  return response.json();
}

async function sourceRecordsUsGs(now) {
  const url = "https://earthquake.usgs.gov/earthquakes/feed/v1.0/summary/all_hour.geojson";
  const body = await fetchJson(url);
  const records = [];
  for (const feature of Array.isArray(body.features) ? body.features : []) {
    const p = feature?.properties ?? {};
    const id = String(feature?.id ?? "").trim();
    const sourceUrl = String(p.url ?? p.detail ?? "").trim();
    const title = String(p.title ?? "").trim();
    if (!id || !sourceUrl || !title) continue;
    const description = [
      p.place ? `Location: ${p.place}.` : "",
      Number.isFinite(Number(p.mag)) ? `Magnitude: ${Number(p.mag)}.` : "",
      p.alert ? `Alert: ${p.alert}.` : "",
      p.tsunami === 1 ? "Tsunami flag: 1." : "",
    ].filter(Boolean).join(" ");
    const publishedAt = isoFrom(p.updated ?? p.time, now);
    const normalized = record(
      `usgs_earthquake:${id}`,
      sourceUrl,
      "earthquake.usgs.gov",
      "U.S. Geological Survey",
      title,
      description,
      publishedAt,
      ["natural_hazards", "macro"],
    );
    if (normalized) records.push(normalized);
  }
  return {
    source_key: "usgs_earthquakes",
    stream_key: "earthquakes-hourly",
    records,
    period_start: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    period_end: now,
  };
}

async function sourceRecordsGdacs(now) {
  const from = new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString().slice(0, 10);
  const to = now.toISOString().slice(0, 10);
  const url =
    `https://www.gdacs.org/gdacsapi/api/Events/geteventlist/SEARCH?eventlist=EQ;TC;FL;VO;DR;WF&fromdate=${encodeURIComponent(from)}&todate=${encodeURIComponent(to)}`;
  const body = await fetchJson(url);
  const rows = Array.isArray(body) ? body : Array.isArray(body?.data) ? body.data : Array.isArray(body?.events) ? body.events : [];
  const records = [];
  for (const row of rows) {
    const eventId = String(row?.eventid ?? row?.eventId ?? row?.id ?? "").trim();
    const eventType = String(row?.eventtype ?? row?.eventType ?? row?.type ?? "disaster").trim();
    const name = String(row?.name ?? row?.eventname ?? row?.description ?? eventType).trim();
    const sourceUrl = String(
      row?.url ??
      row?.eventurl ??
      `https://www.gdacs.org/resources.aspx?eventid=${encodeURIComponent(eventId)}&eventtype=${encodeURIComponent(eventType)}`,
    ).trim();
    if (!eventId || !sourceUrl) continue;
    const country = String(row?.country ?? row?.countryname ?? "").trim();
    const alert = String(row?.alertlevel ?? row?.alertLevel ?? "").trim();
    const description = [
      country ? `Country/area: ${country}.` : "",
      alert ? `Alert level: ${alert}.` : "",
      row?.episodealertlevel ? `Episode alert: ${String(row.episodealertlevel)}.` : "",
    ].filter(Boolean).join(" ");
    const publishedAt = isoFrom(
      row?.fromdate ?? row?.todate ?? row?.date ?? row?.updated,
      now,
    );
    const normalized = record(
      `gdacs_event:${eventType}:${eventId}`,
      sourceUrl,
      "gdacs.org",
      "Global Disaster Alert and Coordination System",
      `GDACS: ${name}`,
      description || "GDACS near-real-time disaster alert.",
      publishedAt,
      ["natural_hazards", "macro"],
    );
    if (normalized) records.push(normalized);
  }
  return {
    source_key: "gdacs_global_disasters",
    stream_key: "global-disasters",
    records,
    period_start: new Date(now.getTime() - 12 * 60 * 60 * 1000).toISOString(),
    period_end: now,
  };
}

async function sourceRecordsReliefWeb(now) {
  const appName = String(process.env.RELIEFWEB_APP_NAME ?? "").trim();
  if (!appName) {
    return {
      source_key: "reliefweb_reports",
      stream_key: "latest-reports",
      records: [],
      skipped: true,
      skip_reason: "RELIEFWEB_APP_NAME_NOT_CONFIGURED",
      period_start: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
      period_end: now,
    };
  }

  const url = new URL("https://api.reliefweb.int/v2/reports");
  url.searchParams.set("appname", appName);
  url.searchParams.set("preset", "latest");
  url.searchParams.set("limit", "1000");

  const body = await fetchJson(url.toString(), { method: "GET" });
  const rows = Array.isArray(body?.data) ? body.data : [];
  const records = [];
  for (const item of rows) {
    const id = String(item?.id ?? "").trim();
    const f = item?.fields ?? {};
    const title = String(f?.title ?? "").trim();
    const selfUrl = String(f?.url ?? `https://reliefweb.int/report/${encodeURIComponent(id)}`).trim();
    if (!id || !title) continue;
    const createdAt = isoFrom(f?.date?.created ?? f?.date?.original, now);
    const countryNames = Array.isArray(f?.country)
      ? f.country.map((v) => String(v?.name ?? "").trim()).filter(Boolean).join(", ")
      : "";
    const description = [
      countryNames ? `Countries: ${countryNames}.` : "",
      f?.status ? `Status: ${String(f.status)}.` : "",
    ].filter(Boolean).join(" ");
    const normalized = record(
      `reliefweb_report:${id}`,
      selfUrl,
      "reliefweb.int",
      "UN OCHA ReliefWeb",
      title,
      description || "ReliefWeb humanitarian update.",
      createdAt,
      ["geopolitics", "macro"],
    );
    if (normalized) records.push(normalized);
  }
  return {
    source_key: "reliefweb_reports",
    stream_key: "latest-reports",
    records,
    skipped: false,
    period_start: new Date(now.getTime() - 60 * 60 * 1000).toISOString(),
    period_end: now,
  };
}

async function sealSource(supabase, source, now) {
  const unique = new Map(source.records.map((row) => [row.i, row]));
  const candidates = [...unique.values()];
  const fingerprints = candidates.map((row) => row.i);
  const existing = new Set();

  for (let i = 0; i < fingerprints.length; i += 200) {
    const chunk = fingerprints.slice(i, i + 200);
    if (!chunk.length) continue;
    const { data, error } = await supabase
      .from("live_recent_fingerprints")
      .select("fingerprint")
      .in("fingerprint", chunk);
    if (error) throw error;
    for (const row of data ?? []) existing.add(row.fingerprint);
  }

  const accepted = candidates.filter((row) => !existing.has(row.i));
  if (!accepted.length) {
    await supabase.from("live_ingestion_runs").insert({
      source_key: source.source_key,
      stream_key: source.stream_key,
      started_at: now,
      finished_at: new Date().toISOString(),
      status: "empty",
      window_start: source.period_start,
      window_end: source.period_end,
      items_seen: candidates.length,
      items_accepted: 0,
      items_duplicate: candidates.length,
      items_rejected: 0,
      metrics: { reason: "all_duplicates" },
    });
    return { accepted: 0, fragment_id: null };
  }

  const payload = Buffer.from(
    accepted.map((row) => JSON.stringify(row)).join("\n") + "\n",
    "utf8",
  );
  const compressed = gzipSync(payload);
  const payloadSha256 = createHash("sha256").update(payload).digest("hex");
  const compressedSha256 = createHash("sha256").update(compressed).digest("hex");

  const { data: previous, error: previousError } = await supabase
    .from("live_fragment_manifest")
    .select("compressed_sha256")
    .eq("source_key", source.source_key)
    .eq("stream_key", source.stream_key)
    .order("period_end", { ascending: false })
    .limit(1)
    .maybeSingle();
  if (previousError) throw previousError;

  const previousHash = previous?.compressed_sha256 ?? null;
  const chainSha256 = sha256(`${previousHash ?? "GENESIS"}:${compressedSha256}`);
  const end = new Date(source.period_end);
  const path =
    `live/v1/${String(end.getUTCFullYear())}/${String(end.getUTCMonth() + 1).padStart(2, "0")}/${String(end.getUTCDate()).padStart(2, "0")}/${String(end.getUTCHours()).padStart(2, "0")}/${source.source_key}/${end.toISOString().replace(/[:.]/g, "-")}-${compressedSha256.slice(0, 16)}.ndjson.gz`;

  const { error: uploadError } = await supabase.storage
    .from(BUCKET)
    .upload(path, compressed, {
      contentType: "application/gzip",
      upsert: false,
    });
  if (uploadError) throw uploadError;

  const { data: readBack, error: readBackError } = await supabase.storage
    .from(BUCKET)
    .download(path);
  if (readBackError || !readBack) throw readBackError ?? new Error("Storage read-back failed");
  const readBackHash = createHash("sha256").update(Buffer.from(await readBack.arrayBuffer())).digest("hex");
  if (readBackHash !== compressedSha256) throw new Error("Storage verification mismatch");

  const topics = [...new Set(accepted.flatMap((row) => row.q ?? []).map(String))].sort();
  const { data: manifest, error: manifestError } = await supabase
    .from("live_fragment_manifest")
    .insert({
      source_key: source.source_key,
      stream_key: source.stream_key,
      storage_bucket: BUCKET,
      object_path: path,
      schema_version: SCHEMA_VERSION,
      compression: "gzip",
      period_start: source.period_start,
      period_end: source.period_end,
      item_count: accepted.length,
      uncompressed_bytes: payload.byteLength,
      compressed_bytes: compressed.byteLength,
      payload_sha256: payloadSha256,
      compressed_sha256: compressedSha256,
      previous_fragment_sha256: previousHash,
      chain_sha256: chainSha256,
      topics,
      countries: [],
      source_domains: [...new Set(accepted.map((row) => row.h).filter(Boolean))].sort(),
      sealed_at: now,
      verified_at: now,
      verification_method: "storage-readback-sha256",
    })
    .select("id")
    .single();
  if (manifestError) throw manifestError;

  const expiresAt = new Date(new Date(now).getTime() + FINGERPRINT_TTL_DAYS * 86_400_000).toISOString();
  for (let i = 0; i < accepted.length; i += 500) {
    const rows = accepted.slice(i, i + 500).map((row) => ({
      fingerprint: row.i,
      source_key: source.source_key,
      first_seen_at: now,
      last_seen_at: now,
      fragment_id: manifest.id,
      expires_at: expiresAt,
    }));
    const { error } = await supabase.from("live_recent_fingerprints").upsert(rows, {
      onConflict: "fingerprint",
      ignoreDuplicates: true,
    });
    if (error) throw error;
  }

  const { error: runError } = await supabase.from("live_ingestion_runs").insert({
    source_key: source.source_key,
    stream_key: source.stream_key,
    started_at: now,
    finished_at: new Date().toISOString(),
    status: "succeeded",
    window_start: source.period_start,
    window_end: source.period_end,
    items_seen: candidates.length,
    items_accepted: accepted.length,
    items_duplicate: candidates.length - accepted.length,
    items_rejected: 0,
    fragment_id: manifest.id,
    metrics: { topics, source_records: accepted.length },
  });
  if (runError) throw runError;

  await supabase.from("live_ingestion_cursors").upsert({
    source_key: source.source_key,
    stream_key: source.stream_key,
    cursor: { last_period_end: source.period_end },
    status: "healthy",
    last_attempt_at: now,
    last_success_at: now,
    last_item_at: source.period_end,
    consecutive_failures: 0,
    updated_at: now,
  }, { onConflict: "source_key,stream_key" });

  return { accepted: accepted.length, fragment_id: manifest.id };
}

async function main() {
  const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Authoritative Supabase server credentials are required");
  if (projectRef(url) !== AUTHORITATIVE_PROJECT_REF) throw new Error("Supabase URL is not the authoritative Geomacro project");

  const supabase = createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const now = new Date().toISOString();

  const results = [];
  const sources = [
    await sourceRecordsUsGs(now),
    await sourceRecordsGdacs(now),
    await sourceRecordsReliefWeb(now),
  ];

  for (const source of sources) {
    if (source.skipped) {
      results.push({
        source_key: source.source_key,
        stream_key: source.stream_key,
        status: "skipped",
        reason: source.skip_reason,
        records: 0,
      });
      continue;
    }
    results.push({
      source_key: source.source_key,
      stream_key: source.stream_key,
      ...(await sealSource(supabase, source, now)),
      records: source.records.length,
    });
  }

  const output = {
    ok: true,
    generated_at: now,
    sources: results,
  };
  if (OUTPUT) await writeFile(OUTPUT, JSON.stringify(output, null, 2) + "\n", "utf8");
  console.log(JSON.stringify(output, null, 2));
}

main().catch((error) => {
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  console.error(message);
  process.exit(1);
});
