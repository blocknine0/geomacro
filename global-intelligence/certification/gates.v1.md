# Global Intelligence v1 certification gates

A merge is blocked unless every gate passes.

1. **Country gate**: exactly 195 canonical countries, unique ISO2/ISO3.
2. **Coverage gate**: exactly 585 country/category cells.
3. **Source gate**: every required source has a registered adapter and health result.
4. **Category gate**: all three engines execute independently.
5. **Router gate**: single-category and mixed-category questions route deterministically.
6. **Verification gate**: independent-source corroboration is required for confirmation.
7. **Telegram gate**: verified Telegram can corroborate; early-signal Telegram cannot confirm alone.
8. **Freshness gate**: each source declares a freshness SLA and stale evidence is marked stale.
9. **Failure gate**: timeout, 4xx/5xx, malformed payload, rate-limit, auth failure and source disappearance are handled without silent success.
10. **Provenance gate**: every returned observation has source ID, URL, observation time and publication time when available.
11. **Secrets gate**: no credential or token appears in tracked files.
12. **Commercial-use gate**: reuse/attribution/licensing state is explicit before commercial signal use.
13. **Replay gate**: identical source payload does not create duplicate evidence.
14. **Conflict gate**: conflicting sources remain separate and are not silently averaged into a fact.
15. **Runtime gate**: live probes pass in the target deployment environment.
16. **Merge gate**: main remains untouched until gates 1-15 are green.
