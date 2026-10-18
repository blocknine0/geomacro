# Capability x402: exact prequote and delivered response bytes

The Coinbase and Circle handlers use the existing governed response assembler,
canonical price classifier, prepared-quote contract and authenticated Durable
Object vault. No second pricing, signing, scoring or payment engine is added.
The first supported structural country digest remains exactly 0.02 USDC and
does not pretend to contain a signed current risk object.

## Request and delivery

1. Configuration, deliverability, rights and canonical plan price must qualify.
   Coinbase requires credentials before offering a challenge. Public unpaid
   preparation has a shared 12/minute global and 2/minute client limit in the
   existing limiter, in addition to the existing route and Worker capacity gates.
2. Assemble once, sanitize using the existing private-output boundary, validate
   the product contract, and freeze the full canonical UTF-8 HTTP body. Availability
   and versioned output-license metadata are included before freezing. Reject
   non-JSON values, nonfinite numbers, holes, cycles, excessive nesting and bodies
   above the existing 96 KiB vault bound.
3. Build the canonical prepared quote from that complete body SHA-256. Store
   through authenticated `capability-prequote-freeze`, then perform two separate
   authenticated readback requests. Only a matching current quote, complete
   stored byte string and storage admission receipt can produce HTTP 402.
4. The signed payment must match quote, request fingerprint, provider, native
   network/asset, recipient and exact capability amount. Read the stored body;
   never reassemble an answer after accepting a payment authorization. Bind the
   atomic delivery claim to quote ID, request, frozen body hash and payment terms.
5. Recheck governed eligibility/price and prepare the same body in the existing
   delivery ledger. Its acknowledged hash must equal both the frozen wire hash
   and quoted prepared-answer hash. Recheck quote expiry and each signed object's
   own expiry immediately before the existing provider settlement call.
6. After delivery completion, send precisely the frozen body string. Actual
   settlement information is exclusively in `PAYMENT-RESPONSE`; quote identity
   and full-body hash are in `X-Geomacro-Quote-ID` and
   `X-Geomacro-Delivery-SHA256`. CORS exposes these headers. No payer, transaction,
   replay flag or new availability projection is appended to the body afterward.
7. An authenticated delivered-only lookup can replay the exact body after quote
   or source expiry, without reading current evidence or settling again. It must
   match the original quote hash and stored delivery hash, not merely any valid
   JSON. Ambiguous settlement and conflicting claims remain held for reconciliation.

Existing legacy proofs without a prepared capability quote cannot initiate this
new paid flow; they fail closed. This change does not silently reprice or migrate
old ledger records or grant a new license to old deliveries.

## Supported rails and acceptance limits

The prepared quote/storage protocol recognizes native Base, Arc and Polygon
identities for the Circle namespace. The existing production Circle facilitator
adapter remains Base-only; this patch does not enable Arc or Polygon settlement.
Coinbase CDP remains Base-only. Existing explicit commercial-launch and real-USDC
ACK gates, provider verification and reconciliation controls are retained.

Offline tests execute both actual HTTP handlers and the real Worker storage
implementation with explicitly synthetic source/provider fixtures and mocked
network transport. They exercise initial byte freeze/two readbacks, exact 0.02
terms, delivery, expired replay, mutation, corrupt storage, missing/finally revoked
evidence, final-boundary expiry and ambiguous settlement. The separate payment
contract tests cover all 14 locked price variants. These are code proofs, not
independent merchant acceptance, genuine source rights or real settlement proofs.

The repository's pre-existing whole-project TypeScript diagnostics remain a
separate baseline; changed runtime modules are checked for new diagnostics.
Product CI, production build, CodeQL and existing safety workflows are required
on the exact reviewed PR head. Live website publication, genuine eligible customer
bytes, independent provider/merchant acceptance and explicit real-money
permission still have to pass before commercial launch.
