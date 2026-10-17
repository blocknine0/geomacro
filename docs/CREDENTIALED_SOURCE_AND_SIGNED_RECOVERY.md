# Credentialed sources and signed publication recovery

The owner-provided list contains secret **names**, not proof of deployed access, free production entitlement, article rights, an independently reviewed event, or a current signed product. Values must remain inside the existing protected production jobs.

| Credential group | Existing operational path | What it proves |
| --- | --- | --- |
| BLS, BEA, Alpha Vantage, EIA, NOAA NCEI, WTO, OpenSanctions | `credentialed-source-runtime.yml`, four bounded observations/day | Actual account response and shape, independently per provider; reference/market/hazard data is not automatically news |
| UCDP_API_TOKEN | Same credentialed runtime, pinned official GED 26.1, one record | Authenticated dataset access without the legacy Supabase sync; version/event dates are historical context |
| RELIEFWEB_APPROVED_APPNAME | Existing approved original discovery and official observation | Approved provider identity; article dates and scope still require verification |
| GDELT (no key) | Canonical on-demand discovery | Discovery only, with existing 403/429 cooldown and request budget; `seendate` is not original publication |
| NEWSAPI_KEY | Production admission pending entitlement | Official free Developer plan is development-only and delayed 24 hours; a key alone cannot authorize free published production |
| GUARDIAN_API_KEY | Existing rights-gated connector | Production use requires the account's applicable licence; no blind free-plan promotion |
| TAVILY_API_KEY, INVINO_API_KEY | Existing evidence/search/review integration | Search credits or paid review access do not establish an original release or authorize spending |
| GROQ, GEMINI, MISTRAL, CEREBRAS | Existing private classifier | AI computation is not independent signed review or a source licence |
| B2 writer/archive-reader, Cloudflare, GRO signing keys | Existing governed publishers and verified hot serving | Configuration is separate from genuine fresh reviewed input and successful archive/D1 readback |
| ARC/RPC/owner/jury/treasury/GOAT/x402/contract keys | Existing chain, signer or commerce roles | Never treated as news-source API keys or permission for funds |
| Supabase and Telegram Supabase keys | Frozen legacy paths | Not injected into the credentialed runtime or recovery preflight |
| Lovable mirror/source-intake/Telegram bot keys | Existing deployment/catalogue/discovery paths | Deployment/catalogue access is not current source evidence or permission to message users |

Credentialed requests reject arbitrary redirects and enforce a 256 KiB response limit from both headers and streamed bytes. WTO alone permits one exact HTTPS same-origin `/timeseries/v1/data` to `/timeseries/v1/data/` canonicalization, preserving the registered query and key scope. A shared deadline and 1.1-second spacing retain the published one-call-per-second bound. Any changed host/path/query, downgrade, denial, loop or second redirect stays rejected. This transport allowance is not proof the live WTO endpoint will return a valid response. No credential-bearing URL, raw upstream record or provider error body enters the health receipt. UCDP uses the official documented stable version; it does not guess an unpublished previous-month candidate release. No new Supabase writer or raw-content store is enabled.

## Why signed hot serving remains separate

The 2026-10-16 protected read-only D1 audit found all three hot rows with `SOURCE_TOO_OLD` and `EXPIRED`; schema and proof metadata were not reported malformed. Re-publishing old bytes with a new timestamp cannot repair that state. The approved existing Intelligence/GRI publishers require independently pinned, signed reviewed input; GRI also requires signed country-category certification and its independent historical anchor. Risk Indices consumes a genuinely current verified GRI parent.

The credentialed runtime now runs a separate configuration-preflight job independently of source health. The existing public-serving diagnostic remains a read-only public/D1 metadata audit. It reuses `assertIndependentReviewerKeyAuthority` to verify the pinned reviewer is distinct from the GRO signer. Private signer/B2/control-plane secrets enter this preflight only as presence booleans; reviewer/public-signing material is never printed. A passing configuration preflight deliberately does not claim that reviewed packages exist, signing executes, B2 restores, D1 serves current products, or HTTP 503 is repaired. It cannot change freshness windows, approve its own evidence, invoke a publisher, or enable funds.

References: official [NewsAPI pricing](https://newsapi.org/pricing), [Guardian access](https://open-platform.theguardian.com/access/), and [UCDP API documentation](https://ucdp.uu.se/apidocs/).
