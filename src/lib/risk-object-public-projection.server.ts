import type { GeomacroRiskObject } from "./risk-object-contract";
import { signRiskObject } from "./risk-object-signing.server";

const INTERNAL_EVIDENCE_KEYS = new Set([
  "source_id",
  "source_record_id",
  "source_ids",
  "source_record_ids",
  "source_families",
  "source_urls",
  "content_hashes",
  "evidence_refs",
]);

function stripInternalEvidence(value: Record<string, unknown>) {
  const output: Record<string, unknown> = {};
  for (const [key, child] of Object.entries(value)) {
    if (INTERNAL_EVIDENCE_KEYS.has(key)) continue;
    output[key] = child;
  }
  return output;
}

/**
 * Customer-facing signed Risk Object projection.
 *
 * The canonical internal GRO may contain private evidence lineage. Commercial
 * and public/demo delivery receives a separately signed projection with all
 * upstream source identities, raw evidence references and source-linked hashes
 * removed. The new signature covers exactly what the customer receives.
 */
export function createPublicSignedRiskObjectProjection(
  object: GeomacroRiskObject,
): GeomacroRiskObject {
  const projectedEvidence = object.evidence.map((entry) =>
    stripInternalEvidence(entry as unknown as Record<string, unknown>) as unknown as GeomacroRiskObject["evidence"][number],
  );

  const { reproducibility: _reproducibility, ...publicProvenance } = object.provenance;

  const projected: GeomacroRiskObject = {
    ...object,
    evidence: projectedEvidence,
    provenance: publicProvenance,
  };

  return signRiskObject(projected);
}
