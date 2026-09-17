import process from "node:process";
import { mkdirSync, writeFileSync } from "node:fs";

const PRODUCTION_HOSTS = new Set([
  "geomacro.live",
  "www.geomacro.live",
]);

const FORBIDDEN_RESPONSE_KEYS = new Set([
  "authorization",
  "api_key",
  "api_secret",
  "private_key",
  "secret",
  "service_role_key",
  "supabase_service_role_key",
  "app_supabase_service_role_key",
  "payment_signature",
]);

function env(name: string): string {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required`);
  return value;
}

export function validateSecurityProbeTarget(baseUrlInput: string, acknowledgement: string): URL {
  if (acknowledgement !== "STAGING_ONLY") {
    throw new Error("RISK_GATE_LOAD_TEST_ACK must equal STAGING_ONLY");
  }

  let baseUrl: URL;
  try {
    baseUrl = new URL(baseUrlInput);
  } catch {
    throw new Error("RISK_GATE_STAGING_BASE_URL must be a valid URL");
  }

  const hostname = baseUrl.hostname.toLowerCase();
  if (PRODUCTION_HOSTS.has(hostname)) {
    throw new Error("Production Geomacro host is blocked by the staging security probe");
  }

  const isLocal = hostname === "localhost" || hostname === "127.0.0.1" || hostname === "::1";
  if (baseUrl.protocol !== "https:" && !isLocal) {
    throw new Error("Staging security probe target must use HTTPS unless it is localhost");
  }

  if (baseUrl.username || baseUrl.password || baseUrl.search || baseUrl.hash) {
    throw new Error("Staging security probe base URL must not contain credentials, query parameters or fragments");
  }

  return baseUrl;
}

function normalizedKey(value: string): string {
  return value.trim().toLowerCase().replace(/[-.]/g, "_");
}

export function findSensitiveResponseKey(value: unknown, path = "$" ): string | null {
  if (Array.isArray(value)) {
    for (let index = 0; index < value.length; index += 1) {
      const found = findSensitiveResponseKey(value[index], `${path}[${index}]`);
      if (found) return found;
    }
    return null;
  }

  if (!value || typeof value !== "object") return null;

  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    const normalized = normalizedKey(key);
    if (
      FORBIDDEN_RESPONSE_KEYS.has(normalized) ||
      normalized.includes("service_role") ||
      normalized.includes("private_key") ||
      normalized.includes("api_secret")
    ) {
      return `${path}.${key}`;
    }

    const found = findSensitiveResponseKey(child, `${path}.${key}`);
    if (found) return found;
  }

  return null;
}

function executionBoundaryIsExplicitlyFalse(payload: unknown): boolean {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) return false;
  const root = payload as Record<string, unknown>;

  if (root.execution_authorized === false) return true;

  const riskGate = root.risk_gate;
  if (riskGate && typeof riskGate === "object" && !Array.isArray(riskGate)) {
    return (riskGate as Record<string, unknown>).execution_authorized === false;
  }

  return false;
}

function syntheticRequestBody() {
  return {
    request_id: `staging_security_probe_${Date.now()}`,
    subject: {
      type: "country",
      country_iso3: "USA",
    },
    action_context: {
      action_type: "staging_security_probe",
      currency: "USDC",
      metadata: {
        synthetic: true,
        security_probe: true,
      },
    },
    policy: {
      policy_id: "geomacro-staging-security-probe",
      policy_version: "1.0.0",
      continue_max_score: 35,
      reduce_limit_max_score: 55,
      require_approval_max_score: 75,
      minimum_confidence_for_auto_continue: 0.8,
      require_commercial_verification_for_continue: true,
      max_positive_delta_for_auto_continue: 10,
      hard_stop_driver_contributions: {
        sanctions: 20,
      },
    },
  };
}

async function runProbe() {
  const baseUrl = validateSecurityProbeTarget(
    env("RISK_GATE_STAGING_BASE_URL"),
    env("RISK_GATE_LOAD_TEST_ACK"),
  );
  const apiKey = env("RISK_GATE_STAGING_API_KEY");
  if (apiKey.length < 32 || apiKey.length > 512) {
    throw new Error("RISK_GATE_STAGING_API_KEY has invalid length");
  }

  const endpoint = new URL("/api/risk-gate", baseUrl);
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 10_000);

  try {
    const response = await fetch(endpoint, {
      method: "POST",
      headers: {
        authorization: `Bearer ${apiKey}`,
        "content-type": "application/json",
        "user-agent": "geomacro-staging-security-probe/1.0",
      },
      body: JSON.stringify(syntheticRequestBody()),
      signal: controller.signal,
    });

    const raw = await response.text();

    if (raw.includes(apiKey)) {
      throw new Error("Risk Gate staging response echoed the API key");
    }

    let payload: unknown;
    try {
      payload = JSON.parse(raw);
    } catch {
      throw new Error(`Risk Gate staging security probe returned non-JSON HTTP ${response.status}`);
    }

    const sensitivePath = findSensitiveResponseKey(payload);
    if (sensitivePath) {
      throw new Error(`Risk Gate staging response exposed a forbidden sensitive key at ${sensitivePath}`);
    }

    if (response.status !== 200) {
      throw new Error(`Risk Gate staging security probe expected HTTP 200, got ${response.status}`);
    }

    if (!executionBoundaryIsExplicitlyFalse(payload)) {
      throw new Error("Risk Gate staging response did not explicitly preserve execution_authorized=false");
    }

    const evidence = {
      suite: "risk-gate-staging-response-security-v1",
      generated_at: new Date().toISOString(),
      host: baseUrl.host,
      endpoint_path: endpoint.pathname,
      status: response.status,
      api_key_echo: false,
      forbidden_sensitive_key: false,
      execution_authorized: false,
      production_target: false,
      response_body_persisted: false,
      pass: true,
    };

    mkdirSync("artifacts", { recursive: true });
    writeFileSync(
      "artifacts/risk-gate-staging-response-security.json",
      `${JSON.stringify(evidence, null, 2)}\n`,
      "utf8",
    );

    console.log(JSON.stringify(evidence, null, 2));
  } finally {
    clearTimeout(timeout);
  }
}

export function runSelfTest() {
  for (const productionUrl of ["https://geomacro.live", "https://www.geomacro.live/"]) {
    let blocked = false;
    try {
      validateSecurityProbeTarget(productionUrl, "STAGING_ONLY");
    } catch (error) {
      blocked = error instanceof Error && error.message.includes("Production Geomacro host is blocked");
    }
    if (!blocked) throw new Error(`Self-test production guard failed for ${productionUrl}`);
  }

  const safe = { ok: true, risk_gate: { execution_authorized: false } };
  if (findSensitiveResponseKey(safe) !== null) {
    throw new Error("Self-test incorrectly marked a safe response as sensitive");
  }

  const unsafe = { nested: { service_role_key: "should-never-appear" } };
  if (!findSensitiveResponseKey(unsafe)?.endsWith("service_role_key")) {
    throw new Error("Self-test failed to detect a sensitive response key");
  }

  console.log("PASS: staging response security probe self-test");
}

if (process.argv.includes("--self-test")) {
  runSelfTest();
} else {
  await runProbe();
}
