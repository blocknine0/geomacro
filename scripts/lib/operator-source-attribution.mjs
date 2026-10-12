import { readFileSync } from "node:fs";
import { COMMERCIAL_SOURCE_RIGHTS_EVIDENCE } from "../commercial-source-rights-evidence.mjs";

// Reconciliation overlay is an AUDIT, never a source-licensing authority.
// Only the canonical, dataset-scoped rights evidence can authorize output.
const intake = JSON.parse(readFileSync(
  new URL("../../config/operator-76-source-attribution-intake.v1.json", import.meta.url),
  "utf8"
));
const byId = new Map(intake.entries.map(entry => [entry.id, entry]));

/**
 * Render the exact required provider credit *only* for evidence actually used
 * to generate a derived result. Never turn an unused registry entry into a
 * customer citation or infer commercial rights from a free website.
 *
 * Throws closed when a source's exact commercial dataset entitlement is
 * absent. This intentionally does NOT publish source URLs, article text,
 * unverified partners or private origin evidence.
 */
export function mandatoryDerivedSourceCredits(usedSourceIds) {
  if (!Array.isArray(usedSourceIds)) throw Error("SOURCE_CREDIT_USED_IDS_REQUIRED");
  const seen = new Set();
  const credits = [];
  for (const raw of usedSourceIds) {
    const id = String(raw ?? "").trim();
    const operator = byId.get(id);
    const evidenceId = operator?.canonical_existing_id ?? id;
    const evidence = COMMERCIAL_SOURCE_RIGHTS_EVIDENCE[evidenceId];
    if (!evidence || evidence.approved_status !== "VERIFIED") {
      throw Error("SOURCE_CREDIT_RIGHTS_NOT_VERIFIED");
    }
    if (evidence.attribution_required !== true) continue;
    const credit = String(evidence.attribution_text || evidence.provider || "").trim();
    if (!credit) throw Error("SOURCE_CREDIT_PROVIDER_MISSING");
    if (!seen.has(credit)) {seen.add(credit);credits.push(credit);}
  }
  return Object.freeze(credits);
}

/** Metadata/source-audit label, not proof the named publisher was used. */
export function registeredSourceDisplayName(id) {
  const entry = byId.get(String(id ?? ""));
  return entry ? entry.attribution.source_name : null;
}
