# Zero-cost offline Facts + Rights attestation runbook

Scope: this implements cryptographic offline issuance, not a claim that any licence or current event has already been verified. Existing facts/rights public pins, existing distinct private keys held offline, and third GRO key remain unchanged. No paid API, new DB, B2 write, payment or Supabase is used.

## 1. Genuine article/evidence input

Select ONE country/category real same-event claim with TWO to FOUR separately originated, current official article pages. Use existing original discovery and verifyGeomacroTwoOriginalMachineBinding. Store actual publisher-native clocks, exact article HTML SHA256, exact same-event SHA, independent organization IDs, and genuinely reviewed counterevidence/retractions. Never treat syndicated duplicates, URL hashes, historic observations or first-observed feed timestamps as original proof.

## 2. Separate legal clearance

Each actual original article requires commercial-derived-use permission and no public attribution requirement. The rights custodian must inspect the original licence/grant document and scope for EACH article body SHA. It may approve SCOPED_PUBLIC_DOMAIN_WITH_THIRD_PARTY_EXCLUDED only when legally applicable and independently checked, or ARTICLE_SPECIFIC_WRITTEN_PERMISSION when actual written consent exists. CC-BY, OGL, ECB attribution requirements and unknown terms do not automatically qualify. Exclude third-party text and protected database/trademark reuse; merely official or public information is NOT permission.

Permissions in the existing geomacro.automated-commercial-proof.v1 must match the exact actual permission document bytes SHA256, plus article scope SHA256 and valid time window. A signed approval is an independent rights custodian's decision, not an automated legal opinion.

## 3. Keys: stay offline

Protected read-only key audit found both existing role private keys NOT_AVAILABLE_IN_THIS_ENVIRONMENT on GitHub. Do not regenerate keys to force audit green, and do not upload private PEM to GitHub, PRs or chat. Maintain separate protected role workspaces outside repository, 0700 directories, 0600 input, approval records, rights documents, private keys and outputs. Set GEOMACRO_OFFLINE_AUTHORITY_ROOT to the custodian's private root. Set GEOMACRO_MACHINE_FACTS_PRIVATE_PEM_FILE or GEOMACRO_MACHINE_RIGHTS_PRIVATE_PEM_FILE to the EXISTING approved PEM for that role, and provide existing public PEM and SHA pins for both roles plus RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64. Different issuer processes must not share signing keys or approve one another's decision.

## 4. Private role submissions

The role's private input JSON must contain schema geomacro.offline-issuer-submission.v1, the exact existing MachineCommercialProof in proof, reviewed 2-4 candidates, review document filename review_document_file, and review object:

- schema geomacro.offline-issuer-review.v1; role facts or rights; decision APPROVED.
- proof_sha256: SHA256 of the existing canonicalRiskObjectJson(proof), original_evidence_set_sha256 equal to proof.exact_original_evidence_set_sha256.
- original_pages_reviewed=true, same_event_independence_reviewed=true, retraction_and_contradiction_reviewed=true; actual reviewed_at, and review_document_sha256 equal to exact private review-document bytes.
- Facts role must have no permission_documents.
- Rights role must additionally have article_scope_and_no_attribution_approved=true, third_party_material_excluded=true, license_basis for every article/source ID with approved scope basis, attribution_required=false, licensed_article_scope_sha256 exactly matching its proof.source_permissions entry, and permission_record_sha256 equal to exact reviewed licence-document bytes. permission_documents contains source_registry_id and a file basename for every permission document; its actual bytes SHA256 must match proof.source_permissions.permission_record_sha256.

Rights review is NOT automatically granted from the source registry. The custodian must independently read real licence documents and verify their applicability. All raw URLs, originals, review documents and permissions remain private.

## 5. Sign separately on own machines

Facts custodian (from repository checkout, with GEOMACRO_OFFLINE_AUTHORITY_ROOT=/secure/geomacro-facts and only the approved facts private key accessible):

    node scripts/ops/issue-offline-machine-commercial-proof.mjs --mode=issue --role=facts --input=facts-submission.json --out=facts-attestation.json

Rights custodian (separate protected workspace, own rights key and independently reviewed scope):

    node scripts/ops/issue-offline-machine-commercial-proof.mjs --mode=issue --role=rights --input=rights-submission.json --out=rights-attestation.json

Each role uses the existing original HTML byte and native-clock verifier again BEFORE its own signing. Wrong hashes, stale clocks, invalid licence-document byte hashes, wrong keys, expired grant or failed real first-party reread cause fail-closed rejection. CLI prints only a sanitized status, never keys, URLs, article bodies, approval text or signatures.

## 6. Assemble exact canonical commercial proof

Copy ONLY the two signature-receipt JSON files (not keys/raw articles/legal documents) to an owner-private assembly workspace. Its assembly input schema is geomacro.offline-machine-assembly.v1 with exact proof, candidates, event, optional country_name, and facts_attestation_file and rights_attestation_file basenames. Both signatures are checked against the distinct approved public Ed25519 pins and third GRO key must be independent.

    node scripts/ops/issue-offline-machine-commercial-proof.mjs --mode=assemble --input=assembly.json --out=private-request.json

After adjusting the PRE-EXISTING GEOMACRO_PRIVATE_REVIEW_DIR policy to your correct secured owner root (not bypassing it), pass the signed private request to the canonical private GRO verifier:

    bun scripts/ops/accept-private-geomacro-machine-commercial-gro.ts --input=/secure/geomacro-assembly/private-request.json --out=/secure/geomacro-assembly/private-prepared-gro.json

That existing final verifier ALSO checks actual source HTTP readback, B2 certified per-source rights registry, two exact proof signatures and distinct GRO private signer. Neither offline signing nor synthetic CI means commercial publication, independently audited machine-authority public publisher, GRI or Risk Indices production, deep-health 200, or payment authorization.

## 7. Remaining separately audited publisher acceptance

Existing intelligence-supabase-free-reviewed-current.yml requires an external independent reviewer, not a reviewer-free machine profile. Never submit a machine-signed GRO under that external review contract. A new separately labelled, auditable machine-authority Intelligence producer must be built before any signed B2/D1 current publication. Require genuine accepted 3-domain current inputs for GRI v1.2, an independent B2 baseline SHA, and current D1 GRI parent before Risk Indices. Keep exact native clocks, B2 quota/readback, deep-health 503 and zero funds until actual real evidence succeeds. No synthetic dated-event fixtures in production.

All tests here use synthetic issuer keys and fake official HTML inside isolated CI; they do not assert any actual real commercial legal permissions.
