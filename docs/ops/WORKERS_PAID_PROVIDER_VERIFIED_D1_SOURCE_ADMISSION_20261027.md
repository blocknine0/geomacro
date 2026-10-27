# D1 Workers Paid capacity admission — operator activation (27 October 2026)

## Immutable boundaries
- **No subscription, payment or billed service is ever activated by repository code.** A Cloudflare account administrator alone may choose the optional Workers Paid plan. PREDGE code, workflows, rights, signing, payment, historical Supabase and paid customer delivery are untouched.
- Existing Cloudflare D1 is the only canonical ingestion database. GitHub Actions AES-GCM artifacts are protected temporary unverified backups, **not canonical** or verified article events.
- No country/category has guaranteed new news every 15 minutes. Source-clock event validity and original page verification remain separate.

## Why a billing verification token is needed
The existing account-wide row counter includes a **Free plan** hard cap of 5 million daily reads, and the main protected scheduler intentionally fails closed above that limit. Simply paying Cloudflare, without proving the plan to the scheduler, would leave old conservative Free gating in place.

The Cloudflare Accounts Subscriptions **GET** API is a read-only entitlement source. It requires an **API token restricted to Billing Read** on the **same Cloudflare account**. Its `result[].rate_plan.id` must be `workers_paid`, `rate_plan.scope` account, and state `Paid`. A flag, variable, human claim, missing token, 403/429, wrong account, expired plan or ambiguous response cannot unlock the quota gate.

## Explicit operator actions (no code performs these)
1. Cloudflare Dashboard → Workers & Pages → select **Workers Paid** for the existing account, if approved. Minimum $5 USD/month plus any additional usage-based charges; confirm Cloudflare's current rates and a spending alert/budget.
2. Create one Cloudflare API token with **Billing Read only**, restricted to the same account. Do not reuse the control-plane Worker deploy token if it lacks that permission.
3. In GitHub repository `blocknine0/geomacro`, set production Actions secret `CLOUDFLARE_BILLING_READ_TOKEN`. The preexisting `CLOUDFLARE_ACCOUNT_ID` remains the account binding. Never paste any token in issues or logs.
4. Run the protected `Global OSINT to Website Intelligence (15-Minute Discovery)` and `Private OSINT Encrypted Holding When D1 Quota Held` workflows from **main**. Examine their counts-only admission receipt. Only genuine provider proof permits `critical=true`.
5. Wait for successful **Deploy D1 Control Plane** main run and post-deploy migrated Worker proof. Then require multiple real private D1 news writes, private three-domain authenticated readbacks, an encrypted backlog replay with **zero capacity exclusions**, and a true 195×3 country/category observation and no-event/unknown coverage report.

## Conservative account-wide paid soft budget
Paid proof makes only **critical ingestion** eligible. Research/maintenance, B2 network, GRO signers and chargeable commercial paths are not admitted by this proof. Additional soft daily budgets are paced from **4 million to 18 million D1 rows read** and **40,000 to 180,000 rows written** over UTC day; these are NOT Cloudflare's paid account hard caps, nor a promise of zero spending. Provider D1 analytics counters are delayed, so throttling is observational and cannot alone guarantee no overage.

No Paid proof → exact previous Free-plan admissions remain. A paid proof after the account exceeds the soft budget → **HELD** with true reason. Never bypass Cloudflare's error 7500, never fabricate news, never close P0 master #1827 based on green CI.
