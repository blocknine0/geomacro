import { readFileSync, writeFileSync } from "node:fs";

function replaceOnce(path, before, after) {
  const source = readFileSync(path, "utf8");
  const count = source.split(before).length - 1;
  if (count !== 1) throw new Error(`${path}: expected exactly one replacement target, found ${count}`);
  writeFileSync(path, source.replace(before, after));
}

function replaceRegexOnce(path, expression, replacement) {
  const source = readFileSync(path, "utf8");
  const matches = source.match(expression);
  if (!matches || matches.length !== 1) throw new Error(`${path}: regex replacement target missing or ambiguous`);
  writeFileSync(path, source.replace(expression, replacement));
}

// Risk Gate runtime: keep SHA-256 for non-secret audit fingerprints, but use
// keyed credential digests for bearer authentication and one-time legacy repair.
replaceOnce(
  "src/lib/risk-gate-api.server.ts",
  `import {\n  requireRiskSupabase,\n} from "./risk-supabase.server";\n`,
  `import {\n  requireRiskSupabase,\n} from "./risk-supabase.server";\nimport {\n  apiCredentialDigest,\n} from "./api-credential-hash.server";\n`,
);

replaceRegexOnce(
  "src/lib/risk-gate-api.server.ts",
  /async function\nauthenticateClient\(\n  request: Request,\n\): Promise<ApiClientRow> \{[\s\S]*?\n\}\n\n\nasync function\nconsumeRateLimit/,
  `async function\nauthenticateClient(\n  request: Request,\n): Promise<ApiClientRow> {\n  const token =\n    extractBearerToken(\n      request,\n    );\n\n  const tokenHash =\n    apiCredentialDigest(\n      token,\n      "risk-gate-bearer",\n    );\n\n  const db =\n    requireRiskSupabase();\n\n  const lookup = async () =>\n    db\n      .from(\n        "risk_gate_api_clients",\n      )\n      .select(\n        [\n          "client_id",\n          "display_name",\n          "api_key_hash",\n          "enabled",\n          "requests_per_minute",\n        ].join(","),\n      )\n      .eq(\n        "api_key_hash",\n        tokenHash,\n      )\n      .maybeSingle();\n\n  let result =\n    await lookup();\n\n  if (result.error) {\n    throw new RiskGateApiError(\n      503,\n      "AUTH_BACKEND_UNAVAILABLE",\n      "Risk Gate authentication unavailable",\n    );\n  }\n\n  if (!result.data) {\n    const upgrade =\n      await db.rpc(\n        "upgrade_risk_gate_api_client_hash",\n        {\n          p_presented_credential: token,\n          p_hmac_hash: tokenHash,\n        },\n      );\n\n    if (upgrade.error) {\n      throw new RiskGateApiError(\n        503,\n        "AUTH_BACKEND_UNAVAILABLE",\n        "Risk Gate authentication unavailable",\n      );\n    }\n\n    if (\n      (upgrade.data as Record<string, unknown> | null)\n        ?.upgraded === true\n    ) {\n      result =\n        await lookup();\n\n      if (result.error) {\n        throw new RiskGateApiError(\n          503,\n          "AUTH_BACKEND_UNAVAILABLE",\n          "Risk Gate authentication unavailable",\n        );\n      }\n    }\n  }\n\n  if (!result.data) {\n    throw new RiskGateApiError(\n      401,\n      "INVALID_API_KEY",\n      "Invalid API key",\n    );\n  }\n\n  const client =\n    result.data as unknown as ApiClientRow;\n\n  if (\n    !secureHashEqual(\n      client.api_key_hash,\n      tokenHash,\n    )\n  ) {\n    throw new RiskGateApiError(\n      401,\n      "INVALID_API_KEY",\n      "Invalid API key",\n    );\n  }\n\n  if (!client.enabled) {\n    throw new RiskGateApiError(\n      403,\n      "CLIENT_DISABLED",\n      "Risk Gate client is disabled",\n    );\n  }\n\n  if (\n    !Number.isInteger(\n      client.requests_per_minute,\n    ) ||\n    client.requests_per_minute < 1 ||\n    client.requests_per_minute > 10000\n  ) {\n    throw new RiskGateApiError(\n      503,\n      "CLIENT_CONFIGURATION_INVALID",\n      "Risk Gate client configuration is invalid",\n    );\n  }\n\n  return client;\n}\n\n\nasync function\nconsumeRateLimit`,
);

replaceOnce(
  "src/lib/risk-gate-idempotency.server.ts",
  `import {\n  canonicalJson,\n} from "./canonical-json";\n`,
  `import {\n  canonicalJson,\n} from "./canonical-json";\nimport {\n  apiCredentialDigest,\n} from "./api-credential-hash.server";\n`,
);

replaceRegexOnce(
  "src/lib/risk-gate-idempotency.server.ts",
  /async function identifyClient\(\n  request: Request,\n\): Promise<ApiClientRow \| null> \{[\s\S]*?\n\}\n\n\nfunction jsonError/,
  `async function identifyClient(\n  request: Request,\n): Promise<ApiClientRow | null> {\n  const token = extractBearerToken(request);\n  if (!token) return null;\n\n  const tokenHash = apiCredentialDigest(\n    token,\n    "risk-gate-bearer",\n  );\n  const db = requireRiskSupabase();\n\n  const lookup = async () =>\n    db\n      .from("risk_gate_api_clients")\n      .select("client_id,api_key_hash,enabled")\n      .eq("api_key_hash", tokenHash)\n      .maybeSingle();\n\n  let result = await lookup();\n  if (result.error) return null;\n\n  if (!result.data) {\n    const upgrade = await db.rpc(\n      "upgrade_risk_gate_api_client_hash",\n      {\n        p_presented_credential: token,\n        p_hmac_hash: tokenHash,\n      },\n    );\n    if (upgrade.error) return null;\n    if (\n      (upgrade.data as Record<string, unknown> | null)\n        ?.upgraded === true\n    ) {\n      result = await lookup();\n      if (result.error) return null;\n    }\n  }\n\n  if (!result.data) return null;\n\n  const client = result.data as unknown as ApiClientRow;\n  if (\n    !client.enabled ||\n    !secureHashEqual(client.api_key_hash, tokenHash)\n  ) {\n    return null;\n  }\n\n  return client;\n}\n\n\nfunction jsonError`,
);

// Browser Testnet payment state is now memory-only. This intentionally trades
// reload recovery for removal of wallet/payment proof data from Web Storage.
replaceOnce(
  "public/testnet-console.js",
  `    const recoveryKey = \`geomacro-testnet-payment:\${account.entitlement_grant_id}\`;\n`,
  ``,
);
replaceRegexOnce(
  "public/testnet-console.js",
  /    function saveRecovery\(\) \{[\s\S]*?\n    \}\n\n    const panel/,
  `    function saveRecovery() {\n      // Intentionally memory-only: never persist request, wallet or payment proof.\n    }\n\n    const panel`,
);
replaceRegexOnce(
  "public/testnet-console.js",
  /      try \{ sessionStorage\.removeItem\(recoveryKey\); \} catch \{[\s\S]*?\n      \}\n/,
  ``,
);
replaceRegexOnce(
  "public/testnet-console.js",
  /    try \{\n      const saved = JSON\.parse\(sessionStorage\.getItem\(recoveryKey\) \|\| "null"\);[\s\S]*?\n    \} catch \{[\s\S]*?\n    \}\n\n    form\.addEventListener/,
  `    status.textContent = "Payment proofs stay only in memory. Do not refresh after submitting a Testnet payment; retry the existing payment in this tab if verification is delayed.";\n\n    form.addEventListener`,
);

// Developer API Key + Secret are likewise memory-only. Reload requires re-paste.
replaceOnce(
  "public/testnet-console-pricing.js",
  `  const CREDENTIAL_KEY = "geomacro-testnet-api-credential:v1";\n  const nativeFetch = window.fetch.bind(window);\n  let validatedKey = "";\n`,
  `  const nativeFetch = window.fetch.bind(window);\n  let validatedKey = "";\n  let inMemoryCredential = null;\n`,
);
replaceRegexOnce(
  "public/testnet-console-pricing.js",
  /  function storedCredential\(\) \{[\s\S]*?\n  \}\n\n  function parseCredentialPair/,
  `  function storedCredential() {\n    return credentialShape(inMemoryCredential);\n  }\n\n  function parseCredentialPair`,
);
replaceOnce(
  "public/testnet-console-pricing.js",
  `    if (persist) sessionStorage.setItem(CREDENTIAL_KEY, JSON.stringify(verified));\n`,
  `    if (persist) inMemoryCredential = verified;\n`,
);
replaceOnce(
  "public/testnet-console-pricing.js",
  `    help.textContent = "Paste the two-line API Key + API Secret copy from Testnet Access. It is kept only in this tab's session storage so reload can verify an already-submitted payment without sending another transfer.";\n`,
  `    help.textContent = "Paste the two-line API Key + API Secret copy from Testnet Access. The secret stays only in page memory and is never written to browser storage. Reloading requires you to paste it again.";\n`,
);
replaceOnce(
  "public/testnet-console-pricing.js",
  `      sessionStorage.removeItem(CREDENTIAL_KEY);\n      validatedKey = "";\n`,
  `      inMemoryCredential = null;\n      validatedKey = "";\n`,
);

// Static contract: browser secrets/payment proofs may not regress into Web Storage.
replaceOnce(
  "src/__tests__/testnet-credential-payment-e2e.test.ts",
  `    expect(consoleBridge).toContain("sessionStorage");\n    expect(consoleBridge).not.toContain("localStorage");\n`,
  `    expect(consoleBridge).not.toContain("sessionStorage");\n    expect(consoleBridge).not.toContain("localStorage");\n    expect(consoleBridge).toContain("never written to browser storage");\n`,
);

console.log("Applied CodeQL credential hardening transforms.");
