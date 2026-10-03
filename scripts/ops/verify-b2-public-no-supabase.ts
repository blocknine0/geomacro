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
  return originalFetch(input, init);
}) as typeof fetch;

const {
  b2PublicRuntimeConfigured,
  readB2PublicIntelligence,
  readB2PublicRisk,
} = await import("../../src/lib/b2-live.server.ts");

if (!b2PublicRuntimeConfigured()) {
  throw new Error("NO_SUPABASE_B2_RUNTIME_NOT_CONFIGURED");
}

const [intelligence, risk] = await Promise.all([
  readB2PublicIntelligence(),
  readB2PublicRisk(),
]);

if (!Array.isArray(intelligence) || intelligence.length === 0) {
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
