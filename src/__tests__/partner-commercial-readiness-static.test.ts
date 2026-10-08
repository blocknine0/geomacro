import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

const read = (path: string) => readFileSync(path, "utf8");
const discovery = JSON.parse(
  read("public/.well-known/geomacro-partner-verification.json"),
) as any;
const assurance = JSON.parse(
  read("config/partner-assurance.v1.json"),
) as any;

describe("partner commercial readiness", () => {
  it("publishes a machine-readable external verification contract", () => {
    expect(discovery.schema_version).toBe("geomacro-partner-verification-v1");
    expect(discovery.risk_object.schema).toBe("gro-1.1");
    expect(discovery.risk_object.signature_scheme).toBe("Ed25519");
    expect(discovery.risk_object.canonicalization).toBe("geomacro-canonical-json-v1");
    expect(discovery.federation.supported_profile).toBe("federico-strict-evidence-v1");
    expect(discovery.federation.receiver_side_verification_required).toBe(true);
    expect(discovery.federation.receiver_pinned_issuer_signature_is_authentication_root).toBe(true);
    expect(discovery.federation.third_party_source_network_fetch_required).toBe(false);
    expect(discovery.risk_object.canonicalization_spec_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(discovery.risk_object.independent_verifier_sha256).toMatch(/^[0-9a-f]{64}$/);
    expect(discovery.federation.fail_closed).toBe(true);
    expect(assurance.partners.federico.delivery_profile).toBe("FEDERICO_STRICT");
    expect(assurance.partners.federico.subject_type).toBe("country");
    expect(assurance.partners.federico.subject_id).toBeNull();
  });

  it("keeps Federico repeatability verification no-spend and independent of live allowance", () => {
    const workflow = read(".github/workflows/federico-repeatability.yml");
    const verifier = read("scripts/check-federico-repeatability.mjs");
    expect(workflow).toContain('cron: "13 */6 * * *"');
    expect(workflow).not.toContain("INVINO_API_KEY");
    expect(workflow).not.toContain("use_partner_allowance=true");
    expect(verifier).toContain("POSITIVE_CONTROL_RUNS = 5");
    expect(verifier).toContain("POSITIVE_CONTROL_NON_DETERMINISTIC");
    expect(verifier).toContain("PUBLIC_PARTNER_CONTRACT_NON_DETERMINISTIC");
    expect(verifier).toContain("ACTIVE_TRUST_SET_CHANGED_WITHIN_PROBE");
    expect(verifier).toContain("partner_allowance_used: 0");
    expect(verifier).toContain("user_funds_used: false");
  });

  it("keeps commercial use contract-gated and derived-output bounded", () => {
    expect(discovery.commercial_path.production_pilot).toBe("contract_required");
    expect(discovery.commercial_path.custom_sla).toBe("contract_required");
    expect(discovery.commercial_path.data_redistribution).toBe(
      "derived-output-only unless separately licensed",
    );
    expect(discovery.security.no_execution_authority).toBe(true);
  });

  it("pins every manual partner assurance run to an explicit immutable candidate SHA", () => {
    const workflow = read(".github/workflows/day6-partner-assurance-final.yml");
    expect(workflow).toContain("candidate_sha:");
    expect(workflow).toContain("ref: ${{ steps.candidate.outputs.sha }}");
    expect(workflow).toContain('test "$(git rev-parse HEAD)" = "$EXPECTED_SHA"');
    expect(workflow).toContain("DISPATCH_SHA: ${{ github.sha }}");
    expect(workflow).toContain('CANDIDATE_SHA="${RAW_CANDIDATE_SHA:-$DISPATCH_SHA}"');
    expect(workflow).not.toContain("ref: main");
    expect(workflow).toContain("cancel-in-progress: false");
  });

  it("keeps exact evidence binding and independent proof verification in the partner preflight", () => {
    const preflight = read("scripts/invinoveritas-risk-object-preflight.ts");
    expect(preflight).toContain("record_sha256");
    expect(preflight).toContain("external_evidence");
    expect(preflight).toContain("execution_authorized: false");
    expect(preflight).toContain("independent_node");
    expect(preflight).toContain("partial_disclosure");
    expect(preflight).toContain('artifact_type: "general"');
    expect(preflight).toContain("parallel-arrays-same-index-v1");
    expect(preflight).toContain("transport_consistency_and_audit_only");
    expect(preflight).toContain('"disabled_for_admission"');
    expect(preflight).not.toContain('context_type: "country_risk_context"');
    expect(preflight).toContain('receiver_policy_id: "federico-global-country-risk-v2"');
    expect(preflight).toContain("subject_id: reviewSubjectId");
    expect(preflight).not.toContain('subject_id: "CHN"');
  });

  it("documents the path from evaluation to a commercial agreement", () => {
    const docs = read("docs/PARTNER_VERIFICATION_AND_COMMERCIAL_INTEGRATION.md");
    expect(docs).toContain("Technical evaluation");
    expect(docs).toContain("Limited production pilot");
    expect(docs).toContain("Commercial API or event delivery agreement");
    expect(docs).toContain("Technical success does not imply a commercial agreement");
  });
});
