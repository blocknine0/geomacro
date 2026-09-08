# 42. Data Provenance

Geomacro treats provenance as part of the product contract rather than optional metadata.

Depending on the source and product policy, an observation can retain enough information to establish:

- source identity or permitted reference
- source record identity
- observation / publication timestamps
- when Geomacro received or structured the information
- content or normalized hashes
- classification provider/model/version provenance
- story-correlation provenance for GRI
- commercial-eligibility state
- methodology and proof versions that consumed the observation

Commercial source rights are a separate gate from operational ingestion. A source being technically accessible does not make it commercially reusable.

Customer-facing proof should expose enough evidence and integrity context to inspect the output without leaking credentials, restricted raw material or private provider configuration.