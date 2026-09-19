import { createHash } from "node:crypto";
import { gzipSync, gunzipSync } from "node:zlib";
import { writeFile } from "node:fs/promises";
import { createClient } from "@supabase/supabase-js";

const AUTHORITATIVE_PROJECT_REF = "ldpwajisioljyjtojvfx";
const SOURCE_KEY = "gdelt_gal";
const STREAM_KEY = "global-relevant";
const BUCKET = "geomacro-live-intelligence";
const SCHEMA_VERSION = "live-evidence-v1.0.0";
const LOOKBACK_MINUTES = 35;
const MAX_SOURCE_FILES_PER_RUN = 8;
const FINGERPRINT_TTL_DAYS = 30;
const OUTPUT = process.env.GDELT_GAL_SYNC_OUTPUT ?? null;

const TOPIC_PATTERNS = {
  geopolitics: [
    /\bwar\b/i, /\bconflict\b/i, /\bmilitary\b/i, /\barmy\b/i, /\bnavy\b/i,
    /\bair\s*force\b/i, /\bmissile/i, /\bdrone/i, /\battack/i, /\bstrike/i,
    /\binvasion/i, /\bceasefire/i, /\bsanction/i, /\bdiplomat/i, /\belection/i,
    /\breferendum/i, /\bcoup\b/i, /\bprotest/i, /\briot/i, /\bborder/i,
    /\bterritor/i, /\bgeopolit/i, /\bsecurity council\b/i, /\bnato\b/i,
    /\bexport control/i, /\btrade war\b/i, /\btariff/i, /\bembargo/i,
  ],
  macro: [
    /\binflation\b/i, /\bcpi\b/i, /\bppi\b/i, /\bgdp\b/i,
    /\bgross domestic product\b/i, /\binterest rate/i, /\brate cut/i,
    /\brate hike/i, /\bcentral bank/i, /\bmonetary policy/i,
    /\bfederal reserve\b/i, /\becb\b/i, /\bbank of england\b/i,
    /\bbank of japan\b/i, /\brbi\b/i, /\bunemployment\b/i, /\bpayroll/i,
    /\bjobs report\b/i, /\bpmi\b/i, /\brecession\b/i, /\bsovereign debt\b/i,
    /\bbond yield/i, /\bfiscal\b/i, /\bbudget\b/i, /\btrade balance\b/i,
    /\bcurrent account\b/i, /\bcurrency\b/i, /\bforeign exchange\b/i,
    /\bforex\b/i, /\bcapital control/i, /\bbanking crisis\b/i, /\bdefault\b/i,
  ],
  rare_earth: [
    /\brare earth/i, /\bcritical mineral/i, /\bneodymium\b/i,
    /\bpraseodymium\b/i, /\bdysprosium\b/i, /\bterbium\b/i, /\byttrium\b/i,
    /\blanthanum\b/i, /\bcerium\b/i, /\bsamarium\b/i, /\beuropium\b/i,
    /\bgadolinium\b/i, /\bndpr\b/i, /\bndfeb\b/i, /\bpermanent magnet/i,
    /\brare-earth oxide/i, /\brare earth oxide/i, /\brare-earth metal/i,
    /\brare earth metal/i, /\bmineral processing\b/i, /\bmineral refining\b/i,
    /\bseparation plant\b/i, /\bstrategic mineral/i,
  ],
};

function projectRef(url) {
  try { return new URL(url).hostname.split(".")[0] ?? ""; } catch { return ""; }
}

function sha256Hex(input) {
  return createHash("sha256").update(input).digest("hex");
}

function canonicalizeUrl(raw) {
  try {
    const u = new URL(raw);
    u.hash = "";
    u.hostname = u.hostname.toLowerCase();
    const drop = ["fbclid", "gclid", "mc_cid", "mc_eid", "igshid", "ref", "ref_src"];
    for (const key of [...u.searchParams.keys()]) {
      const lower = key.toLowerCase();
      if (lower.startsWith("utm_") || drop.includes(lower)) u.searchParams.delete(key);
    }
    u.searchParams.sort();
    if (u.pathname !== "/" && u.pathname.endsWith("/")) u.pathname = u.pathname.slice(0, -1);
    return u.toString();
  } catch {
    return null;
  }
}

function classifyTopics(row) {
  const text = [row.title ?? "", row.desc ?? "", row.domain ?? "", row.outletName ?? ""].join(" ");
  return Object.entries(TOPIC_PATTERNS)
    .filter(([, patterns]) => patterns.some((pattern) => pattern.test(text)))
    .map(([topic]) => topic);
}

function utcMinuteStamp(date) {
  return [
    date.getUTCFullYear(),
    String(date.getUTCMonth() + 1).padStart(2, "0"),
    String(date.getUTCDate()).padStart(2, "0"),
    String(date.getUTCHours()).padStart(2, "0"),
    String(date.getUTCMinutes()).padStart(2, "0"),
    "00",
  ].join("");
}

function stampToDate(stamp) {
  return new Date(Date.UTC(
    Number(stamp.slice(0, 4)), Number(stamp.slice(4, 6)) - 1,
    Number(stamp.slice(6, 8)), Number(stamp.slice(8, 10)), Number(stamp.slice(10, 12)), 0,
  ));
}

function candidateStamps(now = new Date()) {
  const out = [];
  for (let i = LOOKBACK_MINUTES; i >= 1; i -= 1) {
    out.push(utcMinuteStamp(new Date(now.getTime() - i * 60_000)));
  }
  return out;
}

async function fetchGalFile(stamp) {
  const sourceUrl = `https://storage.googleapis.com/data.gdeltproject.org/gdeltv3/gal/${stamp}.gal.json.gz`;
  const response = await fetch(sourceUrl, { headers: { "user-agent": "Geomacro-Live-Intelligence/1.0" } });
  if (response.status === 404) return null;
  if (!response.ok) throw new Error(`GDELT ${stamp}: HTTP ${response.status}`);
  const compressed = Buffer.from(await response.arrayBuffer());
  const text = gunzipSync(compressed).toString("utf8");
  return { stamp, sourceUrl, compressed, text };
}

function compactRow(row, canonicalUrl, fingerprint, topics, sourceStamp) {
  return {
    i: fingerprint,
    u: canonicalUrl,
    d: row.date ?? null,
    h: row.domain ?? null,
    o: row.outletName ?? null,
    t: row.title ?? null,
    x: row.desc ?? null,
    l: row.lang ?? null,
    a: row.author ?? null,
    q: topics,
    g: sourceStamp,
  };
}

async function emit(result) {
  if (OUTPUT) await writeFile(OUTPUT, `${JSON.stringify(result, null, 2)}\n`, "utf8");
  console.log(JSON.stringify(result));
}

async function main() {
  const url = String(process.env.APP_SUPABASE_URL ?? "").trim();
  const key = String(process.env.APP_SUPABASE_SERVICE_ROLE_KEY ?? "").trim();
  if (!url || !key) throw new Error("Authoritative Supabase server credentials are required");
  if (projectRef(url) !== AUTHORITATIVE_PROJECT_REF) throw new Error("Supabase URL is not the authoritative Geomacro project");

  const supabase = createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
  const now = new Date();
  const nowIso = now.toISOString();

  try {
    const { data: cursorRow, error: cursorError } = await supabase
      .from("live_ingestion_cursors")
      .select("cursor,last_success_at")
      .eq("source_key", SOURCE_KEY)
      .eq("stream_key", STREAM_KEY)
      .maybeSingle();
    if (cursorError) throw cursorError;

    const lastStamp = typeof cursorRow?.cursor?.last_source_stamp === "string"
      ? cursorRow.cursor.last_source_stamp
      : null;

    const available = [];
    for (const stamp of candidateStamps(now).filter((value) => !lastStamp || value > lastStamp)) {
      const file = await fetchGalFile(stamp);
      if (file) available.push(file);
      if (available.length >= MAX_SOURCE_FILES_PER_RUN) break;
    }

    if (available.length === 0) {
      const { error } = await supabase.from("live_ingestion_cursors").upsert({
        source_key: SOURCE_KEY,
        stream_key: STREAM_KEY,
        cursor: lastStamp ? { last_source_stamp: lastStamp } : {},
        status: "healthy",
        last_attempt_at: nowIso,
        last_success_at: nowIso,
        consecutive_failures: 0,
        updated_at: nowIso,
      }, { onConflict: "source_key,stream_key" });
      if (error) throw error;
      await emit({ ok: true, status: "no_new_gdelt_file", last_source_stamp: lastStamp });
      return;
    }

    const batchSeen = new Set();
    const candidates = [];
    let itemsSeen = 0;
    let itemsRejected = 0;
    let sameBatchDuplicate = 0;

    for (const file of available) {
      for (const line of file.text.split("\n")) {
        if (!line.trim()) continue;
        itemsSeen += 1;
        let row;
        try { row = JSON.parse(line); } catch { itemsRejected += 1; continue; }
        if (!row.url || !row.title) { itemsRejected += 1; continue; }
        const topics = classifyTopics(row);
        if (topics.length === 0) { itemsRejected += 1; continue; }
        const canonicalUrl = canonicalizeUrl(row.url);
        if (!canonicalUrl) { itemsRejected += 1; continue; }
        const fingerprint = sha256Hex(canonicalUrl);
        if (batchSeen.has(fingerprint)) { sameBatchDuplicate += 1; continue; }
        batchSeen.add(fingerprint);
        candidates.push({ fingerprint, record: compactRow(row, canonicalUrl, fingerprint, topics, file.stamp) });
      }
    }

    const existing = new Set();
    const hashes = candidates.map((item) => item.fingerprint);
    for (let i = 0; i < hashes.length; i += 200) {
      const { data, error } = await supabase
        .from("live_recent_fingerprints")
        .select("fingerprint")
        .in("fingerprint", hashes.slice(i, i + 200));
      if (error) throw error;
      for (const row of data ?? []) existing.add(row.fingerprint);
    }

    const accepted = candidates.filter((item) => !existing.has(item.fingerprint));
    const databaseDuplicate = candidates.length - accepted.length;
    const latestStamp = available.map((item) => item.stamp).sort().at(-1);

    if (accepted.length === 0) {
      const { error } = await supabase.from("live_ingestion_cursors").upsert({
        source_key: SOURCE_KEY,
        stream_key: STREAM_KEY,
        cursor: { last_source_stamp: latestStamp },
        status: "healthy",
        last_attempt_at: nowIso,
        last_success_at: nowIso,
        consecutive_failures: 0,
        updated_at: nowIso,
      }, { onConflict: "source_key,stream_key" });
      if (error) throw error;
      await emit({ ok: true, status: "all_duplicates_or_irrelevant", files_seen: available.length, items_seen: itemsSeen, relevant_candidates: candidates.length, latest_source_stamp: latestStamp });
      return;
    }

    const ndjson = `${accepted.map((item) => JSON.stringify(item.record)).join("\n")}\n`;
    const payloadBytes = Buffer.from(ndjson, "utf8");
    const compressedBytes = gzipSync(payloadBytes);
    const payloadSha256 = sha256Hex(payloadBytes);
    const compressedSha256 = sha256Hex(compressedBytes);

    const { data: previous, error: previousError } = await supabase
      .from("live_fragment_manifest")
      .select("compressed_sha256")
      .eq("source_key", SOURCE_KEY)
      .eq("stream_key", STREAM_KEY)
      .order("period_end", { ascending: false })
      .limit(1)
      .maybeSingle();
    if (previousError) throw previousError;

    const previousFragmentSha256 = previous?.compressed_sha256 ?? null;
    const chainSha256 = sha256Hex(`${previousFragmentSha256 ?? "GENESIS"}:${compressedSha256}`);
    const sortedStamps = available.map((item) => item.stamp).sort();
    const periodStart = stampToDate(sortedStamps[0]);
    const periodEnd = stampToDate(latestStamp);
    const yyyy = latestStamp.slice(0, 4);
    const mm = latestStamp.slice(4, 6);
    const dd = latestStamp.slice(6, 8);
    const hh = latestStamp.slice(8, 10);
    const objectPath = `live/v1/${yyyy}/${mm}/${dd}/${hh}/gdelt-gal/${latestStamp}-${compressedSha256.slice(0, 16)}.ndjson.gz`;

    const { error: uploadError } = await supabase.storage.from(BUCKET).upload(objectPath, compressedBytes, {
      contentType: "application/gzip",
      upsert: false,
    });
    if (uploadError) throw uploadError;

    const { data: downloaded, error: downloadError } = await supabase.storage.from(BUCKET).download(objectPath);
    if (downloadError || !downloaded) throw downloadError ?? new Error("Storage read-back failed");
    const readBackSha256 = sha256Hex(Buffer.from(await downloaded.arrayBuffer()));
    if (readBackSha256 !== compressedSha256) throw new Error("Storage verification mismatch");

    const topicSet = new Set();
    for (const item of accepted) for (const topic of item.record.q ?? []) topicSet.add(String(topic));

    const { data: manifest, error: manifestError } = await supabase.from("live_fragment_manifest").insert({
      source_key: SOURCE_KEY,
      stream_key: STREAM_KEY,
      storage_bucket: BUCKET,
      object_path: objectPath,
      schema_version: SCHEMA_VERSION,
      compression: "gzip",
      period_start: periodStart.toISOString(),
      period_end: periodEnd.toISOString(),
      item_count: accepted.length,
      uncompressed_bytes: payloadBytes.byteLength,
      compressed_bytes: compressedBytes.byteLength,
      payload_sha256: payloadSha256,
      compressed_sha256: compressedSha256,
      previous_fragment_sha256: previousFragmentSha256,
      chain_sha256: chainSha256,
      topics: [...topicSet].sort(),
      countries: [],
      source_domains: [],
      sealed_at: nowIso,
      verified_at: nowIso,
      verification_method: "storage-readback-sha256",
    }).select("id").single();
    if (manifestError) throw manifestError;

    const expiresAt = new Date(now.getTime() + FINGERPRINT_TTL_DAYS * 86_400_000).toISOString();
    for (let i = 0; i < accepted.length; i += 500) {
      const rows = accepted.slice(i, i + 500).map((item) => ({
        fingerprint: item.fingerprint,
        source_key: SOURCE_KEY,
        first_seen_at: nowIso,
        last_seen_at: nowIso,
        fragment_id: manifest.id,
        expires_at: expiresAt,
      }));
      const { error } = await supabase.from("live_recent_fingerprints").upsert(rows, { onConflict: "fingerprint", ignoreDuplicates: true });
      if (error) throw error;
    }

    const { error: runError } = await supabase.from("live_ingestion_runs").insert({
      source_key: SOURCE_KEY,
      stream_key: STREAM_KEY,
      started_at: nowIso,
      finished_at: new Date().toISOString(),
      status: "succeeded",
      window_start: periodStart.toISOString(),
      window_end: periodEnd.toISOString(),
      items_seen: itemsSeen,
      items_accepted: accepted.length,
      items_duplicate: sameBatchDuplicate + databaseDuplicate,
      items_rejected: itemsRejected,
      fragment_id: manifest.id,
      metrics: {
        source_files: available.length,
        source_stamps: sortedStamps,
        relevant_candidates: candidates.length,
        compression_ratio: payloadBytes.byteLength === 0 ? null : Number((compressedBytes.byteLength / payloadBytes.byteLength).toFixed(6)),
      },
    });
    if (runError) throw runError;

    const { error: cursorUpdateError } = await supabase.from("live_ingestion_cursors").upsert({
      source_key: SOURCE_KEY,
      stream_key: STREAM_KEY,
      cursor: { last_source_stamp: latestStamp },
      status: "healthy",
      last_attempt_at: nowIso,
      last_success_at: nowIso,
      last_item_at: periodEnd.toISOString(),
      consecutive_failures: 0,
      updated_at: nowIso,
    }, { onConflict: "source_key,stream_key" });
    if (cursorUpdateError) throw cursorUpdateError;

    await emit({
      ok: true,
      status: "sealed",
      fragment_id: manifest.id,
      source_files: available.length,
      items_seen: itemsSeen,
      items_accepted: accepted.length,
      items_duplicate: sameBatchDuplicate + databaseDuplicate,
      items_rejected: itemsRejected,
      uncompressed_bytes: payloadBytes.byteLength,
      compressed_bytes: compressedBytes.byteLength,
      compressed_sha256: compressedSha256,
      chain_sha256: chainSha256,
      latest_source_stamp: latestStamp,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const { data: existing } = await supabase
      .from("live_ingestion_cursors")
      .select("consecutive_failures,cursor")
      .eq("source_key", SOURCE_KEY)
      .eq("stream_key", STREAM_KEY)
      .maybeSingle();
    const failures = Number(existing?.consecutive_failures ?? 0) + 1;

    await supabase.from("live_ingestion_cursors").upsert({
      source_key: SOURCE_KEY,
      stream_key: STREAM_KEY,
      cursor: existing?.cursor ?? {},
      status: failures >= 3 ? "failed" : "degraded",
      last_attempt_at: nowIso,
      consecutive_failures: failures,
      updated_at: nowIso,
    }, { onConflict: "source_key,stream_key" });

    await supabase.from("live_ingestion_runs").insert({
      source_key: SOURCE_KEY,
      stream_key: STREAM_KEY,
      started_at: nowIso,
      finished_at: new Date().toISOString(),
      status: "failed",
      error_code: "INGEST_FAILED",
      error_detail: message.slice(0, 2000),
    });

    await emit({ ok: false, status: "INGEST_FAILED", detail: "Internal ingestion failure. See private run diagnostics." });
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
});
