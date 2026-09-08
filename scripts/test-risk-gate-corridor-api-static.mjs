import fs from "node:fs";


const api =
  fs.readFileSync(
    "src/lib/risk-gate-api.server.ts",
    "utf8",
  );

const migration =
  fs.readFileSync(
    "supabase/migrations/031_risk_gate_corridor_audit_subject.sql",
    "utf8",
  );


const checks = [
  [
    "legacy country input retained",
    api.includes(
      "value.country_iso3",
    ),
  ],

  [
    "corridor parser present",
    api.includes(
      "origin_country_iso3",
    ) &&
      api.includes(
        "destination_country_iso3",
      ),
  ],

  [
    "corridor service routed",
    api.includes(
      "evaluateCorridorRiskGate",
    ) &&
      api.includes(
        'parsed.subject_type ===',
      ),
  ],

  [
    "success audit is subject-aware",
    api.includes(
      "parsed.subject_type",
    ) &&
      api.includes(
        "parsed.subject_id",
      ),
  ],

  [
    "failed requests stay fail-closed",
    api.includes(
      'subject_type:\n                  "unknown"'
    ) ||
      api.includes(
        'subject_type:\n                    "unknown"'
      ),
  ],

  [
    "audit type supports corridor",
    api.includes(
      '| "corridor"'
    ),
  ],

  [
    "migration permits corridor audit subjects",
    migration.includes(
      "'corridor'"
    ) &&
      migration.includes(
        "risk_gate_audit_subject_check"
      ),
  ],

  [
    "execution boundary remains non-authorizing",
    api.includes(
      "execution_authorized !=="
    ) &&
      api.includes(
        "false"
      ),
  ],
];


let failed = false;

for (
  const [
    name,
    pass,
  ] of checks
) {
  console.log(
    pass
      ? `PASS: ${name}`
      : `FAIL: ${name}`,
  );

  if (!pass) {
    failed = true;
  }
}


if (failed) {
  process.exit(1);
}


console.log(
  "\nPASS: COUNTRY + CORRIDOR API STATIC CONTRACT CLEAN",
);
