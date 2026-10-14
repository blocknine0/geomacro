# Geomacro Capability x402 Provider Binding — NO FUNDS

Contract version: `geomacro.capability-usdc.v1`. This module is the
payment-rail adapter for the founder-locked catalog, not another price model.

The Coinbase and Circle amount-bearing requirements are derived from an
*already verified, prepared-answer-hash-bound* canonical capability quote;
neither an environment flat price nor a customer-supplied amount can set it.
Both underpayment and overpayment fail. The existing Durable Object claim
identifies the same exact quote, immutable prepared customer response hash,
request fingerprint, network, token, recipient, rail and amount.

**Critical integration boundary:** This PR introduces tested primitives. The
existing live POST handlers still require a genuine protected prequote freeze
and exact accepted quote readback before calling them. No payment may be
activated based on these unit tests alone. WDI private prequote is not an
authorization for other Geomacro capabilities. Existing real-funds ACKs
remain unset. Do not deploy an unbound provider path as commercially ready.

Risk Gate's included signed object is one bundle entitlement, never a
second settlement. Source rights, signing verification, source recency,
durable customer-byte preparation and actual deployed worker/version checks
are separate hard gates. Historical flat testnet fixtures remain intact.
