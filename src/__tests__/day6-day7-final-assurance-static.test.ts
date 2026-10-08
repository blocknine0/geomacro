import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

const read = (path: string) => readFileSync(path, "utf8");
const assurance = JSON.parse(read("config/partner-assurance.v1.json"));
const adapter = read("scripts/partner-assurance-adapter.ts");
const providerPreflight = read("scripts/invinoveritas-risk-object-preflight.ts");
const directDay6 = read("scripts/day6-direct-live-federico-gro.ts");
const day6Workflow = read(".github/workflows/day6-partner-assurance-final.yml");
const migration = read("workers/control-plane/migrations/0002_primary_runtime_authority.sql");
const partnerAssuranceMigration = read("workers/control-plane/migrations/0013_partner_assurance_gro_verified.sql");
const finalGate = read("scripts/ops/final-launch-gate-core.mjs");
const simulations = read("scripts/ops/simulate-final-launch-failures.mjs");

describe("Day 6 generic partner assurance", () => {
  it("keeps Federico behind shared cryptographic and evidence thresholds", () => {
    expect(assurance.schema).toBe("geomacro.partner-assurance.v1");
    expect(assurance.core_gates.risk_object_schema).toBe("gro-1.1");
    expect(assurance.core_gates.signature_scheme).toBe("Ed25519");
    expect(assurance.core_gates.canonicalization).toBe("geomacro-canonical-json-v1");
    expect(assurance.core_gates.minimum_independent_source_families).toBeGreaterThanOrEqual(2);
    expect(assurance.core_gates.live_review_after_local_gates_only).toBe(true);
    expect(assurance.core_gates.max_live_reviews_per_run).toBe(1);
    expect(assurance.core_gates.execution_authorized).toBe(false);
    expect(assurance.partners.federico.signed_partner_proof_required).toBe(true);
    expect(assurance.partners.federico.independent_proof_verification_required).toBe(true);
    expect(assurance.partners.federico.live_review_allowance_per_run).toBe(1);
    expect(assurance.partners.federico.subject_type).toBe("country");
    expect(assurance.partners.federico.subject_id).toBeNull();
    expect(assurance.partners.federico.note).toContain("every enabled uppercase ISO3 country");
  });

  it("maps a second partner without activating a weaker path", () => {
    expect(assurance.partners.goat.status).toBe("MAPPED_NOT_ACTIVATED");
    expect(assurance.partners.goat.live_review_allowed).toBe(false);
    expect(assurance.partners.goat.live_review_allowance_per_run).toBe(0);
    expect(assurance.partners.goat.note).toContain("core thresholds may not be lowered");
  });

  it("requires local gates before the single live review allowance", () => {
    const localCheck = adapter.indexOf("const buildUrl = new URL");
    const liveBlock = adapter.indexOf('if (mode === "live")');
    const providerCall = adapter.indexOf('spawnSync("bun"');
    expect(localCheck).toBeGreaterThan(-1);
    expect(liveBlock).toBeGreaterThan(localCheck);
    expect(providerCall).toBeGreaterThan(liveBlock);
    expect(adapter).toContain("LIVE_REVIEW_ALLOWANCE_NOT_EXPLICITLY_GRANTED");
    expect(adapter).toContain("SIGNED_PARTNER_PROOF_MISSING");
    expect(adapter).toContain("INDEPENDENT_PARTNER_PROOF_VERIFICATION_FAILED");
    expect(adapter).toContain('provider?.gates?.partner_admission !== "PASS"');
    expect(adapter).toContain('provider?.live_review?.verdict !== "approve"');
    expect(adapter).toContain('"LIVE_PARTNER_ADMISSION_REJECTED"');
    expect(adapter).toContain("provider_stderr");
    expect(adapter).toContain("review_response_path");
    expect(day6Workflow).toContain("Preserve Federico live-review diagnostics on failure");
    expect(day6Workflow).toContain("day6-federico-live-diagnostics-");
    expect(adapter).toContain("TAMPER_NOT_REJECTED");
    expect(adapter).toContain("verifyPublicRiskObjectArtifact");
    expect(adapter).toContain("LOCAL_PUBLIC_VERIFIER_REJECTED_ORIGINAL");
    expect(adapter).toContain("verification_keys: verificationKeys");
    expect(adapter).toContain("/.well-known/geomacro-build.json");
    expect(adapter).toContain("DEPLOYED_BUILD_MARKER_INVALID");
    expect(adapter).toContain("DEPLOYED_TRUST_VERIFICATION_UNAVAILABLE");
    expect(adapter).toContain('deployed_verifier_mode: "live_registry_client_local"');
    expect(adapter).toContain("tamperedPublicVerification");
    expect(adapter).not.toContain("async function deployedVerify");
    expect(adapter).not.toContain("DEPLOYED_VERIFIER_REJECTED_ORIGINAL");
  });

  it("keeps Federico provider preflight off the redundant deployed POST verifier", () => {
    expect(providerPreflight).toContain("live_registry_client_local");
    expect(providerPreflight).toContain("verifyRiskObjectSignature");
    expect(providerPreflight).toContain("verifyPublicRiskObjectArtifact");
    expect(providerPreflight).toContain("verification_keys: verificationKeys");
    expect(providerPreflight).toContain("tamperedPublicVerification");
    expect(providerPreflight).toContain("Original Risk Object failed live-registry local verification");
    expect(providerPreflight).toContain('verification_mode: verificationMode');
    expect(providerPreflight).toContain('verificationMode = "live_registry_client_local"');
    expect(providerPreflight).not.toContain("const original = await verify(riskObject)");
    expect(providerPreflight).not.toContain("const tamperResult = await verify(tampered)");
    expect(providerPreflight).toContain('receiver_purpose: "country_risk_context"');
    expect(providerPreflight).not.toContain('context_type: "country_risk_context"');
    expect(providerPreflight).toContain("signed_tuple_mapping");
    expect(providerPreflight).toContain("source_ids.length == source_record_ids.length == content_hashes.length > 0");
    expect(providerPreflight).toContain("receiver-maintained hostname allowlist");
    expect(providerPreflight).toContain("DNS-rebinding-resistant address pinning");
    expect(providerPreflight).toContain("verificationCommitSha");
    expect(providerPreflight).toContain("verificationSourcePins");
    expect(providerPreflight).toContain("verificationBundleSha256");
    expect(providerPreflight).toContain("receiver-preapproved immutable commit SHA");
    expect(providerPreflight).toContain("tamper_verification: tamperVerificationSummary");
    expect(providerPreflight).toContain("source_locator_policy");
    expect(providerPreflight).toContain("issuer content_hash values are continuity metadata");
    expect(providerPreflight).toContain("semantic_validation");
    expect(providerPreflight).toContain("ownership_registry_policy");
    expect(providerPreflight).toContain("methodology_replay_policy");
    expect(providerPreflight).toContain("contextual_only_no_automated_score_based_or_irreversible_action");
    expect(providerPreflight).toContain('"bun.lock"');
    expect(providerPreflight).toContain('"src/lib/country-risk-engine.ts"');
    expect(providerPreflight).toContain('"src/lib/country-risk-publisher.server.ts"');
    expect(providerPreflight).not.toContain("tamperResult.body?.verification ?? tamperResult.body,");
  });

  it("generates a country-agnostic strict GRO while keeping the Federico allowance explicit", () => {
    expect(day6Workflow).toContain("day6-direct-live-federico-gro.ts");
    expect(day6Workflow).toContain("candidate_sha:");
    expect(day6Workflow).toContain("DISPATCH_SHA");
    expect(day6Workflow).toContain("Checkout exact candidate SHA");
    expect(day6Workflow).toContain("steps.candidate.outputs.sha");
    expect(day6Workflow).toContain("use_partner_allowance:");
    expect(day6Workflow).toContain("default: false");
    expect(day6Workflow).toContain("inputs.use_partner_allowance == true");
    expect(day6Workflow).not.toContain("schedule:");
    expect(day6Workflow).toContain("GRI_DB_MODE: direct_postgres");
    expect(day6Workflow).toContain("B2_ARCHIVE_READ_KEY_ID");
    expect(day6Workflow).toContain("B2_ARCHIVE_READ_APPLICATION_KEY");
    expect(day6Workflow).toContain("CLOUDFLARE_API_TOKEN");
    expect(day6Workflow).toContain("CLOUDFLARE_ACCOUNT_ID");
    expect(day6Workflow).toContain("DAY6_COUNTRY_ISO3");
    expect(day6Workflow).toContain("partner_allowance_spent == false");
    expect(directDay6).not.toContain('const COUNTRY_ISO3 = "CHN"');
    expect(directDay6).toContain("DAY6_COUNTRY_ISO3");
    expect(directDay6).toContain("dryRunCountryRiskObject");
    expect(directDay6).toContain('delivery_profile: "FEDERICO_STRICT"');
    expect(directDay6).toContain("withRiskObjectObservationTimestamp");
    expect(directDay6).toContain("assertFedericoPublicationReady(dryRun.object)");
    expect(directDay6).toContain("signRiskObject(observationBound)");
    expect(directDay6).toContain("archive_write_acknowledged: true");
    expect(directDay6).toContain("b2_readback_verified: false");
    expect(directDay6).toContain("b2_readback_deferred: true");
    expect(directDay6).toContain("b2_get_required_for_assurance: false");
    expect(directDay6).toContain("d1_readback_verified: true");
    expect(directDay6).toContain("d1_exact_canonical_record_verified: true");
    expect(directDay6).toContain("d1_signature_verified: true");
    expect(directDay6).toContain("partner_assurance_gro_verified");
    expect(directDay6).toContain("loadPublicRiskObjectVerificationKeys");
    expect(directDay6).not.toContain("await b2.get(");
    expect(directDay6).toContain("raw_source_payload_stored: false");
    expect(directDay6).toContain("partner_allowance_spent: false");
    expect(partnerAssuranceMigration).toContain("CREATE TABLE IF NOT EXISTS partner_assurance_gro_verified");
    expect(partnerAssuranceMigration).toContain("PRIMARY KEY (partner, object_id)");
    expect(partnerAssuranceMigration).toContain("archive_write_acknowledged INTEGER NOT NULL");
    expect(partnerAssuranceMigration).toContain("archive_readback_verified INTEGER NOT NULL DEFAULT 0");
    expect(partnerAssuranceMigration).toContain("object_json TEXT NOT NULL");
  });
});

describe("Day 7 generic commercial authority cutover and disaster gate", () => {
  it("makes D1 primary only for compact metadata while preserving B2 and Durable Objects", () => {
    expect(migration).toContain("'runtime_authority'");
    expect(migration).toContain('"role":"primary"');
    expect(migration).toContain('"compact_metadata_only":true');
    expect(migration).toContain('"durable_payload_authority":"backblaze-b2"');
    expect(migration).toContain('"commerce_authority":"cloudflare-durable-objects"');
    expect(migration).toContain('"supabase_runtime_mode":"standby"');
    expect(migration).toContain('"supabase_required_for_serving":false');
  });

  it("requires every generic launch authority, excludes partner-specific assurance, and keeps real funds disabled", () => {
    for (const marker of [
      "d1_primary_control_plane",
      "b2_durable_authority",
      "durable_object_commerce",
      "supabase_cold_standby",
      "risk_object_trust",
      "scheduler_health",
      "exact_head_gates",
    ]) {
      expect(finalGate).toContain(marker);
    }
    expect(finalGate).toContain("partner_specific_assurance_required: false");
    expect(finalGate).not.toContain("partner_assurance:");
    expect(finalGate).toContain("supabase_destructive_retirement_authorized: false");
    expect(finalGate).toContain("payment_performed: false");
    expect(finalGate).toContain("real_funds_authorized: false");
    expect(finalGate).toContain("execution_authorized: false");
  });

  it("simulates generic production failure classes and requires fail-closed behavior", () => {
    for (const marker of [
      "d1_failure",
      "b2_failure",
      "risk_object_trust_failure",
      "payment_failure",
      "signing_failure",
      "scheduler_failure",
      "DID_NOT_FAIL_CLOSED",
      "SUPABASE_PRIMARY_MODE_DID_NOT_FAIL_CLOSED",
    ]) {
      expect(simulations).toContain(marker);
    }
    expect(simulations).not.toContain("partner_failure");
  });
});
