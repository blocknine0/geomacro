# Supabase-free verified Intelligence publication

This change removes the legacy database dependency from **Intelligence
publication**, not from the still-unmigrated Global Risk producer. It does not
claim production recovery or promote private GRI artifacts.

The old Intelligence publisher reads Supabase/Postgres and GDELT observation
rows, while the public hot contract requires signed independent same-event
original evidence. It is quota-held and must stay held. The new publication
adapter consumes the exact already-reviewed customer rows and their private
signed event packages. It reuses the existing event qualifier, public D1
admission, B2 account governor and D1 publication/readback helper.

## Execution boundary

Run `node scripts/ops/publish-supabase-free-public-intelligence.mjs
--verified-publication` only in the existing protected production job, with no
Supabase credentials injected. Required configuration:

- `GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT`: local private JSON with exactly
  `rows` and `eventPackages`, produced by the trusted reviewed-evidence lane.
- `GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256`: independently pinned exact file hash.
- `GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM`: existing trusted Ed25519 review
  public key; never supplied by the input artifact.
- Existing B2 write credentials, Cloudflare account/token and D1 database ID.
- `B2_ACCOUNT_QUOTA_REQUIRED=1`, a valid `B2_ACCOUNT_QUOTA_WORKFLOW_ID`, and
  `B2_REQUEST_BUDGET=12` (bounded retries share the existing daily D1 governor).
- Existing commerce ledger root token for D1 authentication, and the genuine
  `GITHUB_RUN_ID`. The token is used only by the existing hot-snapshot helper;
  this command has no payment operation.

All three categories, customer-field allowlists, exact signed-row bindings,
independent evidence, rights receipts, review signatures and native freshness
must pass before any B2 traffic. An immutable content-addressed B2 recovery
copy is read back before latest is replaced. Exact live gzip bytes and proof
bytes are independently read back before D1 promotion. Source deadlines are
checked again after network activity. Private packages never enter public B2
or D1 payloads. Slow requests cannot refresh source timestamps.

There is deliberately no automatic invocation from the private scorer:
its artifacts explicitly state rights/corroboration pending and public
publication unauthorized. Without a genuinely qualified signed input,
publication must fail closed.

## Remaining production recovery

1. Produce current three-category reviewed signed event input through the
   existing canonical evidence lane; wire this adapter into its protected job.
2. Migrate the Global Risk producer's verified history and calculation input
   from frozen Postgres to independently verified B2/D1 state. Preserve real
   historical buckets and the existing v1.2 replay/hash contracts.
3. Derive Risk Indices from that exact current verified Global Risk result
   using the existing projection; read back each B2 object before D1 promotion.
4. Deploy protected main and independently compare the website build marker
   and Worker versions to the exact main SHA. Require real deep-health and
   no-funds production acceptance, rather than CI alone.

Until these remaining steps pass, HTTP 503 remains the correct production
response. Exporting the pure D1 admission function changes no Worker routes,
TTL, schema, authentication, Supabase mode or payment settings.
