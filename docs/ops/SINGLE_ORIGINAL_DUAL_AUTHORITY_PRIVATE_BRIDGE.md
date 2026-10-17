# Founder-approved one-original: private dual-authority qualification

**Scope:** private, read-only qualification of one genuine factual original, not automatic commercial signed GRO, live GRI, risk index, public D1 hot publication, rights grant, or x402. This implements the next safe step of the founder's 2026-10-17 single-original policy. Original two-source machine / Federico contracts remain unchanged and cannot consume this private receipt.

## Trusted inputs

1. **Genuine official original:** Existing registered source ID and publisher organization, precise native UTC publication timestamp within six hours, authentic HTTPS HTML body SHA256, exact WHO/WHAT/WHERE/WHEN identity hash, category and ISO3. The existing single-original binding verifies real bytes; a URL hash or RSS/index timestamp fails.
2. **Article-specific permission:** Authorized internal legal rights custodian checks the actual original licence/permission, records document and permission-evidence SHA256, explicitly permits derived commercial use, disallows raw redistribution, reviews attribution terms and expiry. Source-wide B2 registry alone is NOT article permission. Synthetic fixture data cannot confer rights.
3. **Separate pinned Ed25519 authorities:** Facts auditor and rights custodian independently sign the SAME canonical single-original-dual-authority-proof.v1 bytes. Private issuer keys never enter browser, GitHub logs, public D1 or public API. Public keys and SHA256 SPKI pins must differ from each other and the GRO signing key.
4. **Governed registry:** Only after valid distinct signatures and exact proof binding, reread the original HTML and quota-governed B2 commercial source registry.

## Implemented now

- src/lib/single-original-private-authority.server.ts exports qualifySingleOriginalPrivateAuthority with a DISTINCT private trust profile.
- Proof pins exact event hash, original issuer/article bytes, native timestamp, independent corroboration FALSE, claim, attestation and permission windows, no contradictions/retractions, license-document hash and permission record hash.
- A valid proof returns SINGLE_ORIGINAL_DUAL_ATTESTED_PRIVATE_ONLY, immutable private proof SHA and event hash. It does NOT approve scoring, commercial GRO, GRI, payment or publication. No raw publisher material in receipt.
- Missing/tampered/expired/unknown authority rejects BEFORE external HTTP or B2. Changed actual HTML rejects before B2.
- CI tests are SYNTHETIC ONLY, not real licenses or trusted production signers.

## Further steps required for genuinely unattended commercial production

1. Obtain real article- or scope-specific permission with independently approved issuer identities and provision keys under separate controls.
2. Execute a genuinely recent positive one-issuer case with real facts review, signed legal authorization, hash-bound original readback and no funds.
3. Separately implement and accept a one-original scored-risk methodology explicitly reflecting source_count=1 and no independent corroboration. Never feed this into the existing two-original canonical commercial GRO scorer.
4. Explicitly wire newly approved signed product outputs to bounded, independent exact B2 gzip/SHA readback, Cloudflare D1 hot-promotion and idempotent clocks.
5. Adapt GRI v1.2 in a distinct properly authorized profile with genuine country/category certification and a state-snapshot methodology that does not invent new events in every category every 90 minutes.
6. Independently verify live HTTP 200 for all genuinely current signed products and no-funds x402. Never spend USDC without separate owner ACK.

Do not infer legal rights from B2 registry, backdate news, assert independent source count two, treat synthetic tests as permission, enable real funds, or turn 503 into false HTTP 200.

## Private source-free factual handoff (separate from GRO/GRI)

After a single real original and both signed authority proofs pass exact original HTML readback and current source-wide rights registry, the protected private operator now calls `preparePrivateSingleOriginalFactualHandoff`. Its hash-bound output admits **only** category, ISO3, signed event type, verified original native publication time, article-content SHA, event/proof hashes and the bounded permission expiry. It emits **no** source URL, issuer identity, quote, article body, score, severity, independent corroboration claim, GRI country certificate or customer-ready commercial GRO.

The private B2 operator prints only the proof and derived-input SHA. The handoff schema `geomacro.private-single-original-factual-handoff.v1` has `score:null`, `severity:null`, `independent_corroboration_verified:false`, `commercial_gro_signed:false`, `public_published:false` and `chargeable:false`. Neither this private handoff nor its SHA is a licence decision; actual original article permission must be made and signed by the authorized facts/rights issuers. Public serving still requires a separately audited single-original scoring/publication profile and fresh independent B2/D1 hot acceptance. Expired source clocks are not refreshed.
