# 17. Story Correlation and Evidence Caps

The current GRI v1.2 methodology does **not** use the older draft "orthogonal event residual" framework as its public calculation path. This page documents the current contract that replaced that stale framing.

Every canonical GRI observation must have a current-contract story assignment with versioned clustering provenance.

The assignment records enough information to identify the story cluster and the versioned decision that produced it. Missing, duplicated or incompatible current-contract assignments block canonical calculation rather than silently falling back.

The calculation then applies:

1. raw confidence-and-recency evidence weight
2. source concentration cap
3. immutable story grouping
4. story concentration cap
5. domain aggregation

Current story-correlation contract values are versioned separately from the GRI formula and are included in public proof verification.

This design makes independent underlying developments the important unit of repeated-evidence control, rather than raw article count.