# 13. Confidence vs Reliability

Geomacro keeps model confidence separate from broader evidence quality.

## Confidence

For the current GRI, event confidence is an upstream model-produced input with provider/model/version provenance. It affects evidence weight but does not replace severity.

```text
event weight = (confidence / 100) × recency decay
```

The public GRI can also expose weighted confidence for the published evidence set.

## Broader evidence reliability

Evidence quality is not represented by confidence alone. Useful signals include:

- source count
- independent-story count
- source concentration controls
- story concentration controls
- evidence coverage
- freshness
- provenance completeness
- verification status

Geomacro should not publish a single universal "reliability score" unless a versioned product contract explicitly defines and validates one.

High model confidence therefore does not automatically mean broad independent evidence.