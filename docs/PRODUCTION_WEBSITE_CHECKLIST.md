# Production Website Release Checklist

A Geomacro website revision is not production-ready until all items below pass.

- Product CI passes.
- CodeQL passes.
- Hosting Alignment passes.
- Website Lock passes with the approved baseline.
- `/api/health` reports the B2-primary production alignment contract.
- `/api/public-production-health` returns HTTP 200 and confirms B2 runtime configuration, Intelligence readiness and verified Risk Indices readiness.
- `/`, `/intelligence`, `/global-risk`, `/ask-geomacro`, `/data-api`, `/institutional` and `/contact` return HTTP 200.
- Browser-facing code contains no direct `*.supabase.co` production data fetch for Intelligence, Risk Indices or Ask Geomacro.
- Production Supabase runtime mode remains `standby` unless an operator intentionally enters a bounded recovery mode.
- Verified B2 continuity data is never relabelled as current when it is outside the current-reading window.
- No synthetic zero-risk fallback or invented history is rendered when verified data is unavailable.
- Canonical `main` is mirrored into the Lovable-linked repository.
- The exact mirrored canonical SHA is explicitly published through Lovable.
- The live build marker matches the canonical SHA before release closure.

Technical-proof/testnet routes are not production data dependencies and must not be used as evidence that the customer-facing production serving path is healthy.
