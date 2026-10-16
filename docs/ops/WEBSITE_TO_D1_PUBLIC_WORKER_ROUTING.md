# Website-to-D1 public Worker routing

Observed October 16: the control-plane public Finds response is HTTP 200 with
valid schema flags, and protected authenticated D1 budget acceptance succeeds,
while the hosted website returns a generic budget failure and cannot proxy the
same public Finds feed. This establishes a website-to-Worker boundary failure;
it does not by itself establish a particular Cloudflare error code.

The generated website Wrangler configuration lacked the explicit
`global_fetch_strictly_public` compatibility flag. Set it through the existing
Nitro `cloudflare.wrangler.compatibility_flags` configuration so global fetch
uses public HTTPS routing, including for same-zone Worker destinations.
Cloudflare documents this mode for Worker-to-Worker requests:

- https://developers.cloudflare.com/workers/runtime-apis/fetch/
- https://developers.cloudflare.com/workers/configuration/compatibility-flags/#global-fetch-strictly-public
- https://developers.cloudflare.com/workers/observability/errors/

This corrects an identified deployment routing contract omission. Error 1042
has NOT been observed in accessible website logs, so do not claim it as the
confirmed production root cause. Verify the generated artifact contains the
flag, publish the website through its existing host, then test actual website
GET Finds plus a harmless invalid demo POST. The latter must reach route
validation (400), proving the strict distributed security gate passed. If it
still returns a fixed D1 failure, diagnose that exact failure rather than
rotating credentials, adding retries or weakening the gate.

Fixed control-plane origins, request authentication, receipt bindings,
timeouts, quota limits and fail-closed payment policies remain unchanged.
No direct D1 database credential or private signer is added to the website.
