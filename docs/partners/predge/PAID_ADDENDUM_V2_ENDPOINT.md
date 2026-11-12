# Predge paid Risk Gate Addendum v2 endpoint

The signed paid Addendum v2 uses the dedicated endpoint:

```text
POST /v2/partner/predge/paid-risk-gate
```

It requires the paid Addendum v2 policy and the dedicated `PREDGE_PAID_RISK_GATE_TOKEN` bearer (distinct from the legacy pilot Risk Gate and research credentials),
and both protected go-live/cross-check flags. Until all are active, it fails
closed with `PAID_TRAFFIC_NOT_ENABLED` before any D1 evidence reads. It never
falls back to free service.

The Addendum pricing is per delivered paid check: Basic/Focused is $0.15 to
the customer with $0.10 to Geomacro and $0.05 to Predge; Standard is $0.20
with $0.15 to Geomacro and $0.05 to Predge; Complex/Full is $0.30 with $0.25
to Geomacro and $0.05 to Predge. An undelivered, `INSUFFICIENT_EVIDENCE`, or
refunded check carries no fee. The tier and price are fixed before processing
and bound into the signed verdict.

Usage is reported by the 5th of the following month, one line per paid check
with its `verdict_id`; settlement is due by the 10th of the following month,
in USDC on Circle's Arc network. Another network requires both parties' email
agreement. Settlement is limited to customer revenue actually collected; there
are no prepayments, minimums, or fixed monthly fees. The Addendum continues
indefinitely and can be terminated on 30 days' written notice.

The existing non-commercial pilot/research routes retain their existing paths,
credentials, terms, and expiry. The legacy `/v1/partner/predge/risk-gate`
rejects Addendum v2 requests with `PAID_ADDENDUM_REQUIRES_VERSIONED_ENDPOINT`
and never writes the paid usage ledger. Existing `/v1/pilot/check` continuity
is unchanged. Paid Addendum v2 is accounted for only in
`predge_paid_risk_gate_usage_ledger`; Direct Store / Intelligence API pricing
remains a separate channel.
