# GeoMacro Risk Gate SDKs

Both clients send HTTPS requests to `POST /v1/risk-gate/tiered/evaluate` and reject a response without the advisory boundary and signed audit receipt fields.

`simulateHistorical` / `simulate_historical` operates locally on transaction rows and historical Risk Gate checks supplied by the customer. Transaction records are not uploaded. Results report decisions and advisory exposure ratios; they do not claim fraud avoided or guarantee a 30-day history exists.

## Prices and delivery

Prices remain the existing schedule: Basic / Focused $0.10, Standard $0.15, Complex / Full $0.25 per successful delivery. Each tier receives a cryptographically signed audit receipt. The upstream GRO itself is Ed25519 signed when included by the relevant tier. SDK use is included.

- Basic: observed activity signal, reason codes, flash override and receipt.
- Standard: corroborated score, three category sheets, source references, custom policy profile and receipt.
- Complex: institutional signed GRO, verified 7-day corridor history and private archive reference, plus receipt.

Proactive callback delivery and month-long historical data require separate production acceptance; the current webhook foundation writes signed outbox events but does not deliver to customer callback URLs.