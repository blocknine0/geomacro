import fs from "node:fs";
import process from "node:process";

const baseUrl = (process.env.GEOMACRO_EXTERNAL_SECURITY_BASE_URL || "https://geomacro.live").replace(/\/$/, "");
const expectedHost = process.env.GEOMACRO_EXTERNAL_SECURITY_EXPECTED_HOST || "geomacro.live";
const timeoutMs = Number(process.env.GEOMACRO_EXTERNAL_SECURITY_TIMEOUT_MS || "10000");

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

const url = new URL(baseUrl);
assert(url.protocol === "https:", "External security smoke requires HTTPS");
assert(url.hostname === expectedHost, `Refusing unexpected host ${url.hostname}`);

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    redirect: "follow",
    signal: AbortSignal.timeout(timeoutMs),
    headers: {
      "user-agent": "GeomacroExternalSurfaceSecurity/1.1",
      ...(init.headers || {}),
    },
    ...init,
  });
  const text = await response.text();
  return { response, text };
}

const home = await request("/");
assert(home.response.status === 200, `Homepage expected 200, got ${home.response.status}`);

const hsts = home.response.headers.get("strict-transport-security") || "";
const xcto = home.response.headers.get("x-content-type-options") || "";
const referrer = home.response.headers.get("referrer-policy") || "";
const csp = home.response.headers.get("content-security-policy") || "";
const xfo = home.response.headers.get("x-frame-options") || "";
const poweredBy = home.response.headers.get("x-powered-by") || "";

assert(/max-age=/i.test(hsts), "Missing Strict-Transport-Security max-age");
assert(xcto.toLowerCase() === "nosniff", "X-Content-Type-Options must be nosniff");
assert(referrer.length > 0, "Referrer-Policy header is required");
assert(poweredBy.length === 0, "X-Powered-By must not disclose the application stack");
assert(/deny|sameorigin/i.test(xfo) || /frame-ancestors/i.test(csp), "Clickjacking protection requires X-Frame-Options or CSP frame-ancestors");

const probeLiteral = "<script>window.__geomacro_launch_probe=1</script>";
const probe = await request(`/?__geomacro_security_probe=${encodeURIComponent(probeLiteral)}`);
assert(probe.response.status === 200, `Reflection probe expected 200, got ${probe.response.status}`);
assert(!probe.text.includes(probeLiteral), "Raw script reflection detected in homepage response");

const missing = await request("/__geomacro_launch_acceptance_missing_route__");
assert(!/ReferenceError:\s|TypeError:\s|at\s+\S+\s+\([^\n]+:\d+:\d+\)|node_modules\//i.test(missing.text), "Missing-route response appears to expose a server stack trace");

const sensitivePathProbes = [
  {
    path: "/.env",
    forbidden: ["SUPABASE_SERVICE_ROLE_KEY=", "CDP_API_KEY_SECRET=", "GEOMACRO_API_CREDENTIAL_PEPPER="],
  },
  {
    path: "/.git/HEAD",
    forbidden: ["ref: refs/heads/", "ref: refs/remotes/"],
  },
  {
    path: "/src/lib/risk-supabase.server.ts",
    forbidden: ["requireRiskSupabase", "SUPABASE_SERVICE_ROLE_KEY", "AUTHORITATIVE_RISK_PROJECT_REF"],
  },
  {
    path: "/server/middleware/00-central-security.ts",
    forbidden: ["enforceCentralRequestSecurity", "GEOMACRO_REAL_FUNDS_SECURITY_ACK"],
  },
  {
    path: "/supabase/migrations/930_central_security_abuse_control.sql",
    forbidden: ["central_security_request_buckets", "consume_central_security_budget"],
  },
  {
    path: "/package.json",
    forbidden: ["\"packageManager\"", "\"dependencies\"", "\"scripts\""],
  },
  {
    path: "/bun.lock",
    forbidden: ["lockfileVersion", "workspace"],
  },
  {
    path: "/wrangler.toml",
    forbidden: ["account_id", "compatibility_date", "vars"],
  },
];

const sensitiveProbeResults = [];
for (const item of sensitivePathProbes) {
  const result = await request(item.path);
  const leakedMarkers = item.forbidden.filter((marker) => result.text.includes(marker));
  assert(
    leakedMarkers.length === 0,
    `Sensitive path ${item.path} exposed forbidden marker(s): ${leakedMarkers.join(", ")}`,
  );
  assert(
    !/-----BEGIN (?:RSA |EC )?PRIVATE KEY-----/.test(result.text),
    `Sensitive path ${item.path} exposed private key material`,
  );
  sensitiveProbeResults.push({
    path: item.path,
    status: result.response.status,
    forbidden_markers_absent: true,
    private_key_material_absent: true,
  });
}

const securityTxt = await request("/.well-known/security.txt");
const securityTxtPresent = securityTxt.response.status === 200 && /contact:/i.test(securityTxt.text);

const evidence = {
  schema_version: "geomacro.external-surface-security-smoke.v1.1",
  generated_at: new Date().toISOString(),
  target: baseUrl,
  outside_in_http_check: true,
  destructive_testing: false,
  credentialed_testing: false,
  payment_performed: false,
  production_activation_performed: false,
  checks: {
    https_only: true,
    hsts: true,
    nosniff: true,
    referrer_policy: true,
    clickjacking_protection: true,
    x_powered_by_absent: true,
    raw_reflected_script_probe_absent: true,
    stack_trace_probe_absent: true,
    sensitive_file_markers_absent: true,
    private_key_material_absent: true,
    security_txt_present: securityTxtPresent,
    csp_present: csp.length > 0,
  },
  sensitive_path_probes: sensitiveProbeResults,
  response_headers: {
    "strict-transport-security": hsts,
    "x-content-type-options": xcto,
    "referrer-policy": referrer,
    "x-frame-options": xfo,
    "content-security-policy": csp,
  },
  result: "PASS"
};

fs.mkdirSync("artifacts", { recursive: true });
fs.writeFileSync("artifacts/external-surface-security-smoke.json", `${JSON.stringify(evidence, null, 2)}\n`);
console.log("PASS: outside-in non-destructive live security surface smoke passed.");
console.log("BOUNDARY: this is not a third-party penetration test or certification.");
