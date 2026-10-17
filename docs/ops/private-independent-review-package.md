# Private independent review preparation package

This prepares an unsigned review package from existing canonical private scores
and their separately bound original-source companion. It does not create an
independent review signature or a publication-approved input.

`config/private-review-preparation-source.v1.json` pins the exact two immutable
B2 objects and the protected source run/commit. The initial pins come from the
successful private archive receipt in source-pulse run `38801721081`, main
`441b58cdbb2e254ee6f3d9dae928f3ca3226d074`. It contains one Geopolitics
record and no Macro/FX or Critical Minerals records. Missing evidence remains
explicit; no category is filled with an invented event.

The existing source-stage and companion validators check exact identity,
original publication, classifier provenance and the companion's complete stage
binding. Both compressed source objects are SHA-verified on new B2 readback.
The preparation package contains those real private objects and a per-record
review checklist, retains original clocks, and labels 90-minute GRI and six-hour
Intelligence windows without advancing timestamps.

The protected `Private Independent Review Package Preparation` workflow creates
`geomacro-evidence/v1/private/independent-review-preparation/<sha256>.json.gz`.
It uses one existing quota-governed B2 client, normally four requests, with a
hard maximum of eight attempts including retries. Exact bytes and gzip restore
must pass before emitting the receipt. No raw source/title/URL is uploaded to
Actions artifacts; only the source-free receipt is retained there. No private
review/GRO signing key, Supabase or payment credentials are injected.

The reviewer must inspect original content and native clocks, independently
confirm the precise event and counterevidence, resolve source rights and
attribution, verify country/category certification and canonical scoring/story
bindings, and supply the separate trusted reviewer signature. GRI additionally
needs independently pinned and actually read-back historical B2 continuity.
Fresh missing category evidence is required before any three-domain handoff.

The draft schema is intentionally incompatible with the approved
`{rows,eventPackages}` publication input. Never pass its B2 key as
`reviewed_b2_key`; it is a private review-preparation location only. The existing
publication and `verify-three-domain-reviewed-handoff.mjs` verifiers remain the
acceptance gates after real external review is complete.
