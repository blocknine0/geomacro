# Native Circle Facilitator verification

The native Circle Facilitator Service uses `/v1/facilitator/x402/supported`
and `/verify`. It is separate from the existing GatewayWalletBatched client.
The verification adapter supports the existing canonical native USDC identities
for Base, Arc and Polygon. It adds no new price, public paid route or engine.

`scripts/lib/circle-facilitator-verification.mjs` checks the immutable prepared
quote against the same validator used by the commerce Durable Object, checks
the exact customer-byte SHA, locked price, chain, native USDC, recipient, buyer
authorization time and quote-bound payment identifier. It reads current Circle
support, requires an EOA seller signer controlling the recipient, creates an
exact-body EIP-712 seller proof, and calls only `/verify` with Circle credentials.
Seller signing can be injected by a protected signing service. Never place keys
in requests, GitHub comments, this repository or a customer response.

The native adapter has **no settlement method**. A valid verification is neither
a transfer nor fulfillment authorization. There is deliberately no public route
to submit arbitrary authorizations to this helper. Integrate only after the
canonical engine has independently qualified rights/freshness and performed
actual private DO freeze/readback of the same bytes. Local quote checks alone
do not prove either condition. Existing signed-product and launch gates remain.

Run offline regression tests with Node 24 after installing the frozen app dependencies:

```sh
node --test scripts/lib/circle-facilitator-verification.test.mjs
```

Run the live nonpayable entry audit on the exact intended deployment SHA:

```sh
GEOMACRO_EXPECTED_SHA=<full-40-character-SHA> node scripts/ops/check-commercial-entry-no-funds.mjs
```

It makes a single structural availability request (default CHN external-FX),
reads public Circle support, exact website SHA and deep health, and saves only
sanitized diagnostics. Optional `GEOMACRO_DIGEST_COUNTRY` and
`GEOMACRO_DIGEST_TOPIC` select one other approved request. It cannot certify
merchant credentials, immutable delivery, source permission, settlement or
revenue and returns nonzero on observed availability/deployment/health failures.

Remaining real inputs: a source-qualified eligible digest and immutable
customer-byte vault readback; merchant receiving address and protected seller
signer; active Circle credentials with actual remote verification; separate
audited settlement/status integration with the existing idempotent ledger;
current signed hot publication and exact production deployment. Only after
those pass can a separately authorized 0.02-USDC purchase prove settlement,
accounting and exact delivery. Do not set real-money ACKs during these checks.

Official protocol references (checked 18 October 2026 IST):
- https://developers.circle.com/facilitator-service
- https://developers.circle.com/facilitator-service/sign-seller-proof
- https://developers.circle.com/api-reference/facilitator-service/get-supported
