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
    expect(policy).toContain(
      'federico-source-family-map-v9',
    );
    expect(policy).toContain(
      '?? normalized',
    );
    expect(policy).toContain('ecb_press_rss: "european_central_bank"');
    expect(policy).toContain('ecb_market_information_rss: "european_central_bank"');
    expect(policy).toContain('bis_rss_media_releases: "bank_for_international_settlements"');
    expect(policy).toContain('bis_rss_central_banker_speeches: "bank_for_international_settlements"');
    expect(policy).toContain('un_geneva_press_rss: "united_nations"');
    expect(policy).toContain('"nrcan_news_atom"');
    expect(policy).toContain('"usgs_minerals_news_rss"');

    const corroborator = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );
    expect(corroborator).toContain("FEDERICO_STRICT_PROVIDER_FAMILY_BY_SOURCE_ID");
    expect(corroborator).toContain('ecb_market_information_rss: "european_central_bank"');
    expect(corroborator).toContain('bis_rss_central_banker_speeches: "bank_for_international_settlements"');
    expect(corroborator).toContain('return FEDERICO_STRICT_PROVIDER_FAMILY_BY_SOURCE_ID[sourceId] ?? sourceId');
    expect(corroborator).not.toContain("return row.source_id");
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

  it("keeps strict partner synchronization routed through the country-level source-diversity corroborator", () => {
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
    const rssCycle = read("scripts/run-rss-live-cycle.mjs");

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
      "def feed_source_timestamp_has_clock(entry: Any) -> bool:",
    );
    expect(worker).toContain(
      'for raw_key in ("published", "dc:date"):',
    );
    expect(worker).toContain(
      'return structured_time_to_iso(entry.get("published_parsed"))',
    );
    expect(worker).not.toContain(
      'for key in ("published_parsed", "updated_parsed", "created_parsed")',
    );
    expect(worker).toContain(
      '"fallback_url": "https://english.news.cn/china/index.htm"',
    );
    expect(worker).toContain(
      '"source_id": "scmp_china_rss"',
    );
    expect(ingest).toContain(
      'from("live_external_sources")',
    );
    expect(ingest).toContain(
      "enabled_for_ingestion",
    );
    expect(ingest).not.toContain(
      "ALLOWED_SOURCE_IDS",
    );
    expect(ingest).not.toContain(
      "github_oidc_source_not_allowed",
    );
    expect(policy).toContain(
      'xinhua_english_china_rss: "xinhua_english_china"',
    );
    expect(policy).toContain(
      'scmp_china_rss: "scmp_china"',
    );
    expect(rssCycle).toContain("RSS_LIVE_CYCLE_REQUIRES_DIRECT_POSTGRES");
    expect(rssCycle).toContain("configured_source_count");
    expect(rssCycle).toContain("completed_source_count");
    expect(rssCycle).toContain("edge_function_dependency: false");
    expect(rssCycle).not.toContain(".supabase.co/functions/v1/");

    const corroborator = read(
      "supabase/functions/live-flash-corroborate/index.ts",
    );
    expect(corroborator).toContain(
      "CORROBORATION_CANDIDATE_WINDOW_MINUTES = 90",
    );
    expect(corroborator).toContain(
      "CORROBORATION_CANDIDATE_LIMIT = 120",
    );
    expect(corroborator).toContain(
      "requestedCountryIso3",
    );
    const countryWindow = read("supabase/functions/live-flash-corroborate/country-window.ts");
    expect(corroborator).toContain("loadCountryCorroborationWindow");
    expect(countryWindow).toContain("live_flash_event_countries!inner(country_iso3)");
    expect(countryWindow).toContain('.eq("live_flash_event_countries.country_iso3", iso3)');
    expect(corroborator).toContain(
      '.contains("countries", [requestedCountryIso3])',
    );
    expect(corroborator).toContain(
      'structured_scope',
    );
    expect(corroborator).toContain(
      "CORROBORATION_REFERENCE_LIMIT = 600",
    );
    expect(corroborator).toContain(
      "Explicit country replays below scan the full six-hour window.",
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

  it("uses exact publication time instead of a renewed observation TTL", () => {
    const publisher = read(
      "src/lib/country-risk-publisher.server.ts",
    );

    expect(publisher).toContain(
      "function federicoStrictPublishedAt(",
    );
    expect(publisher).toContain(
      "/^\\d{4}-\\d{2}-\\d{2}$/u.test(raw)",
    );
    expect(publisher).toContain(
      "publishedMs > asOf.getTime()",
    );
    expect(publisher).toContain(
      "latestAuditableMember.published_at",
    );
    expect(publisher).toContain(
      'verification_status", "VERIFIED"',
    );
    expect(publisher).toContain(
      "source_record_id",
    );
    expect(publisher).toContain(
      "content_hash",
    );
    expect(publisher).not.toContain(
      "family.last_material_update_at ??",
    );
    expect(publisher).not.toContain(
      "latest.last_material_update_at ??",
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
      'data_projection_version',
    );
    expect(preflight).toContain(
      'country-risk-data-projection-v2',
    );
    expect(preflight).toContain(
      'compact reproducibility manifest',
    );
    expect(preflight).toContain(
      'compact evidence contains legacy duplicated provenance fields',
    );
    expect(preflight).toContain(
      "federicoStrictSourceFamilyForId",
    );
    expect(preflight).toContain(
      "source identity is absent from its signed runtime map",
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
      'verdict === "approve"',
    );
    expect(preflight).toContain(
      "issues.length === 0",
    );
    expect(preflight).toContain(
      "primary_auth_required: strictProfile",
    );
    expect(preflight).toContain(
      "demo_fallback_allowed: false",
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
    const countryRiskEngine = read("src/lib/country-risk-engine.ts");
    const publicRiskProfile = read("src/lib/public-demo-risk-profile.ts");
    expect(publicRiskProfile).toContain(
      "FEDERICO_STRICT_AUDITABLE_SOURCE_IDS",
    );
    expect(countryRiskEngine).toContain(
      "uncalibrated_uncertainty_interval",
    );
    const countryRiskPublisher = read("src/lib/country-risk-publisher.server.ts");
    expect(countryRiskEngine).toContain("risk-object");
    expect(countryRiskPublisher).toContain("publish");
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

    expect(workflow).toContain(
      "ref: ${{ github.event_name == 'workflow_run' && github.event.workflow_run.head_sha || github.sha }}",
    );
    expect(workflow).toContain(
      "json.load(handle)",
    );
    expect(workflow).toContain(
      "find . -maxdepth 1 -type f ! -name SHA256SUMS.txt -printf '%f\\n' | sort | xargs sha256sum > SHA256SUMS.txt",
    );
    expect(workflow).toContain("sha256sum -c SHA256SUMS.txt");

    const summaryIndex = workflow.indexOf(
      " > /tmp/federico-handoff/verification-summary.json",
    );
    const checksumIndex = workflow.indexOf(
      "find . -maxdepth 1 -type f ! -name SHA256SUMS.txt",
    );
    expect(summaryIndex).toBeGreaterThan(-1);
    expect(checksumIndex).toBeGreaterThan(summaryIndex);

    expect(preflight).toContain(
      "Risk Object must contain observed_at for review as_of binding",
    );
    expect(preflight).toContain(
      "console.error",
    );
    expect(preflight).not.toContain(
      "console.log(\n    JSON.stringify({\n      partner_review_issues",
    );
    expect(preflight).toContain(
      "as_of: observedAt",
    );
    expect(preflight).toContain(
      'artifact_version: "geomacro-invino-review-v7"',
    );
    expect(preflight).toContain(
      "external_evidence: [{",
    );
    expect(preflight).toContain(
      "record: externalEvidence[0].record",
    );
    expect(preflight).toContain(
      "reviewContextBytes > 4_000",
    );
    expect(preflight).toContain(
      "reviewArtifactBytes > 20_000",
    );
    expect(preflight).toContain(
      "decision_time_revalidation_required: true",
    );
    expect(preflight).toContain(
      "receiver-controlled trusted UTC time",
    );
    expect(preflight).toContain(
      "receiver-controlled approved key fingerprint",
    );
    expect(preflight).toContain(
      "issuer_attestations_are_not_trust_roots",
    );
    expect(preflight).toContain(
      "receiver_policy_id: \"federico-global-country-risk-v1\"",
    );
    expect(preflight).toContain(
      "minimum_independent_source_families: 2",
    );
    expect(preflight).toContain(
      "subject_id: reviewSubjectId",
    );
    expect(preflight).toContain(
      "!/^[A-Z]{3}$/.test(reviewSubjectId)",
    );
    expect(preflight).not.toContain(
      'subject_id: "CHN"',
    );
    expect(preflight).not.toContain(
      "federico-china-country-risk-v1",
    );
    expect(preflight).toContain(
      "maximum_inter_source_spread_ms: 2000",
    );
    expect(preflight).toContain(
      "reject_duplicate_keys: true",
    );
    expect(preflight).not.toContain(
      "cryptographic_attestation:",
    );
    expect(preflight).not.toContain(
      "trust_registry_attestation:",
    );
    expect(preflight).not.toContain(
      "freshness_attestation:",
    );
    const publisher = read(
      "src/lib/country-risk-publisher.server.ts",
    );
    expect(publisher).toContain(
      "issuer-derived provenance through the structured fallback",
    );
    expect(publisher).toContain(
      "hasTargetCountryAttribution",
    );
    expect(publisher).toContain(
      "item.country_iso3 === iso3",
    );
    expect(publisher).not.toContain(
      "FEDERICO_STRICT_CHINA_NEXUS_TERMS",
    );
    expect(publisher).not.toContain(
      "const fallback = await loadFedericoStructuredFallback(db, asOf, iso3);",
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

  it("locks generic runtime retry and derived drain boundaries", () => {
    const workflow = read(
      ".github/workflows/federico-seven-day-risk-refresh.yml",
    );
    const worker = read(
      "workers/telegram-flash/worker.py",
    );

    expect(workflow).toContain(
      "fragment_total=\"$(jq -r '.fragment_total // 0' \"${response_file}\")\"",
    );
    expect(workflow).toContain(
      "batch_size=\"$(jq -r '.batch_size // 0' \"${response_file}\")\"",
    );
    expect(workflow).not.toContain(
      "max_batches=32",
    );
    expect(worker).toContain(
      "http.client.IncompleteRead",
    );
    expect(worker).toContain(
      "ConnectionResetError",
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
