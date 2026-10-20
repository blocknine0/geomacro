import { createHash, createPublicKey, verify as ed25519Verify } from "node:crypto";
import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { parseExternalRiskGateBody } from "../lib/risk-gate-api.server";

const load = (p: string) => JSON.parse(readFileSync(p, "utf8"));
const root = "docs/partners/predge/";
const country = load(root + "risk-gate-request.json");
const corridor = load(root + "risk-gate-corridor-request.json");
const response = load(root + "risk-gate-response.json");
const signed = load(root + "gro-signed-test-vector.json");
const reference = load("docs/examples/gro-1.1-canonical-v1-test-vector.json");

function canonical(value: unknown): string {
  if (value === null || typeof value !== "object") {
    if (typeof value === "number" && !Number.isFinite(value)) throw Error("nonfinite");
    return JSON.stringify(value);
  }
  if (Array.isArray(value)) return "[" + value.map(canonical).join(",") + "]";
  const x = value as Record<string, unknown>;
  return "{" + Object.keys(x).sort()
    .map(k => JSON.stringify(k) + ":" + canonical(x[k])).join(",") + "}";
}

describe("Predge 20 October external contract and trust boundary", () => {
  it("accepts the actual live-parser country/corridor request forms", () => {
    const a = parseExternalRiskGateBody(country);
    const b = parseExternalRiskGateBody(corridor);
    expect(a).toMatchObject({subject_type:"country",subject_id:"USA",country_iso3:"USA"});
    expect(b).toMatchObject({
      subject_type:"corridor",subject_id:"IND>ARE",
      origin_country_iso3:"IND",destination_country_iso3:"ARE",
    });
    expect(() => parseExternalRiskGateBody({...country,subject:{type:"country",id:"USA"}}))
      .toThrow("subject contains unsupported field(s): id");
    expect(response.schema_version).toBe("risk-gate-1.0");
    expect(response.execution_authorized).toBe(false);
    expect(response.decision).toBe("PAUSE");
  });

  it("verifies the signed GRO TEST key + canonical digest without production trust claims", () => {
    const signable = {...signed,integrity:{...signed.integrity,payload_hash:null,signature:null}};
    const canonicalBytes = canonical(signable);
    const hash = createHash("sha256").update(canonicalBytes,"utf8").digest("hex");
    const key = createPublicKey({
      key:Buffer.from(reference.public_key_spki_b64,"base64"),format:"der",type:"spki",
    });
    expect(signed.integrity.signing_key_id).toBe("canonical-test-key-1");
    expect(signed.integrity.signature_scheme).toBe("Ed25519");
    expect(signed.integrity.canonicalization).toBe("geomacro-canonical-json-v1");
    expect(canonicalBytes).toBe(reference.canonical_signable_json);
    expect(hash).toBe(reference.expected_payload_hash);
    expect(signed.integrity.payload_hash).toBe(hash);
    expect(signed.integrity.signature).toBe(reference.signature_b64);
    expect(ed25519Verify(null,Buffer.from(canonicalBytes,"utf8"),key,
      Buffer.from(signed.integrity.signature,"base64"))).toBe(true);
    const modified = {...signable,risk:{...signable.risk,score:98}};
    expect(ed25519Verify(null,Buffer.from(canonical(modified),"utf8"),key,
      Buffer.from(signed.integrity.signature,"base64"))).toBe(false);
    expect(signed.verification.status).toBe("INCOMPLETE");
    expect(signed.commercial_eligibility.status).toBe("UNVERIFIED");
    expect(Date.parse(signed.expires_at)).toBeLessThan(Date.parse("2026-10-20T00:00:00Z"));
  });

  it("documents independent digest namespaces, rotations and no paid launch claims",()=>{
    const doc = readFileSync(root+"PREDGE_20261020_INTEGRATION_CONTRACT.md","utf8");
    expect(doc).toContain("context_sha256");
    expect(doc).toContain("integrity.payload_hash");
    expect(doc).toContain("context_sha256` directly");
    expect(doc).toContain("subject.country_iso3");
    expect(doc).toContain("requireRiskSupabase()");
    expect(doc).toContain("PREDGE_RESEARCH_NEWS_TOKEN_OVERRIDE");
    expect(doc).toContain("the old deterministic HMAC fallback");
    expect(doc).toContain("expired, incomplete and commercially unverified");
    expect(doc).toContain("execution_authorized:false");
  });
});
