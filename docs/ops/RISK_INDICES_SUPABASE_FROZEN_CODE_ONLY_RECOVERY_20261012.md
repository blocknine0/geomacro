# Risk Indices: Supabase-frozen, B2-artifact-unavailable code deployment

Geomacro's website and product edge must not depend on Supabase. An
independent previously B2-readback-verified Risk Indices continuity artifact
is required to publish an **actual risk reading**. A missing historical
GitHub source-run artifact cannot be replaced by a fabricated snapshot,
but it should not prevent shipping quota-governed code to a currently
unavailable Worker.

The existing direct-B2-verified code path runs unchanged when the source
artifact is available. For a `main` code push **only**, when it is absent:

1. Check the existing public Risk Indices Worker once. If it already returns
   HTTP 200, abort redeployment rather than overwriting its possibly last
   available independently verified static continuity with an empty module.
2. When it is not serving HTTP 200, deploy with explicit
   `export default null;` continuity. Worker can still recover from
   independently verified D1 hot, POP cache, or account-wide D1-quota-reserved
   B2 proof. Zero fabricated scores and no unmetered B2 traffic.
3. Do not allow this no-artifact shortcut for a manually triggered or
   source-publisher `workflow_run` deploy. Those require exact source-run
   verified B2 readback and bounded identity checks.
4. After deployment, run the existing **strict live HTTP 200 proof acceptance**
   (evidence/authority/history hash verified); do not claim the service
   restored merely because Wrangler completed deployment. A genuine
   exhausted/unavailable origin can still legitimately fail HTTP 503.

This does not increase GitHub schedule frequency or D1/B2 budget and
does not add a free-tier account. Finite quotas mean there is no guaranteed
100% availability when every independently verified replica is unavailable.

Source: [tracker #1827](https://github.com/blocknine0/geomacro/issues/1827).
