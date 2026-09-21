import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

function read(path: string) {
  return readFileSync(path, "utf8");
}

describe("Federico strict Risk Object acceptance policy", () => {
  it("pins freshness, independence and high-impact policy constants", () => {
    const policy = read("src/lib/public-demo-risk-profile.ts");

    expect(policy).toContain(
      'FEDERICO_STRICT_MAX_EVIDENCE_AGE_HOURS = 6',
    );
    expect(policy).toContain(
      'FEDERICO_STRICT_HIGH_IMPACT_MAX_AGE_HOURS = 3',
    );
    expect(policy).toContain(
      'FEDERICO_STRICT_HIGH_IMPACT_SEVERITY = 70',
    );
    expect(policy).toContain(
      'FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES = 2',
    );
    expect(policy).toContain(
      'FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY = 0.45',
    );
    expect(policy).toContain(
      'FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD = 65',
    );
    expect(policy).toContain(
      'controlled_live_flash_source_family_v2',
    );
    expect(policy).toContain(
      'country_bridge_attribution_v1',
    );
  });

  it("pins the two-independent-source Federico verification contract", () => {
    const corroborator = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );

    expect(corroborator).toContain(
      "FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES = 2",
    );
    expect(corroborator).toContain(
      "FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY = 0.45",
    );
    expect(corroborator).toContain(
      "FEDERICO_STRICT_VERIFICATION_SCORE_THRESHOLD = 65",
    );
    expect(corroborator).toContain(
      "distinctSourceCount >= FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES",
    );
    expect(corroborator).toContain(
      "countryAgreement",
    );
    expect(corroborator).toContain(
      "maxSimilarity >= FEDERICO_STRICT_MULTI_SOURCE_MIN_SIMILARITY",
    );
    expect(corroborator).not.toContain(
      "distinctSourceCount >= 3 && maxSimilarity >= 0.40",
    );
  });

  it("preserves country attribution on idempotent live-flash duplicates", () => {
    const ingest = read(
      "supabase/functions/live-flash-ingest/index.ts",
    );

    expect(ingest).toContain(
      'const existingCountryResult = await db',
    );
    expect(ingest).toContain(
      '.from("live_flash_event_countries")',
    );
    expect(ingest).toContain(
      "countries: (existingCountryResult.data ?? []).map",
    );
    expect(ingest).toContain(
      'verification_status: "UNCHANGED"',
    );
  });

  it("keeps Federico CHN synchronization routed through the country-level source-diversity corroborator", () => {
    const workflow = read(
      ".github/workflows/federico-seven-day-risk-refresh.yml",
    );
    const corroborator = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );

    expect(workflow).toContain(
      "live-flash-corroborate",
    );
    expect(workflow).toContain(
      "fresh RSS and structured evidence corroboration completed",
    );
    expect(corroborator).toContain(
      "familySourceFamilies",
    );
    expect(corroborator).toContain(
      "distinctSourceCount >= FEDERICO_STRICT_MIN_INDEPENDENT_SOURCE_FAMILIES",
    );
    expect(corroborator).toContain(
      "strongStructuredMatch",
    );
    expect(corroborator).toContain(
      "strongMultiSourceMatch",
    );
    expect(workflow).not.toContain(
      "independentSourceFamilies.size >= 2",
    );
    expect(workflow).not.toContain(
      "Number(family.independent_source_count ?? 0) >= 2",
    );
  });

  it("pins the governed CHN-capable RSS source contract", () => {
    const worker = read(
      "workers/telegram-flash/worker.py",
    );
    const ingest = read(
      "supabase/functions/live-flash-ingest/index.ts",
    );
    const policy = read(
      "src/lib/public-demo-risk-profile.ts",
    );
    const rssWorkflow = read(
      ".github/workflows/testnet-rss-live-runner.yml",
    );

    expect(worker).toContain(
      '"source_id": "xinhua_english_china_rss"',
    );
    expect(worker).toContain(
      '"url": "https://www.xinhuanet.com/english/rss/chinarss.xml"',
    );
    expect(worker).toContain(
      '"country_iso3": "CHN"',
    );
    expect(worker).toContain(
      '"max_entry_age_hours": 24',
    );
    expect(worker).toContain(
      '"fallback_url": "https://english.news.cn/china/index.htm"',
    );
    expect(worker).toContain(
      '"source_id": "scmp_china_rss"',
    );
    expect(ingest).toContain(
      '"xinhua_english_china_rss"',
    );
    expect(ingest).toContain(
      '"scmp_china_rss"',
    );
    expect(policy).toContain(
      'xinhua_english_china_rss: "xinhua_english_china"',
    );
    expect(policy).toContain(
      'scmp_china_rss: "scmp_china"',
    );
    expect(rssWorkflow).toContain(
      "xinhua_english_china_rss",
    );
    expect(rssWorkflow).toContain(
      "scmp_china_rss",
    );
  });

  it("keeps production migration deployment safe for known out-of-order history", () => {
    const workflow = read(
      ".github/workflows/deploy-country-flash-supabase.yml",
    );

    expect(workflow).toContain(
      "Found local migration files to be inserted before the last migration on remote database.",
    );
    expect(workflow).toContain(
      "supabase db push --db-url \"$SUPABASE_DB_URL\" --include-all --dry-run",
    );
    expect(workflow).toContain(
      'SUPABASE_MIGRATION_INCLUDE_ALL=true',
    );
    expect(workflow).toContain(
      'supabase db push --db-url "$SUPABASE_DB_URL" --include-all',
    );
  });

  it("registers every governed Xinhua source before event ingestion", () => {
    const sourceRegistry = read(
      "supabase/migrations/20260919103000_register_xinhua_china_rss.sql",
    );
    const worker = read(
      "workers/telegram-flash/worker.py",
    );

    expect(sourceRegistry).toContain(
      "'xinhua_english_china_rss'",
    );
    expect(sourceRegistry).toContain(
      "'https://www.xinhuanet.com/english/rss/chinarss.xml'",
    );
    expect(sourceRegistry).toContain(
      "enabled_for_ingestion",
    );
    expect(sourceRegistry).toContain(
      "enabled_for_commercial_signals",
    );
    expect(worker).toContain(
      '"source_id": "xinhua_english_china_rss"',
    );
  });

  it("pins the authoritative production lifecycle migrations", () => {
    const lifecycle = read(
      "supabase/migrations/955_realtime_event_family_lifecycle.sql",
    );
    const versions = read(
      "supabase/migrations/956_event_family_version_ledger.sql",
    );

    expect(lifecycle).toContain(
      "create table if not exists public.live_flash_event_families",
    );
    expect(lifecycle).toContain(
      "alter table public.live_flash_events",
    );
    expect(lifecycle).toContain(
      "last_material_update_at timestamptz",
    );
    expect(versions).toContain(
      "live_flash_event_family_versions",
    );
    expect(versions).toContain(
      "unique (family_id, version)",
    );
  });

  it("keeps isolated Telegram migrations outside the production track", () => {
    const productionWorkflow = read(
      ".github/workflows/deploy-country-flash-supabase.yml",
    );
    const isolatedWorkflow = read(
      ".github/workflows/deploy-telegram-signal-supabase.yml",
    );

    expect(productionWorkflow).not.toContain(
      "supabase/isolated-signal",
    );
    expect(productionWorkflow).toContain(
      "supabase/migrations/**",
    );
    expect(isolatedWorkflow).toContain(
      "SUPABASE_WORKDIR=supabase/isolated-signal",
    );
  });

  it("uses material evidence time instead of a renewed observation TTL", () => {
    const publisher = read(
      "src/lib/country-risk-publisher.server.ts",
    );

    expect(publisher).toContain(
      "family.last_material_update_at",
    );
    expect(publisher).toContain(
      "latest.last_material_update_at",
    );
    expect(publisher).toContain(
      "last_material_update_at",
    );
    expect(publisher).toContain(
      'verification_status", "VERIFIED"',
    );
    expect(publisher).toContain(
      "last_material_update_at",
    );
    expect(publisher).toContain(
      "source_record_id",
    );
    expect(publisher).toContain(
      "content_hash",
    );
    expect(publisher).not.toContain(
      "legacy_schema_compat",
    );
    expect(publisher).not.toContain(
      "PGRST205",
    );
  });

  it("binds independently verifiable trust metadata and reproducibility", () => {
    const signer = read(
      "src/lib/risk-object-signing.server.ts",
    );
    const preflight = read(
      "scripts/invinoveritas-risk-object-preflight.ts",
    );

    expect(signer).toContain(
      "https://geomacro.live/api/risk-object-keys",
    );
    expect(signer).toContain(
      "public_key_spki_b64",
    );
    expect(preflight).toContain(
      "Reproducibility manifest input_hash mismatch",
    );
    expect(preflight).toContain(
      "partner_proof_verification",
    );
    expect(preflight).toContain(
      "independentNode",
    );
  });

  it("requires substantive partner admission, not just proof presence", () => {
    const preflight = read(
      "scripts/invinoveritas-risk-object-preflight.ts",
    );
    const workflow = read(
      ".github/workflows/federico-seven-day-risk-refresh.yml",
    );
    const schemaGuard = read(
      "supabase/migrations/957_repair_federico_event_family_schema.sql",
    );

    expect(preflight).toContain(
      '["approve", "approve_with_concerns"].includes(verdict)',
    );
    expect(preflight).toContain(
      "blockerCount === 0",
    );
    expect(preflight).toContain(
      'const highCount = severityCount("high");',
    );
    expect(preflight).toContain(
      'high_count: highCount,',
    );
    expect(workflow).toContain(
      '.gates.partner_admission == "PASS"',
    );
    expect(workflow).toContain(
      '.gates.partner_proof_verification == "PASS"',
    );
    expect(workflow).toContain(
      "FEDERICO_STRICT",
    );
    expect(schemaGuard).toContain(
      "live_flash_event_families",
    );
    expect(schemaGuard).toContain(
      "live_flash_event_family_versions",
    );
  });
  it("locks Federico handoff artifact integrity and exact-SHA reproducibility", () => {
    const workflow = read(
      ".github/workflows/federico-seven-day-risk-refresh.yml",
    );
    const preflight = read(
      "scripts/invinoveritas-risk-object-preflight.ts",
    );
    const canonicalSpec = read(
      "docs/GRO_CANONICAL_JSON_V1.md",
    );

    const exactShaRef =
      "ref: " +
      "${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}";
    expect(workflow).toContain(exactShaRef);
    expect(workflow).toContain(
      "json.load(handle)",
    );
    expect(workflow).toContain(
      "sha256sum GRO_CANONICAL_JSON_V1.md gro-1.1-canonical-v1-edge-vectors.json gro-1.1-canonical-v1-test-vector.json gro-1.1.schema.json federico-risk-object.json review-request.json review-response.json verification-summary.json > SHA256SUMS.txt",
    );

    const summaryIndex = workflow.indexOf(
      " > /tmp/federico-handoff/verification-summary.json",
    );
    const checksumIndex = workflow.indexOf(
      "verification-summary.json > SHA256SUMS.txt",
    );
    expect(summaryIndex).toBeGreaterThan(-1);
    expect(checksumIndex).toBeGreaterThan(summaryIndex);

    expect(preflight).toContain(
      "Risk Object must contain observed_at for review as_of binding",
    );
    expect(preflight).toContain(
      "as_of: observedAt",
    );
    expect(preflight).toContain(
      'artifact_version: "geomacro-invino-review-v2"',
    );
    expect(preflight).toContain(
      "risk_object: riskObject",
    );
    expect(preflight).toContain(
      'as_of_source: "risk_object.observed_at"',
    );
    expect(preflight).toContain(
      "signature: riskObject.integrity.signature",
    );
    expect(canonicalSpec).toContain(
      "Number::toString",
    );
    const trustApi = read(
      "docs/RISK_OBJECT_TRUST_API.md",
    );
    expect(trustApi).toContain(
      "Current verification status is verifier-derived",
    );
    expect(trustApi).toContain(
      "embedded `verification.status`",
    );
  });

  it("locks runtime retry boundaries so known transient failures cannot regress into premature hard failures", () => {
    const workflow = read(
      ".github/workflows/federico-seven-day-risk-refresh.yml",
    );

    expect(workflow).toContain(
      'for attempt in 1 2 3 4 5 6 7 8; do',
    );
    expect(workflow).toContain(
      '[[ "${attempt}" -lt 8 ]] || {',
    );
    expect(workflow).toContain(
      "--retries 5 --timeout 30 -r workers/telegram-flash/requirements.txt",
    );
    expect(workflow).toContain(
      "--retry 5 --retry-all-errors --retry-delay 2 --retry-max-time 120",
    );
  });

  it("locks the canonical edge-vector regression fixture", () => {
    const test = read(
      "src/__tests__/canonical-json-v1-test-vector.test.ts",
    );
    const vector = read(
      "docs/examples/gro-1.1-canonical-v1-edge-vectors.json",
    );

    expect(test).toContain(
      "gro-1.1-canonical-v1-edge-vectors.json",
    );
    expect(vector).toContain(
      "\"sha256\": \"31e5621fc0e2cca45a9e9b4c0eac9e0c748b2dcbb03bcfd7c093580626eb8caf\"",
    );
  });

});
