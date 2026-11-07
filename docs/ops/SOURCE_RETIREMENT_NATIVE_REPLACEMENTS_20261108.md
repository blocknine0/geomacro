# Owner-requested source retirement and native replacements — 2026-11-08

127 source entries are permanently excluded from active ingestion by source ID and known exact feed URL. Historical source provenance and acquired evidence remain. The 48 additions come from runtime witness 42419005003; the 79 existing entries retain their previous retirement state. A later direct probe found some original feeds reachable: exclusion follows the owner instruction, not a claim of permanent upstream outage.

The old Hot-50 transport re-probe lane is disabled. The shared registered collector, 15-minute private registry and 20-minute direct registry enforce the policy. Replacement feed URLs are deduplicated against existing sources. The existing 512-request ceiling is retained.

## Verified alternative feeds

The local native-item check succeeded twice for these 12 endpoints using the production parser, bounded HTTPS GETs, and actual per-item publication times within 72h. Stored exact-article hashes record only a historical overlap sample. No title or article body is included. Current original-page verification, publishing rights and complete news duplication are not inferred.

| Removed entry | Replacement feed | Native 72h items at admission check | Identical original article URL samples |
|---|---|---:|---:|
| `private_mesh_infobae_americas` | https://www.infobae.com/arc/outboundfeeds/rss/category/america/mundo/ | 70 | 0 |
| `private_repo_b43996d173bd42476265` | https://es.euronews.com/rss | 50 | 50 |
| `private_repo_6089f0804e11b1f84ee1` | https://fr.euronews.com/rss | 50 | 50 |
| `private_repo_143016f4f089bc2fb3ad` | https://pt.euronews.com/rss | 50 | 50 |
| `private_repo_3a717bddc9306b392bdb` | https://de.euronews.com/rss | 50 | 50 |
| `private_gaplane_blr_13` | https://charter97.org/rss.php | 50 | 0 |
| `private_repo_4fc76c8a74bf3b048b56` | https://ru.euronews.com/rss | 50 | 50 |
| `private_local_candidate_id_antara` | https://en.antaranews.com/rss/news | 50 | 0 |
| `private_gaplane_lso_supplement` | https://lestimes.com/?feed=rss2 | 10 | 0 |
| `private_gaplane_cpv_supplement` | https://expressodasilhas.cv/rss | 10 | 0 |
| `private_repo8_can_boc_release` | https://www.bankofcanada.ca/content_type/press/feed/ | 3 | 0 |
| `private_repo8_us_bls_release` | https://www.bls.gov/feed/bls_latest.rss | 1 | 0 |

## Acceptance and unresolved work

- 192 relevant local regression tests passed, including alias exclusion, all-category source budgets, XML stylesheet handling, deduplication, and prevention of commercial/verification claims.
- Five Euronews feeds each matched 50 exact original article URLs in the old feed during the admission comparison. This is sample overlap, not a perpetual all-news equivalence guarantee.
- Seven further feeds are same-publisher native alternatives; full identical-story coverage is unproven.
- 115 removed entries still have no admitted same-publisher native replacement. Their absence remains a coverage gap. Existing broad alternate publishers are not mislabeled as exact duplicates.
- Replacement checks are read-only: zero D1 queries/writes and zero B2 requests. Successful feed checks do not prove D1 admission, B2 durability, public Website Intelligence delivery or paid Risk Gate readiness.
- GitHub production source collection must be observed after merge. The existing quota governor may hold canonical admission independently of source transport.

`Verify Native Source Replacements (No Funds)` runs the regression checks and records live counts on PR and main changes. Scheduled collectors continue checking admitted feeds on their existing schedules; no extra recurring scan or database job is added.

## Rejected or unresolved discovery candidates

Candidate discovery examined the registered publisher sites and their declared RSS/Atom alternatives. Stale, future-only, denied, unparseable, missing-native-clock and unrelated-publisher candidates were not admitted. No news-index timestamp is substituted for the original publication clock.
