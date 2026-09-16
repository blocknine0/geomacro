# ECB Press RSS Source Review

Status: REVIEW REQUIRED / ADAPTER DRY RUN IMPLEMENTED

Review date: 2026-09-16

Source ID candidate: `ecb_press_rss`

## Exact surfaces

- ECB RSS directory: `https://www.ecb.europa.eu/home/html/rss.en.html`
- Exact press RSS feed: `https://www.ecb.europa.eu/rss/press.html`
- ECB disclaimer and copyright: `https://www.ecb.europa.eu/services/using-our-site/disclaimer/html/index.en.html`

## Current official-source evidence

The ECB RSS directory states that its news feeds distribute press releases, speeches, publications, exchange-rate information and other updates as they are issued. The exact press feed is exposed as an ECB RSS endpoint.

The ECB disclaimer/copyright page states that information obtained directly from the ECB website may generally be used free of charge subject to conditions, including accurate reproduction, citation of the ECB as source, additional disclosure when the information is incorporated in documents that are sold, and disclosure when information is modified. Author-named documents have a separate permission boundary.

The ECB also publishes a separate free-reuse policy for publicly available ESCB statistics, with source quotation and third-party-data restrictions. That statistics policy is useful context but is not used here to broaden the press-RSS approval boundary.

## Geomacro adapter boundary

The dry-run adapter deliberately stores/returns only:

- RSS item title;
- official ECB URL;
- publication timestamp;
- stable hash-based source record ID;
- Geomacro event-family candidate;
- source scope/timezone metadata.

It does **not** copy or store article body text, images, PDFs, speeches, named-author papers or third-party media.

The adapter validates that item links remain on the official ECB HTTPS host and fails closed on malformed RSS.

## Preliminary engineering conclusion

The current official copyright language provides meaningful evidence that direct ECB website information can be reused commercially under stated conditions. However, Geomacro is keeping the runtime status at `REVIEW_REQUIRED` until all of the following are closed in code and evidence:

1. the exact press-RSS feed is repeatedly validated operationally;
2. the customer-facing attribution/disclosure text required by ECB terms is implemented;
3. the derived-vs-reproduced boundary is regression-tested;
4. regional ECB events have an explicit propagation model before they can become country-specific Early Warning alerts;
5. a versioned source registration/promotion migration is reviewed;
6. commercial-signal activation remains separately approved after ingestion evidence exists.

Therefore this review does **not** promote `ecb_press_rss` to `COMMERCIAL_OK` in the runtime registry yet.

## Current activation state

- Adapter: dry-run implemented
- Database write: disabled
- Scheduled polling: disabled
- Commercial signal activation: disabled
- Public alert activation: disabled
- Raw body storage: disabled
- Mainnet/payment impact: none

This document is an engineering source-rights control record, not legal advice.
