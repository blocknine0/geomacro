# 43. Determinism

GRI v1.2 is deterministic **after event classification and current-contract story assignment**.

The numeric aggregation itself contains no LLM call and no discretionary manual adjustment.

With the same validated inputs, as-of time and methodology version, the aggregate should reproduce the same result within the documented numeric contract.

Deterministic artifacts include or can include:

- methodology manifest/hash
- input and evidence hashes
- effective evidence weights
- category contributions
- raw and display score
- change attribution
- calculation/proof hashes

Risk Objects also canonicalize their signable payload before hashing and Ed25519 signing.

Model-produced classification or interpretation must not silently rewrite an already published deterministic snapshot. Material methodology changes require a new version.