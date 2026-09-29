// Service-side restore for a Supabase raw snapshot whose Storage object moved to B2.
// New bundle pointers restore with one B2 GET; legacy per-object proofs remain supported.
const enc = new TextEncoder();
const dec = new TextDecoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, b => b.toString(16).padStart(2, "0")).join("");
const sha = async (bytes: Uint8Array | string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", typeof bytes === "string" ? enc.encode(bytes) : bytes)));
async function hmac(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", typeof key === "string" ? enc.encode(key) : key,
    { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", material, enc.encode(value)));
}
async function readB2(key: string, access: string, secret: string): Promise<Uint8Array> {
  if (!/^geomacro-evidence\/v1\/[A-Za-z0-9_./-]+$/.test(key) || key.includes("..")) throw Error("ARCHIVE_KEY_INVALID");
  const host = "s3.us-east-005.backblazeb2.com";
  const path = `/geomacro-private-archive/${key}`;
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = stamp.slice(0, 8);
  const digest = await sha("");
  const headers = `host:${host}\nx-amz-content-sha256:${digest}\nx-amz-date:${stamp}\n`;
  const scope = `${day}/us-east-005/s3/aws4_request`;
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const canonical = ["GET", path, "", headers, signedHeaders, digest].join("\n");
  const signing = await hmac(await hmac(await hmac(await hmac(`AWS4${secret}`, day), "us-east-005"), "s3"), "aws4_request");
  const signature = hex(await hmac(signing, ["AWS4-HMAC-SHA256", stamp, scope, await sha(canonical)].join("\n")));
  const response = await fetch(`https://${host}${path}`, {
    headers: { "x-amz-content-sha256": digest, "x-amz-date": stamp,
      authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}` },
    signal: AbortSignal.timeout(20_000),
  });
  if (!response.ok) throw Error(`B2_READ_${response.status}`);
  const length = Number(response.headers.get("content-length") ?? "0");
  if (length > 20_000_000) throw Error("ARCHIVE_TOO_LARGE");
  const bytes = new Uint8Array(await response.arrayBuffer());
  if (bytes.length > 20_000_000) throw Error("ARCHIVE_TOO_LARGE");
  return bytes;
}
async function gunzip(bytes: Uint8Array): Promise<Uint8Array> {
  const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("gzip"));
  return new Uint8Array(await new Response(stream).arrayBuffer());
}
function decodeBase64(value: string): Uint8Array {
  const raw = atob(value);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
}

Deno.serve(async request => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || token.split(".").length !== 3) return new Response("Unauthorized", { status: 401 });
  let role: unknown;
  try { role = JSON.parse(atob(token.split(".")[1])).role; } catch { return new Response("Unauthorized", { status: 401 }); }
  if (role !== "service_role") return new Response("Forbidden", { status: 403 });
  const url = Deno.env.get("SUPABASE_URL");
  const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
  const access = Deno.env.get("B2_ARCHIVE_READ_KEY_ID")?.trim();
  const secret = Deno.env.get("B2_ARCHIVE_READ_APPLICATION_KEY")?.trim();
  if (!url || !service || !access || !secret || new URL(url).hostname !== "ldpwajisioljyjtojvfx.supabase.co") {
    return new Response("Archive configuration unavailable", { status: 503 });
  }
  let id: string;
  try { id = (await request.json()).snapshot_id; } catch { return new Response("Invalid request", { status: 400 }); }
  if (typeof id !== "string" || !/^[0-9a-f]{8}-[0-9a-f-]{27,}$/i.test(id)) return new Response("Invalid snapshot ID", { status: 400 });
  try {
    const lookup = await fetch(`${url}/rest/v1/live_raw_source_snapshots?${new URLSearchParams({
      snapshot_id: `eq.${id}`,
      select: "snapshot_id,storage_bucket,object_path,byte_count,content_sha256,archive_bundle_key,archive_bundle_sha256,archive_member_sha256",
      limit: "1",
    })}`, { headers: { apikey: service, authorization: `Bearer ${service}` }, signal: AbortSignal.timeout(15_000) });
    if (!lookup.ok) throw Error(`SNAPSHOT_LOOKUP_${lookup.status}`);
    const rows = await lookup.json() as Array<{ snapshot_id: string; storage_bucket: string;
      object_path: string; byte_count: number; content_sha256: string; archive_bundle_key?: string | null;
      archive_bundle_sha256?: string | null; archive_member_sha256?: string | null }>;
    const row = rows[0];
    if (!row) return new Response("Snapshot not found", { status: 404 });
    if (row.storage_bucket !== "geomacro-live-intelligence" ||
        !/^raw\/v1\/[A-Za-z0-9_./-]+\.gz$/.test(row.object_path) || row.object_path.includes("..") ||
        !/^[a-f0-9]{64}$/.test(row.content_sha256) ||
        !Number.isInteger(row.byte_count) || row.byte_count < 0 || row.byte_count > 20_000_000) throw Error("SNAPSHOT_METADATA_INVALID");

    let raw: Uint8Array;
    if (row.archive_bundle_key) {
      if (!/^geomacro-evidence\/v1\/raw-bundles\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$/.test(row.archive_bundle_key) ||
          !/^[a-f0-9]{64}$/.test(row.archive_bundle_sha256 ?? "") ||
          !/^[a-f0-9]{64}$/.test(row.archive_member_sha256 ?? "")) throw Error("RAW_BUNDLE_POINTER_INVALID");
      const bundlePacked = await readB2(row.archive_bundle_key, access, secret);
      if (await sha(bundlePacked) !== row.archive_bundle_sha256) throw Error("RAW_BUNDLE_HASH_MISMATCH");
      const bundle = JSON.parse(dec.decode(await gunzip(bundlePacked))) as { schema?: string; entries?: Array<{
        snapshot_id?: string; object_path?: string; payload_bytes?: number; payload_sha256?: string;
        member_compressed_sha256?: string; compressed_b64?: string }> };
      if (bundle.schema !== "geomacro.raw-storage-bundle.v1" || !Array.isArray(bundle.entries)) throw Error("RAW_BUNDLE_SHAPE_INVALID");
      const entry = bundle.entries.find(item => item.snapshot_id === id);
      if (!entry || entry.object_path !== row.object_path || entry.payload_bytes !== row.byte_count ||
          entry.payload_sha256 !== row.content_sha256 || entry.member_compressed_sha256 !== row.archive_member_sha256 ||
          typeof entry.compressed_b64 !== "string") throw Error("RAW_BUNDLE_MEMBER_INVALID");
      const compressed = decodeBase64(entry.compressed_b64);
      if (await sha(compressed) !== row.archive_member_sha256) throw Error("RAW_BUNDLE_MEMBER_HASH_MISMATCH");
      raw = await gunzip(compressed);
    } else {
      // Legacy per-object archive proof path.
      const archiveKey = `geomacro-evidence/v1/${row.object_path}`;
      const proof = JSON.parse(dec.decode(await readB2(`geomacro-evidence/v1/index/raw/${id}.json`, access, secret)));
      if (proof.schema !== "geomacro.archive-proof.v1" || proof.snapshot_id !== id ||
          proof.source_bucket !== row.storage_bucket || proof.source_path !== row.object_path ||
          proof.archive_bucket !== "geomacro-private-archive" || proof.archive_key !== archiveKey ||
          proof.payload_sha256 !== row.content_sha256 || proof.payload_bytes !== row.byte_count ||
          !/^[a-f0-9]{64}$/.test(proof.compressed_sha256)) throw Error("ARCHIVE_PROOF_INVALID");
      const compressed = await readB2(archiveKey, access, secret);
      if (compressed.length !== proof.compressed_bytes || await sha(compressed) !== proof.compressed_sha256) throw Error("ARCHIVE_HASH_MISMATCH");
      raw = await gunzip(compressed);
    }
    if (raw.length !== row.byte_count || await sha(raw) !== row.content_sha256) throw Error("PAYLOAD_HASH_MISMATCH");
    return new Response(raw, { headers: { "content-type": "application/octet-stream", "cache-control": "private, no-store",
      "x-geomacro-snapshot-id": id } });
  } catch (error) {
    console.error("RAW_SNAPSHOT_RESTORE_FAILED", error instanceof Error ? error.message : "unknown");
    return new Response("Archive unavailable", { status: 502 });
  }
});
