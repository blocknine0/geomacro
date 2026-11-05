# GeoMacro – Cloudflare Workers Paid $5 central cost guard

Scope: existing GeoMacro Cloudflare account only. No account plan upgrade, billing-policy mutation, D1 migration, payment activation, source-rights change or deployment is authorized by this document or its code.

## Critical limitation — no guaranteed $5 invoice cap

Cloudflare Workers Paid is a **$5/month minimum**, not an unlimited $5 flat-rate service. Billing can exceed $5 for additional metered usage, Cloudflare account resources, taxes and other provider charges. The provider's **Budget Alerts are email-only**, not a cap.

Cloudflare's Spend Policies API permits a `usage_block` policy for **Workers** and separately **Durable Objects**. The minimum threshold is **1 US cent** of the respective product's usage-based spend. These policies are **product-scoped, asynchronous**, and cannot guarantee zero dollars/cents in extra charges. They do not cap **D1, Queues, KV, R2, Workflows, Hyperdrive, storage or other services**. An account-wide strict invoice maximum of exactly $5 **cannot be guaranteed** by these controls.

Official: https://developers.cloudflare.com/workers/platform/pricing/
https://developers.cloudflare.com/api/resources/billing/subresources/spend_policies/
https://developers.cloudflare.com/billing/manage/budget-alerts/
https://developers.cloudflare.com/queues/platform/pricing/

## Changes staged in GitHub

* `config/geomacro-cloudflare-five-usd-budget.json` declares conservative, **non-atomic targets** below monthly included usage. These are not provider-enforced caps.
* `scripts/lib/cloudflare-five-usd-spend-guard.mjs` reads the **existing account-scoped provider API** with a Billing Read token and requires one enabled `usage_block` spend policy for Workers and another for Durable Objects, both at the provider minimum **1 cent**, with a healthy current-state record. Unknown state, absent policy, wrong action, disabled, 403/429 and provider errors fail closed.
* `scripts/ops/plan-d1-bundled-work.mjs` refuses to lift the conservative Free-account source quota solely because a Paid subscription is active. It requires **both** active and recent provider proofs, then enforces the existing 18M rows read / 180k rows written *daily soft pacing maximum* for the paid critical **source-intake lane only**. Source/corridor rights and paid outputs remain unchanged.
* Offline CI proves the read-only fail-closed behavior. No API write is performed and no actual provider spend policy is created.

## Before the owner enables Workers Paid

1. Inspect the **correct Cloudflare account** containing GeoMacro D1 and Workers; verify no unrelated paid products share the account. Do not purchase any different Cloudflare zone plan.
2. In Cloudflare's supported Billing Spend Policies management/API, set an enabled **`usage_block`** policy for **Workers** with `threshold_cents: 1` and another **Durable Objects** policy with `threshold_cents: 1`. If unavailable on the user's account, **do not assume there is a block** and do not loosen the source quota. For assistance configuring API policies, use the official provider instructions; never paste secrets into GitHub issues or a chat.
3. Create a restricted **Billing Read** token, bind it to the **same account**, and store it securely as `CLOUDFLARE_BILLING_READ_TOKEN` in the protected GitHub Actions environment. Existing `CLOUDFLARE_ACCOUNT_ID` is reused.
4. Inspect Manage Account → Billing → Billable Usage and configure **budget alerts** for additional monitoring only. Alerts never guarantee cessation of charges.
5. Verify actual stored data, Queues operations, D1 GraphQL metrics, Workers request/CPU metrics, R2/KV usage and any other metered products **before activating the paid plan**. The safe account totals must have room for every existing producer (manual scripts, Workers, GitHub workflows, scheduled jobs, website traffic, external clients). No code assumes all independent producers are covered by the source-intake gate.
6. Run the read-only provider lock check in a protected runner; require actual positive readback and no excess monthly usage before approving any broader capacity use. Keep **customer USDC checkout and the master commercial launch gate locked** until separate acceptance.

## Queue cost warning: actual design review required

`p1-source-bundled-dispatch.mjs` currently bundles **D1 leases**, but its queue `sendBatch` still emits a **separate message for each source**, billed per message, not per `sendBatch` API call. At 1,077 sources every 20 minutes for 30 days:

* 1,077 × 72 × 30 = **2,326,320 source messages**.
* Without retries and assuming each is small enough to count as one operation per leg, write + read + delete ≈ **6,978,960 queue operations**.
* Cloudflare Queues Paid currently includes 1M operations/month; this pattern alone would exceed the included quota by **~5.98M operations**, or **~$2.39** at $0.40/M.

These are **scenario estimates, not observed production costs**. To avoid queue overage, message-level bundling / another quota-governed transport or verified counter-backed throttling must be implemented and tested **before** claiming $5-only 1,077-source always-on ingestion.

## Production acceptance required (not yet done)

- Verify Cloudflare account truly has Workers Paid and both active Spend Policies from the provider; policy existence and counter state are read-only.
- Check all Cloudflare billed product dimensions against monthly conservative targets in the manifest, including storage, D1 and Queues. Test that new work is **HELD**, not billed, once its own remaining headroom is unknown.
- Test the entire deployed ingress, sources, scheduled jobs and archives under a billing shadow census. A single D1 source planner is not an account-wide atomic cost governor.
- Test one real paid-period billing cycle against Cloudflare's actual invoice, accepting that $5 + tax/overages remains possible and independent provider bills are separate.
- Never promise strict provider-enforced $5 maximum unless the provider exposes and confirms a **true account-wide hard cap** that includes all enabled metered products.

Status: **STAGED CODE SAFEGUARD, NOT AN ACTIVE PROVIDER ACCOUNT LOCK.** Never report this PR as Cloudflare billing configured.
