# Geomacro — Owner-Controlled Commercial License for Original Derived Outputs

**Policy ID:** `geomacro.owner-derived-output-commercial-grant.v1`  
**Effective declaration:** 2026-10-18  
**Authority:** Geomacro, solely to the extent it legally owns or controls the licensed rights.  
**Boundary:** Rights in Geomacro's original derived expression and analysis, **not** any third-party source.

## 1. Owner's commercial permission

Geomacro authorizes commercial use of **eligible Geomacro-original derived structured output** delivered by an authorized Geomacro product/API, under this policy and any applicable customer contract. Subject to the exclusions below, the recipient receives a non-exclusive, worldwide, non-transferable right to use the contracted output in internal operations, analytics, automated agents and decisions, and to display or incorporate relevant derived findings within its own products or reports in accordance with its agreement. Rights to repackage an entire Geomacro feed as a competing raw-data resale service, distribute the source code or access secrets, or sublicense the Geomacro platform are not granted.

This declaration does **not** warrant that facts themselves are proprietary or copyrightable and does not assert ownership of independent third-party content. A purchaser must respect the scope of the product contract, delivery limitations and third-party restrictions, including any legally required attribution.

## 2. What Geomacro does not and cannot self-license

Geomacro's owner declaration does **not** convey or replace permission from other rightsholders for:

- Original newspaper/publisher text, HTML, images, video, quoted headlines, or upstream article titles;
- A dataset or database that requires attribution, permission, subscription, or a special commercial-use licence;
- Publisher trademarks, logos, API credentials, and rights belonging to other organizations;
- Government-hosted third-party materials or separately licensed components.

**Public access, absence of an API key, an HTTP 200, official-source status, an internal rights flag, and Geomacro's own declaration are not upstream commercial-use permission.** A source subject to CC BY/OGL attribution can be commercially reused only under the applicable attribution terms; a no-attribution delivery contract must either satisfy the lawfully applicable exception or exclude that source.

## 3. Three independent gates

1. **Geomacro output ownership/terms** — the owner may grant its own output-use licence by this published, version-controlled declaration. No external reviewer need approve Geomacro's grant of rights it controls.
2. **Upstream factual/source eligibility** — independently verify that the precise original/data source can lawfully support the intended derived output, including provenance/attribution and extraction terms. For current private one-original qualification, existing independently approved Facts and Rights signatures remain mandatory unless an independently reviewed and lawfully supported alternative trust profile is implemented.
3. **Commercial production acceptance** — product-specific scoring/methodology, data freshness, verified source clocks, B2/D1 readback, commercial x402 settlement gating and actual deployment parity remain separate. **Granting Geomacro output rights alone does not turn any of these gates green.**

## 4. Cryptographic and implementation semantics

An internal issuer may attach a deterministic, SHA-256-bound `geomacro.owner-derived-output-commercial-grant.v1` manifest to a qualifying **Geomacro-authored** derived-output payload. Its `owner_output_use_granted` field refers **only** to rights Geomacro controls, not to a source licence, external reviewer approval, Gro/GRI signed readiness, x402 eligibility, or a public product. The manifest carries no third-party URL, article bytes or publisher identity.

This owner declaration is an express internal policy, **not** a cryptographic attestation by a third-party rights owner, not proof of legal title, and not customer acceptance of terms. Source-use and production gates continue to fail closed. Do not alter the existing strict no-attribution, independent-original or legacy signed hot snapshot contracts to make these two types of rights appear interchangeable.

## Customer-facing Structured Intelligence Commercial License

The Geomacro-owned output grant is reflected in the exact versioned customer
license exposed by `GET /api/intelligence/capabilities?view=license`:
`geomacro.structured-intelligence-commercial-license.v1`.

No raw news, source HTML or upstream dataset is transferred to customers.
Permitted internal/embedded customer use applies only to eligible derived
structured output delivered under a valid order or agreement. The customer
cannot infer a licence to redistribute Geomacro's full feed or any upstream
provider material. The linked API licence is accessible even while the
website presentation lock prevents creating additional static pages.

The machine licence and x402 402/200 response-header references are
**terms disclosure only**, not evidence that the customer has accepted the
terms, licensed an upstream source, paid USDC, or that signed current
Intelligence/GRI/Risk Indices have recovered.

## 5. Operational control

- Owner can revise the version-controlled policy; do not silently change historical manifests.
- An item found to include uncleared upstream rights must remain unavailable for paid delivery, even if the owner-output grant exists.
- Ownership, employment/contractor IP assignment, database-specific rights, jurisdiction, tax and customer terms need separate competent legal review when the stakes require it.
- No funds are authorized by this document. Founder-approved x402 capability pricing is unchanged.
