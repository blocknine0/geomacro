// Private B2 archive bridge for server-side GRO restore only.
// Bundle-backed rows require one B2 GET and return the original per-object gzip bytes.
const encoder = new TextEncoder();
const decoder = new TextDecoder();
const hex = (bytes: Uint8Array) => Array.from(bytes, byte => byte.toString(16).padStart(2, "0")).join("");
const sha256 = async (value: Uint8Array | string) => hex(new Uint8Array(await crypto.subtle.digest("SHA-256", typeof value === "string" ? encoder.encode(value) : value)));
async function hmac(key: Uint8Array | string, value: string): Promise<Uint8Array> {
  const material = await crypto.subtle.importKey("raw", typeof key === "string" ? encoder.encode(key) : key, { name: "HMAC", hash: "SHA-256" }, false, ["sign"]);
  return new Uint8Array(await crypto.subtle.sign("HMAC", material, encoder.encode(value)));
}
async function b2Get(key: string, access: string, secret: string): Promise<Uint8Array> {
  if (!/^geomacro-evidence\/v1\/[A-Za-z0-9_./-]+$/.test(key) || key.includes("..")) throw new Error("GRO_ARCHIVE_KEY_INVALID");
  const host = "s3.us-east-005.backblazeb2.com";
  const path = `/geomacro-private-archive/${key}`;
  const stamp = new Date().toISOString().replace(/[:-]|\.\d{3}/g, "");
  const day = stamp.slice(0, 8);
  const emptyHash = await sha256("");
  const signedHeaders = "host;x-amz-content-sha256;x-amz-date";
  const headers = `host:${host}\nx-amz-content-sha256:${emptyHash}\nx-amz-date:${stamp}\n`;
  const canonical = ["GET", path, "", headers, signedHeaders, emptyHash].join("\n");
  const scope = `${day}/us-east-005/s3/aws4_request`;
  const stringToSign = ["AWS4-HMAC-SHA256", stamp, scope, await sha256(canonical)].join("\n");
  const signingKey = await hmac(await hmac(await hmac(await hmac(`AWS4${secret}`, day), "us-east-005"), "s3"), "aws4_request");
  const signature = hex(await hmac(signingKey, stringToSign));
  const upstream = await fetch(`https://${host}${path}`, { headers: {
    "x-amz-content-sha256": emptyHash,
    "x-amz-date": stamp,
    authorization: `AWS4-HMAC-SHA256 Credential=${access}/${scope}, SignedHeaders=${signedHeaders}, Signature=${signature}`,
  }, signal: AbortSignal.timeout(20_000) });
  if (!upstream.ok) throw new Error(`GRO_ARCHIVE_B2_${upstream.status}`);
  const bytes = new Uint8Array(await upstream.arrayBuffer());
  if (bytes.length > 20_000_000) throw new Error("GRO_ARCHIVE_TOO_LARGE");
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
Deno.serve(async (request: Request) => {
  if (request.method !== "POST") return new Response("Method not allowed", { status: 405 });
  const token = request.headers.get("authorization")?.replace(/^Bearer /, "");
  if (!token || token.split(".").length !== 3) return new Response("Unauthorized", { status: 401 });
  let role: unknown;
  try { role = JSON.parse(atob(token.split(".")[1])).role; } catch { return new Response("Unauthorized", { status: 401 }); }
  if (role !== "service_role") return new Response("Forbidden", { status: 403 });
  try {
    const { object_id: id } = await request.json();
    if (typeof id !== "string" || !/^gro_[A-Za-z0-9_]+$/.test(id)) return new Response("Invalid object ID", { status: 400 });
    const access = Deno.env.get("B2_ARCHIVE_READ_KEY_ID")?.trim();
    const secret = Deno.env.get("B2_ARCHIVE_READ_APPLICATION_KEY")?.trim();
    const url = Deno.env.get("SUPABASE_URL");
    const service = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!access || !secret || !url || !service || new URL(url).hostname !== "ldpwajisioljyjtojvfx.supabase.co") throw new Error("GRO_ARCHIVE_CONFIG_UNAVAILABLE");
    const lookup = await fetch(`${url}/rest/v1/geomacro_risk_objects?${new URLSearchParams({ object_id: `eq.${id}`, select: "object_id,archive_key,archive_sha256,archive_bundle_key,archive_bundle_sha256", limit: "1" })}`, { headers: { apikey: service, authorization: `Bearer ${service}` }, signal: AbortSignal.timeout(15_000) });
    if (!lookup.ok) throw new Error(`GRO_ARCHIVE_LOOKUP_${lookup.status}`);
    const rows = await lookup.json() as Array<{ object_id: string; archive_key: string | null; archive_sha256: string | null; archive_bundle_key: string | null; archive_bundle_sha256: string | null }>;
    const row = rows[0];
    if (!row || row.archive_key !== `risk-object-archive/v1/${id}.json.gz` || !/^[a-f0-9]{64}$/.test(row.archive_sha256 ?? "")) throw new Error("GRO_ARCHIVE_ROW_INVALID");
    let compressed: Uint8Array;
    if (row.archive_bundle_key) {
      if (!/^geomacro-evidence\/v1\/gro-bundles\/[0-9]{8}T[0-9]{6}Z-[0-9a-f]-[0-9a-f-]{36}\.json\.gz$/.test(row.archive_bundle_key) || !/^[a-f0-9]{64}$/.test(row.archive_bundle_sha256 ?? "")) throw new Error("GRO_BUNDLE_POINTER_INVALID");
      const packed = await b2Get(row.archive_bundle_key, access, secret);
      if (await sha256(packed) !== row.archive_bundle_sha256) throw new Error("GRO_BUNDLE_HASH_INVALID");
      const bundle = JSON.parse(decoder.decode(await gunzip(packed))) as { schema?: string; entries?: Array<{ object_id?: string; archive_sha256?: string; archive_gzip_b64?: string }> };
      if (bundle.schema !== "geomacro.gro-bundle.v1" || !Array.isArray(bundle.entries)) throw new Error("GRO_BUNDLE_SHAPE_INVALID");
      const member = bundle.entries.find(entry => entry.object_id === id);
      if (!member || member.archive_sha256 !== row.archive_sha256 || typeof member.archive_gzip_b64 !== "string") throw new Error("GRO_BUNDLE_MEMBER_INVALID");
      compressed = decodeBase64(member.archive_gzip_b64);
      if (await sha256(compressed) !== row.archive_sha256) throw new Error("GRO_BUNDLE_MEMBER_HASH_INVALID");
    } else {
      compressed = await b2Get(`geomacro-evidence/v1/gro/${id}.json.gz`, access, secret);
      if (await sha256(compressed) !== row.archive_sha256) throw new Error("GRO_ARCHIVE_HASH_INVALID");
    }
    if (compressed.length > 2_000_000) throw new Error("GRO_MEMBER_TOO_LARGE");
    return new Response(compressed, { headers: { "content-type": "application/octet-stream", "cache-control": "private, no-store" } });
  } catch (cause) {
    console.error("GRO_ARCHIVE_READ_FAILED", cause instanceof Error ? cause.message : "unknown");
    return new Response("Archive unavailable", { status: 502 });
  }
});
