# 14. Event Reliability

Current Geomacro event intelligence stores more than a headline. Risk-relevant events can carry severity, confidence, category, timestamps, source information and classification provenance.

For GRI v1.2, an observation is eligible only when it satisfies the current category, severity, confidence, time-window, classification-provenance and story-assignment contracts.

Reliability controls include:

- model/provider/version provenance for classification
- canonical observation time
- source identity
- source concentration capping
- independent story assignment
- story concentration capping
- freshness and publication rules

A large number of repeated articles is not treated as the same thing as a large number of independent developments.

Event severity remains a risk signal. Evidence weight is determined separately by confidence, recency and concentration controls.