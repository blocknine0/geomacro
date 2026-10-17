// External-reviewer contract is unchanged; machine publication has its own adapter.
import { qualifyIndependentSameEvent } from "./independent-same-event-qualification.mjs";
import { publishQualifiedIntelligenceTransport } from "./qualified-intelligence-transport.mjs";
export function publishSupabaseFreePublicIntelligence(options) {
  return publishQualifiedIntelligenceTransport({...options,
    proofIdentity:{schema:"geomacro.public-intelligence-live-proof.v1",
      current_source_id:"qualified_independent_original_publishers_v1",
      current_evidence_contract:"geomacro.qualified-original-event-claims.v1"},
    qualify:input=>qualifyIndependentSameEvent({...input,
      trustedReviewerPublicKeyPem:options.trustedReviewerPublicKeyPem}),
  });
}
