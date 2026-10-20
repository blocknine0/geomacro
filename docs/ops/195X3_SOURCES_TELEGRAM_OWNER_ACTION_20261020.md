# Geomacro 195 x 3 official news and Telegram action plan (20 Oct 2026)

Scope: 193 UN states + Holy See + Palestine; 3 categories. Source-native original release clocks, derived customer JSON only, no paid subscriptions, no 24/7 owner laptop.

## Current publication

- One shared, bounded 72-hour Cloudflare D1 journal. 600 derived rows total and a mandatory 15-minute public display delay; this is NOT an unlimited all-news archive.
- Existing scheduled 5-minute original-news fastlane checks one issuer in each category: UN News / Federal Reserve / Natural Resources Canada. GitHub cron is best-effort and does not guarantee every article within 20 minutes, even from those issuers.
- Country search supports 195 ISO3 countries; observed record or missing record does NOT certify current signed 585-country-category coverage.
- A news event can be shown as an UNSCORED observed official release. An eligible paid product needs current matched country/topic evidence, licensed derived use, the correct existing structured contract, and live payment proof.

## Newly integrated official original release feeds

- New Zealand Government Beehive releases RSS, https://www.beehive.govt.nz/rss.xml; 3 category-specific topical gates, original issuer media /release or /speech article URLs only, item native publication with timezone. Three topic lanes are still ONE publisher family. NZ copyright requires source acknowledgement and does not extend to third-party photographs, marks or material. Explicit credit New Zealand Government (Beehive) is mandatory in any public display; source-neutral paid context must exclude it unless separately approved.
- WTO first-party trade RSS, https://www.wto.org/library/rss/latest_news_e.xml; only real original /english/news_e/newsYY_e/ or /presYY_e/ paths; exact issuer-HTTP-to-HTTPS canonicalization only; original native publication timestamp mandatory. The WTO directs reusers to credit WTO news. No WTO logo, no article/body copy, no source-neutral licensing assumption.
- A valid RSS transport result is not a current original story, event correlation, publication permit or score. Outage/403/429/undated entries remain unavailable. Both sources join the EXISTING bounded hourly Intelligence/official-source pipeline. This does NOT activate them in the existing 5-minute fastlane and does not imply a <=20m SLA.

## Telegram registry: actual private repo audit

Repo: blocknine0/geomacro-telegram-signals, main registry config/source_registry.json, inspected 20 October 2026.

Domain | discovered | publisher-authorized | ACTIVE
---|---:|---:|---:
GEOPOLITICS | 131 | 0 | 0
MACRO | 15 | 0 | 0
CRITICAL_MINERALS | 6 | 0 | 0
Total | 152 | 0 | 0

Only 9 distinct ISO3 countries appear in this candidate registry, NOT 9 verified live Telegram news countries. Examples existing: Kazakhstan minerals @mineralsgovkz and @eondiris; Ukraine natural resources @mindovkillia; India geopolitics @inbministry; Azerbaijan economic ministry @economy_az and @economy_azen. Names, evidence and actual authorization must be confirmed against real issuer. No bulk-public-channel harvesting.

The Telegram repo already contains a daily governed official-channel discovery workflow that may propose DRAFT review PRs; it cannot grant source access. Optional licensed MTProto reader is MANUAL per authorized channel, max 20 posts in 6 hours. Real-time Bot API webhook requires an approved publisher-owned channel where the Geomacro bot has been added as administrator and exact channel_post permission; hash-only B2/D1 receipt required.

## Owner does, one time or per approved source

1. Keep Github Actions scheduled runs and Cloudflare control-plane/D1 production healthy. Do not run a laptop server. Observe five-minute fastlane source-native dated publication counts and actual D1 public readback.
2. For each Telegram channel to activate, get evidence of official issuer, precise country/topic, written publisher/admin authorization (Bot API channel post or scoped MTProto read research) and permission validity. Public channel visibility alone does not establish commercial reuse permission.
3. For approved Bot API webhook, privately supply bot token and webhook secret to protected Cloudflare runtime, have issuer admin add bot, verify real webhook message checkpoint, D1/B2 hash readback, and independent official-origin confirmation. Do not send these secrets to chat.
4. For scoped MTProto reader only, owner controls TELEGRAM_API_ID, TELEGRAM_API_HASH, TELEGRAM_SESSION and TELEGRAM_HUMAN_APPROVAL; retain collection OFF until actual grant and safe test. The current adapter is NOT autonomous 24/7.
5. Inspect real news producer success/latency. Measure publisher source-native published_at to D1 accepted time to public visible time for sample events over several days, including worst cases. A 15-minute embargo leaves five minutes for discovery/classification if a 20-minute target is desired. Missed Github cron or delayed upstream articles make a universal guarantee impossible.
6. For 195-country genuinely complete production, continue registering independently verifiable local ministries, central banks, statistical agencies, customs and mining/geology sources by country/topic and language, only after actual original URL/time checks; prioritize missing 585 cells. GDELT (15-minute global index) and ReliefWeb (approved appname) assist discovery, NOT the first-party original or automatic commercialization.
7. Keep existing 8 capabilities and 14 USDC prices unchanged. Source-neutral research drafts with missing commercial permission NEVER become paid offers. Separate reviewer approvals required for signed GRI/GRO and Risk Gate products.

Official sources and licences:
- https://www.beehive.govt.nz/feeds
- https://www.beehive.govt.nz/copyright
- https://www.wto.org/english/res_e/webcas_e/rss_e.htm
- https://gdeltproject.org/data.html
- https://apidoc.reliefweb.int/
