import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const SUPABASE_URL = Deno.env.get("SUPABASE_URL") ?? "";
const SERVICE_ROLE_KEY = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "";
const ARCHIVE_TOKEN = Deno.env.get("FLASH_INGEST_TOKEN") ?? "";
const BUCKET = "geomacro-telegram-signal";
const MAX_ITEMS = 500;

const db = createClient(SUPABASE_URL, SERVICE_ROLE_KEY);

async function sha256Hex(bytes: Uint8Array): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest)).map((b) => b.toString(16).padStart(2, "0")).join("");
}

async function gzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new CompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}

function iso(value: unknown): string {
  return typeof value === "string" ? value : new Date().toISOString();
}

Deno.serve(async (request) => {
  if (request.method !== "POST") return new Response(JSON.stringify({ ok: false, error: "method_not_allowed" }), { status: 405 });
  if (!ARCHIVE_TOKEN || request.headers.get("x-geomacro-flash-token") !== ARCHIVE_TOKEN) {
    return new Response(JSON.stringify({ ok: false, error: "unauthorized" }), { status: 401 });
  }

  const { data: events, error } = await db
    .from("live_flash_events")
    .select("id,source_record_id,published_at,headline,source_channel,source_channel_key,source_url,event_type,verification_status,severity_bps,source_reliability_bps,verification_score_bps,latitude_e6,longitude_e6,content_hash,created_at")
    .is("archived_at", null)
    .order("created_at", { ascending: true })
    .limit(MAX_ITEMS);

  if (error) return new Response(JSON.stringify({ ok: false, error: error.message }), { status: 500 });
  if (!events?.length) return new Response(JSON.stringify({ ok: true, archived: 0, status: "empty" }), { status: 200 });

  const records = events.map((event) => JSON.stringify({
    schema_version: "telegram-signal-evidence-v1.0.0",
    id: event.id,
    source_record_id: event.source_record_id,
    published_at: event.published_at,
    headline: event.headline,
    source_channel: event.source_channel,
    source_channel_key: event.source_channel_key,
    source_url: event.source_url,
    event_type: event.event_type,
    verification_status: event.verification_status,
    severity_bps: event.severity_bps,
    source_reliability_bps: event.source_reliability_bps,
    verification_score_bps: event.verification_score_bps,
    latitude_e6: event.latitude_e6,
    longitude_e6: event.longitude_e6,
    content_hash: event.content_hash,
    created_at: event.created_at,
  })).join("\n") + "\n";

  const payload = new TextEncoder().encode(records);
  const compressed = await gzip(payload);
  const payloadSha = await sha256Hex(payload);
  const compressedSha = await sha256Hex(compressed);
  const periodStart = iso(events[0].created_at);
  const periodEnd = iso(events[events.length - 1].created_at);

  const { data: previous } = await db
    .from("live_signal_fragment_manifest")
    .select("chain_sha256")
    .eq("stream_key", "telegram-flash")
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  const chainMaterial = new TextEncoder().encode(
    `telegram-flash|\${periodStart}|\${periodEnd}|\${payloadSha}|\${compressedSha}|\${previous?.chain_sha256 ?? ""}`,
  );
  const chainSha = await sha256Hex(chainMaterial);
  const path = `telegram-flash/\${periodEnd.replaceAll(":", "-").replaceAll(".", "-")}-\${compressedSha}.jsonl.gz`;

  const { error: uploadError } = await db.storage.from(BUCKET).upload(path, compressed, {
    contentType: "application/gzip",
    upsert: false,
  });
  if (uploadError) return new Response(JSON.stringify({ ok: false, error: uploadError.message }), { status: 500 });

  const { data: manifest, error: manifestError } = await db
    .from("live_signal_fragment_manifest")
    .insert({
      stream_key: "telegram-flash",
      storage_bucket: BUCKET,
      object_path: path,
      compression: "gzip",
      schema_version: "telegram-signal-evidence-v1.0.0",
      period_start: periodStart,
      period_end: periodEnd,
      item_count: events.length,
      uncompressed_bytes: payload.byteLength,
      compressed_bytes: compressed.byteLength,
      payload_sha256: payloadSha,
      compressed_sha256: compressedSha,
      previous_fragment_sha256: previous?.chain_sha256 ?? null,
      chain_sha256: chainSha,
      sealed_at: new Date().toISOString(),
      verified_at: new Date().toISOString(),
      verification_method: "preupload-payload-and-compressed-sha256",
    })
    .select("id")
    .single();

  if (manifestError || !manifest) {
    await db.storage.from(BUCKET).remove([path]);
    return new Response(JSON.stringify({ ok: false, error: manifestError?.message ?? "manifest_insert_failed" }), { status: 500 });
  }

  const ids = events.map((event) => event.id);
  const { error: markError } = await db
    .from("live_flash_events")
    .update({ archived_fragment_id: manifest.id, archived_at: new Date().toISOString() })
    .in("id", ids)
    .is("archived_at", null);

  if (markError) {
    return new Response(JSON.stringify({ ok: false, error: markError.message, manifest_id: manifest.id }), { status: 500 });
  }

  const { data: readback } = await db.storage.from(BUCKET).download(path);
  if (!readback) return new Response(JSON.stringify({ ok: false, error: "archive_readback_failed", manifest_id: manifest.id }), { status: 500 });
  const readbackSha = await sha256Hex(new Uint8Array(await readback.arrayBuffer()));
  if (readbackSha !== compressedSha) {
    return new Response(JSON.stringify({ ok: false, error: "archive_readback_sha_mismatch", manifest_id: manifest.id }), { status: 500 });
  }

  return new Response(JSON.stringify({
    ok: true,
    archived: events.length,
    manifest_id: manifest.id,
    object_path: path,
    payload_sha256: payloadSha,
    compressed_sha256: compressedSha,
    chain_sha256: chainSha,
  }), { status: 200, headers: { "content-type": "application/json" } });
});
