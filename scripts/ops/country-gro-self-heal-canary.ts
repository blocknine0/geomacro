#!/usr/bin/env bun
import { loadCommercialRiskObjectForAgentQuery } from "../../src/lib/agent-query-external-modules.server";
import { verifyCommercialRiskObjectArtifact } from "../../src/lib/commercial-risk-object-policy";
import { verifyRiskObjectSignature } from "../../src/lib/risk-object-signing.server";

const COUNTRY = String(process.env.GRO_SELF_HEAL_CANARY_COUNTRY ?? "CHN")
  .trim()
  .toUpperCase();
if (!/^[A-Z]{3}$/.test(COUNTRY)) throw new Error("GRO_SELF_HEAL_CANARY_COUNTRY_INVALID");

const asOf = new Date().toISOString();
const subject = { type: "country" as const, country_iso3: COUNTRY };

const first = await loadCommercialRiskObjectForAgentQuery(subject, asOf);
if (!first) throw new Error("GRO_SELF_HEAL_CANARY_FIRST_OBJECT_MISSING");
const firstSignature = verifyRiskObjectSignature(first);
const firstPolicy = verifyCommercialRiskObjectArtifact(first, { now: new Date(asOf) });
if (
  first.subject.type !== "country" ||
  first.subject.id !== COUNTRY ||
  !firstSignature.valid ||
  !firstPolicy.deliverable ||
  first.verification.status !== "VERIFIED" ||
  first.commercial_eligibility.status !== "VERIFIED" ||
  Date.parse(first.generated_at) > Date.parse(asOf) ||
  Date.parse(first.expires_at) <= Date.parse(asOf)
) throw new Error("GRO_SELF_HEAL_CANARY_FIRST_OBJECT_INVALID");

const second = await loadCommercialRiskObjectForAgentQuery(subject, asOf);
if (!second) throw new Error("GRO_SELF_HEAL_CANARY_SECOND_OBJECT_MISSING");
if (second.object_id !== first.object_id || second.integrity.payload_hash !== first.integrity.payload_hash) {
  throw new Error("GRO_SELF_HEAL_CANARY_CACHE_REUSE_FAILED");
}
const secondSignature = verifyRiskObjectSignature(second);
const secondPolicy = verifyCommercialRiskObjectArtifact(second, { now: new Date(asOf) });
if (!secondSignature.valid || !secondPolicy.deliverable) {
  throw new Error("GRO_SELF_HEAL_CANARY_SECOND_OBJECT_INVALID");
}

console.log(JSON.stringify({
  ok: true,
  schema: "geomacro.country-gro-self-heal-canary.v1",
  country_iso3: COUNTRY,
  evaluated_at: asOf,
  object_id: first.object_id,
  generated_at: first.generated_at,
  expires_at: first.expires_at,
  payload_hash: first.integrity.payload_hash,
  signing_key_id: first.integrity.signing_key_id,
  verification_status: first.verification.status,
  commercial_eligibility_status: first.commercial_eligibility.status,
  second_read_same_object: true,
  payment_performed: false,
  execution_authorized: false,
}));
