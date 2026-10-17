# Workers runtime transport recovery

Actual workerd 1.20261016.1 rejects `fetch` with `redirect: "error"`
before an outbound request. Node/Bun mocks accepted that option, so earlier
security acceptance and routing-flag checks did not detect this runtime defect.
The public security failure was `CENTRAL_SECURITY_D1_TRANSPORT_FAILED`; direct
control-plane reads and authenticated D1 acceptance separately worked.

The shared server transport now uses `manual`, rejects every 3xx, cancels its
body, and never follows Location, forwards credentials to it, retries, or
replays an ambiguous budget reservation. Original endpoint pins, timeouts,
receipt binding, signatures, source qualification and quota limits remain.
Security, Finds, journal, public history, country GRO hot reads, private B2
quota and relevant original-source readers use it. The pre-existing opt-in
same-government RSS redirect function retains its own bounded host/path checks.

Hosting Alignment runs a pinned actual workerd integration with in-memory
outbound services and the real security/Finds clients. It proves the old mode
fails, the corrected clients receive valid receipts, all nine 3xx statuses
are rejected, and no request reaches the redirect destination. This uses only
fixture keys, no production requests, D1/B2 operations or money.

After merge/mirror, the Lovable website must publish the containing revision.
Verify on the actual website: canonical and all three category Finds GETs
return a current valid signed feed; harmless empty demo preflight POST reaches
its input-validation response rather than central-security transport failure.
A successful local integration or mirror alone is not deployment acceptance.

Current paid deep health is a separate prerequisite. This transport fix does
not produce fresh qualifying events, article rights, dual-authority proofs,
B2 full readback, activated signed hot products or customer readback. Preserve
original clocks, fail closed on expired/missing products, and keep the full
production recovery tracker open until those are independently verified.
