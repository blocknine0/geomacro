# One genuine upstream source, separately derived across categories

The SAME official publisher data can be used by multiple Geomacro domains,
but only after each category independently qualifies the topic, original
publication date and relevant claims. It cannot turn one original into two
independent corroborating publishers, bypass source rights or mint a GRI.

The hourly free source collector now uses a one-run in-memory bounded
read cache for the Australian Resources Minister's *exact* first-party
index and individual same-host original article URLs. It reuses one
response across the Macro/FX and Critical Minerals extraction paths:
each output still has its own subject relevance, H1, native date and
15-minute delay. Max 16 original documents, 512KiB index / 256KiB article,
no redirects, no retry on provider denial, no raw provider bytes in public
feeds or D1 and no cross-run caching. The other Geopolitics sources and
stateless on-demand queries keep the established independent behavior.

Geomacro's existing 72h D1 derived journal and combined continuity GET
remain the single distribution source for user website, Ask and API,
subject to source-specific commercial rights for PAID endpoints. This
patch doesn't authorize signed GRO, numeric GRI/Indices or commercial
settlement, nor recover expired B2 current hot pointers.

## Three-domain explicitly topic-gated reuse

The same exact first-party index and article are now also inspected by the
Geopolitics source lane, reusing the same two network responses during one
hourly ingestion run. An unrelated resources export announcement is NOT a
geopolitical original: the existing geopolitical topic selection must match
real diplomatic, sanctions, embargo or security terms before the article's
native day and H1 are checked. An actual cross-domain title can produce up
to three separately scoped *unscored* Geomacro observations with distinct
category IDs; one original is never represented as three independent
publishers or approved commercial evidence.

The shared original can only reach the website, Ask and free API through
the existing canonical derived-news journal and bounded continuity view.
Private review/certification and paid x402 gates remain unchanged.
