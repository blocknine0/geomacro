# Structured product setup

All seven active capabilities / twelve price variants use the existing canonical
GeoMacro evidence, plan, pricing and structured response engines. No per-SKU
news-ingestion system, new database or scoring model is introduced.

## Inspect and check

- `/pricing`: choose a variant, edit its request and run **Check preparation · no charge**.
- `GET /api/v1/pricing?view=setup`: exact prices, required/conditional output fields,
  qualification prerequisites and executable request templates for all twelve variants.
- `POST /api/v1/intelligence/availability?view=setup`: send one exact template with
  the requested country or directional corridor. Returns preparation metadata only.
- `POST /api/v1/intelligence/query`: existing purchase endpoint. It independently
  rechecks the exact request, freezes its bytes, binds the approved price and
  verifies settlement before delivering the structured response.

The setup checker runs the same source qualification, price classification,
response assembly, privacy boundary, field completeness and signature-expiry
checks as the paid offer. It returns the validated field list and prepared
product hash, not customer data, source records, a payable quote or a receipt.
Its hash is diagnostic: a purchase reassembles the product and may have a new
request ID, timestamp and hash. A successful check does not reserve data.

## Products from shared evidence

| Product / variant | USDC | Output scope |
| --- | ---: | --- |
| Country digest | 0.02 | One country's one qualified structural dimension; at most 3 observations per module |
| Country profile | 0.03 | One country's at least two qualified dimensions; at most 12 observations per module |
| Corridor digest | 0.05 | One ordered country pair, one dimension; evidence from both endpoints |
| Corridor profile | 0.08 | One ordered country pair, at least two dimensions qualified at both endpoints |
| Intelligence / focused | 0.05 | One subject/topic, compact answer and qualified state |
| Intelligence / standard | 0.10 | One subject, up to three semantic topics and supporting analysis |
| Intelligence / complex | 0.15 | Fuller multi-source synthesis of the requested qualified modules |
| Signed object / existing | 0.05 | Existing independently verified, unexpired publication |
| Signed object / new | 0.10 | Actual verified publication generated after the recent requested cutoff |
| Risk Gate / preflight | 0.10 | Existing signed proof and advisory policy evaluation |
| Risk Gate / standard | 0.15 | Qualified policy evaluation plus signed object included |
| Risk Gate / complex | 0.25 | Deeper multi-source evaluation plus signed object included |

All required fields are published in the machine-readable setup. Conditional
history, changes or drivers are included only when independently qualified.
Structural reference periods remain their original dates; existing annual data
is not relabeled as current news. Shared evidence does not mean identical
payloads: each variant keeps its exact scope and data entitlement.

For the new signed object template, replace `product.issued_after` with current
UTC at request time. The cutoff must be within five minutes. The check never
creates or renews a signature; a separate canonical producer must have actually
published a qualifying object. Missing issuance remains unavailable.

## Readiness results

| Result | Meaning |
| --- | --- |
| `PRODUCT_PREPARED_PAYMENT_NOT_CHECKED` | Actual product passed preparation. Merchant/settlement readiness is not established. |
| `DATA_NOT_READY` | Required data, freshness, source eligibility or signed module is missing. No assembly or charge. |
| `PRODUCT_PREPARATION_BLOCKED` | Admission was positive but actual price/scope/content/signature validation failed. No quote or charge. |
| `DEPENDENCY_UNAVAILABLE` | A required service could not be read. No charge. |

Checks require an explicit product and one subject. They accept no payment or
authorization headers, reject bodies over 8 KiB and use the existing bounded
in-process limiter (3/client/minute, 24/global/minute per process). This is not
a distributed quota guarantee. Checks are on demand, not an automatic
12-product polling loop. Canonical evidence readers may use their existing
bounded caches and fallbacks; the setup adds no new ingestion or storage path.

## Validation and release boundary

Offline tests exercise all twelve templates through the actual canonical
assembler with synthetic admitted evidence, plus missing data, scope/price
mismatch, malformed requests and privacy failures. Such fixtures prove code
behavior, not current production evidence or merchant settlement.

This setup must be deployed before its new views appear on the live website.
Production readiness requires exact live checks and the existing independent
payment activation/settlement verification. PREDGE code, workflows,
credentials, deployment configuration and operating behavior are unchanged.
