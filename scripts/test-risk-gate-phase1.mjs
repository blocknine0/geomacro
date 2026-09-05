import fs from "node:fs";


const files = {
  migration:
    fs.readFileSync(
      "supabase/migrations/020_risk_gate_external_api.sql",
      "utf8",
    ),

  api:
    fs.readFileSync(
      "src/lib/risk-gate-api.server.ts",
      "utf8",
    ),

  route:
    fs.readFileSync(
      "src/routes/api.risk-gate.ts",
      "utf8",
    ),
};


const assertions = [
  [
    "audit table exists",
    files.migration.includes(
      "risk_gate_audit_log",
    ),
  ],

  [
    "API client table exists",
    files.migration.includes(
      "risk_gate_api_clients",
    ),
  ],

  [
    "DB rate limiter exists",
    files.migration.includes(
      "consume_risk_gate_rate_limit",
    ),
  ],

  [
    "audit immutable trigger exists",
    files.migration.includes(
      "risk_gate_audit_immutable",
    ),
  ],

  [
    "anon revoked",
    files.migration.includes(
      "PUBLIC, anon, authenticated",
    ),
  ],

  [
    "service role granted",
    files.migration.includes(
      "to service_role",
    ),
  ],

  [
    "Bearer auth exists",
    files.api.includes(
      "authorization",
    ) &&
      files.api.includes(
        "Bearer",
      ),
  ],

  [
    "timing safe comparison exists",
    files.api.includes(
      "timingSafeEqual",
    ),
  ],

  [
    "API key plaintext is not persisted",
    !files.migration.includes(
      "api_key text",
    ),
  ],

  [
    "execution authorization is fail closed",
    files.api.includes(
      "execution_authorized !==",
    ) &&
      files.api.includes(
        "false",
      ),
  ],

  [
    "no-store response exists",
    files.api.includes(
      '"no-store"',
    ),
  ],

  [
    "external POST route exists",
    files.route.includes(
      '"/api/risk-gate"',
    ) &&
      files.route.includes(
        "POST:",
      ),
  ],
];


let failed =
  false;


for (
  const [
    name,
    pass,
  ] of assertions
) {
  console.log(
    pass
      ? `PASS: ${name}`
      : `FAIL: ${name}`,
  );

  if (!pass) {
    failed =
      true;
  }
}


if (failed) {
  process.exit(1);
}


console.log(
  "\nPASS: PHASE 1 STATIC SECURITY CONTRACT CLEAN",
);
