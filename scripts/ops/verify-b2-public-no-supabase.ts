#!/usr/bin/env bun

for (const key of [
  "APP_SUPABASE_URL",
  "APP_SUPABASE_ANON_KEY",
  "APP_SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_URL",
  "SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_DB_URL",
]) {
  delete process.env[key];
}

const originalFetch = globalThis.fetch.bind(globalThis);
let supabaseNetworkAttempts = 0;
let directB2NetworkAttempts = 0;
// Public transport metadata only: no source rows, URLs, credentials, keys,
// response bodies, entitlement decisions or B2 quotas bypassed.
const governedReadTrace: Array<{service:string;status:number;authority:"EXPECTED"|"ABSENT_OR_OTHER";continuity:"PRESENT"|"ABSENT";data_available:"FALSE"|"UNSPECIFIED"}> = [];
const readService = (host:string,path:string):string|null =>
  host==="geomacro-intelligence.daspallab202391.workers.dev" && path==="/intelligence"
    ? "intelligence_edge"
    : host==="geomacro-global-risk.daspallab202391.workers.dev" && path==="/global-risk"
      ? "global_risk_edge" : null;

globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
  const value = input instanceof Request ? input.url : String(input);
  let target: URL | null = null;
  try {
    target = new URL(value);
  } catch {
    target = null;
  }
  const host = target?.hostname.toLowerCase() ?? "";
  if (host.endsWith(".supabase.co") || host.endsWith(".pooler.supabase.com")) {
    supabaseNetworkAttempts += 1;
    throw new Error("NO_SUPABASE_B2_ACCEPTANCE_BLOCKED_SUPABASE_NETWORK");
  }
  if (host==="s3.us-east-005.backblazeb2.com" ||
      host.endsWith(".backblazeb2.com")) {
    directB2NetworkAttempts += 1;
    throw new Error("NO_SUPABASE_B2_ACCEPTANCE_BLOCKED_UNMETERED_ORIGIN");
  }
  const service = readService(host, target?.pathname ?? "");
  let response: Response;
  try { response = await originalFetch(input, init); }
  catch {
    if(service && governedReadTrace.length < 8)
      governedReadTrace.push({service,status:0,authority:"ABSENT_OR_OTHER",
        continuity:"ABSENT",data_available:"UNSPECIFIED"});
    throw new Error("GOVERNED_PUBLIC_EDGE_TRANSPORT_UNAVAILABLE");
  }
  if(service && governedReadTrace.length < 8){
    governedReadTrace.push({
      service,status:response.status,
      authority:response.headers.get("x-geomacro-authority")===
        (service==="intelligence_edge"?"backblaze-b2-intelligence-edge":"backblaze-b2-verified-edge")
        ? "EXPECTED" : "ABSENT_OR_OTHER",
      continuity:response.headers.has("x-geomacro-continuity")?"PRESENT":"ABSENT",
      data_available:response.headers.get("x-geomacro-data-available")==="false"?"FALSE":"UNSPECIFIED",
    });
  }
  return response;
}) as typeof fetch;

const {
  readB2PublicIntelligence,
  readB2PublicRisk,
} = await import("../../src/lib/b2-live.server.ts");

// Public read uses only Cloudflare signed/proof-verified authority and does
// NOT receive private B2 S3 credentials. Cloudflare Workers independently
// reserve each cold B2 GET against the account-wide atomic D1 budget.
if (process.env.B2_KEY_ID || process.env.B2_APPLICATION_KEY ||
    process.env.B2_ARCHIVE_READ_KEY_ID || process.env.B2_ARCHIVE_READ_APPLICATION_KEY) {
  throw new Error("NO_SUPABASE_B2_PUBLIC_READER_S3_CREDENTIALS_FORBIDDEN");
}

const [intelligence, risk] = await Promise.all([
  readB2PublicIntelligence(),
  readB2PublicRisk(),
]);

if (!Array.isArray(intelligence) || intelligence.length === 0) {
  console.error(JSON.stringify({
    schema:"geomacro.b2-governed-runtime-diagnostic.v1",
    status:"INTELLIGENCE_EDGE_UNAVAILABLE",
    governed_public_edge_reads:governedReadTrace,
    direct_b2_network_attempts:directB2NetworkAttempts,
    supabase_network_attempts:supabaseNetworkAttempts,
    b2_proof_verified:false,
    paid_delivery_verified:false,
    credentials_or_source_data_logged:false,
  }));
  throw new Error("NO_SUPABASE_B2_INTELLIGENCE_UNAVAILABLE");
}
const categories = Array.from(
  new Set(intelligence.map((row) => String(row.category ?? "").toLowerCase())),
).sort();
for (const category of ["geopolitics", "macro", "rare_earth"]) {
  if (!categories.includes(category)) {
    throw new Error(`NO_SUPABASE_B2_CATEGORY_MISSING:${category}`);
  }
}

if (
  !risk ||
  risk.verificationStatus !== "verified" ||
  !/^[a-f0-9]{64}$/.test(String(risk.proofHash ?? "")) ||
  !/^[a-f0-9]{64}$/.test(String(risk.calculationHash ?? ""))
) {
  throw new Error("NO_SUPABASE_B2_RISK_PROOF_INVALID");
}

if (directB2NetworkAttempts !== 0) {
  throw new Error("NO_SUPABASE_B2_UNMETERED_ORIGIN_ATTEMPTED");
}
if (supabaseNetworkAttempts !== 0) {
  throw new Error(`NO_SUPABASE_B2_NETWORK_ATTEMPTED:${supabaseNetworkAttempts}`);
}

const supabaseCredentialsPresent = Boolean(
  process.env.APP_SUPABASE_URL ||
  process.env.APP_SUPABASE_ANON_KEY ||
  process.env.APP_SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_URL ||
  process.env.SUPABASE_ANON_KEY ||
  process.env.SUPABASE_SERVICE_ROLE_KEY ||
  process.env.SUPABASE_DB_URL
);
if (supabaseCredentialsPresent) {
  throw new Error("NO_SUPABASE_B2_CREDENTIAL_REAPPEARED");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.no-supabase-b2-public.v1",
  authority: "backblaze-b2",
  serving_authority: "cloudflare-quota-governed-verified-edge",
  direct_b2_network_attempts: directB2NetworkAttempts,
  b2_origin_quota_governed_at_worker: true,
  intelligence_rows: intelligence.length,
  categories,
  risk_verification_status: risk.verificationStatus,
  risk_snapshot_as_of: risk.snapshotAsOf,
  proof_hash_present: /^[a-f0-9]{64}$/.test(String(risk.proofHash ?? "")),
  calculation_hash_present: /^[a-f0-9]{64}$/.test(String(risk.calculationHash ?? "")),
  supabase_credentials_present: false,
  supabase_network_attempts: supabaseNetworkAttempts,
  payment_performed: false,
  destructive_change: false,
}));
