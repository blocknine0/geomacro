# 18. Signed Risk Object Contract

**Status: PRIVATE PILOT**

The current machine-readable primitive is the **Geomacro Risk Object (GRO)**. Signed GRO infrastructure is implemented for the Private Pilot Risk Gate architecture.

The current signing path:

1. validates the supported GRO schema
2. canonicalizes the signable payload
3. computes a SHA-256 payload hash
4. signs the canonical payload with an Ed25519 issuer private key
5. self-verifies before returning the signed object

A signed object can include subject, risk state, delta, attribution, evidence/confidence, freshness, methodology and integrity information.

```text
risk context
   ↓
versioned GRO payload
   ↓
SHA-256 payload hash
   ↓
Ed25519 issuer signature
   ↓
verification + policy evaluation
```

Country and directional corridor GROs are the current Private Pilot commercial wedge.

`execution_authorized` remains `false` at the Geomacro boundary. A signed Risk Object supplies verifiable decision context; it does not authorize a customer transaction.

Older draft GRO methodology labels are historical design references and must not be presented as the current public contract.