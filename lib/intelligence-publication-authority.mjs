// Contract labels only; signature qualification stays in the trusted producer.
export const MACHINE_INTELLIGENCE_PROOF_SCHEMA = "geomacro.public-intelligence-machine-live-proof.v1";
export const REVIEWED_INTELLIGENCE_PROOF_SCHEMA = "geomacro.public-intelligence-live-proof.v1";
export const MACHINE_INTELLIGENCE_SOURCE_ID = "qualified_machine_original_publishers_v1";
export const MACHINE_INTELLIGENCE_EVIDENCE_CONTRACT = "geomacro.machine-qualified-original-event-claims.v1";
export function isIntelligenceProofSchema(schema) {
  return schema === REVIEWED_INTELLIGENCE_PROOF_SCHEMA || schema === MACHINE_INTELLIGENCE_PROOF_SCHEMA;
}
export function isIntelligenceSourceContract(proof) {
  return proof?.schema === REVIEWED_INTELLIGENCE_PROOF_SCHEMA
    ? proof.current_source_id === "qualified_independent_original_publishers_v1" &&
      proof.current_evidence_contract === "geomacro.qualified-original-event-claims.v1"
    : proof?.schema === MACHINE_INTELLIGENCE_PROOF_SCHEMA &&
      proof.current_source_id === MACHINE_INTELLIGENCE_SOURCE_ID &&
      proof.current_evidence_contract === MACHINE_INTELLIGENCE_EVIDENCE_CONTRACT &&
      proof.authority_profile === "GEOMACRO_AUTOMATED_CROSS_SOURCE_NOT_EXTERNAL_REVIEWED_V1" &&
      proof.external_reviewer_attested === false;
}
