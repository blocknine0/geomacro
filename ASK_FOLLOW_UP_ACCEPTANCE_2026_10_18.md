# Existing Ask production acceptance: bounded follow-up

The canonical unscored three-category verifier now also reads one bounded
follow-up with the prior-question header. It requires the exact India risk
rewrite and private output. The context result explicitly claims no evidence
acceptance. All three existing current-original evidence checks remain
mandatory; truthful insufficient evidence can pass context routing but cannot
pass overall production acceptance.

The deployed SHA marker is still checked before any Ask request. There are
at most four Ask GETs, no redirects, POSTs, payment signatures, settlement or
raw answer logs. The previous duplicate standalone workflow in PR #2151 is
not retained. Existing scored and SSE production workflows remain separate
content acceptance gates and are unchanged.

Validation: seven offline verifier tests cover stale-build early exit, exact
context, wrong country/mode, private-output leaks, missing evidence, HTTP 503,
transport failure, GET-only requests and sanitized receipts. Existing hybrid
agent tests verify actual server-side rewriting. These tests are not proof
that the live site has published current main or has current signed inputs.
