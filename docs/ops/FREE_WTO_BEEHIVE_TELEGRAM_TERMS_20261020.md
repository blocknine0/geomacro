# Free 195-country source expansion: WTO, Beehive and Telegram — 20 October 2026

## Current exact facts
- Geomacro runs scheduled GitHub Actions + Cloudflare Worker/D1 without a 24/7 laptop. No paid news API or infrastructure subscription was added.
- New Zealand Government Beehive offers **official RSS** at https://www.beehive.govt.nz/rss.xml and https://www.beehive.govt.nz/releases/feed, plus portfolio feeds listed at https://www.beehive.govt.nz/feeds .
- WTO offers **official news RSS** at https://www.wto.org/library/rss/latest_news_e.xml and explicitly requires acknowledgement **"WTO news"** when disseminating. This is NOT WTO statistical Timeseries: https://apiportal.wto.org offers a free signup/API key for statistics (published periods are NOT a current news event).
- Geomacro's original-source reader already pins New Zealand Beehive to **three** category-specific classifications of one official RSS origin and WTO trade RSS to Macro. These do not form separate independent confirmations. The live Oct 20 Github runner observed WTO RSS reachable but no previously classifiable WTO items. It observed NZ Beehive with XML MIME failure. MIME/HTTP refusal is not proof of a publisher-original news event.

## Work in this release
1. Add a narrow WTO-native trading policy vocabulary for safeguard investigations, trade-remedy / countervailing duties, tariff quota measures and dispute-settlement notice types. It still checks actual issuer news article path, true native pubDate and mandatory WTO credit. It does not make tariff direction, impact or FX predictions.
2. Add WTO **as a second, separately issued Macro original** to the existing five-minute source fastlane. This now polls FOUR pinned issuer feeds total (UN News, Federal Reserve, WTO, Natural Resources Canada) across the same three categories. Each category remains capped at 20 candidate derived records/tick, and all domains reuse exactly the prior 72h D1 journal, already existing 15-minute display embargo, exact readback and no USDC.
3. Allow a *failed WTO* lane to leave Fed Macro intake healthy, and a failed Fed lane to leave WTO healthy. Neither failed original produces fake data.
4. Add read-only actual external RSS diagnostics for the official Beehive all-site, Beehive releases-only and WTO official URL on GitHub runners. Log ONLY fixed identifiers, MIME class, status, XML structural boolean and count. No raw titles/links/feed bytes, sessions, D1/B2 access, model calls or payments.
5. Keep Beehive feeds on existing hourly source portfolio until a genuine runner-verified correct RSS XML response is observed. **Do not** treat text/html 200 as RSS, chase WAF redirects or promise that source is operating in production.

## How to handle Telegram safely
Telegram Bot API and normal-account MTProto are provided free, but free access is NOT permission to commercialize or use any channel messages for a machine-learning/AI-assisted product. Telegram's 2026 API Terms clause 1.5 restricts Telegram-derived data in AI/ML development/enhancement/deployment. The existing 152 Telegram discovery channel records are candidate identities, not 152 licensed/verified API sources. The previous 152 registry review found no actually authorized Telegram channels.

**Do not activate broad public-channel MTProto scraping via the existing TELEGRAM_SESSION or API credentials.** No access-token, phone OTP or 2FA code should be placed in a PR, this chat or GitHub artifact. Public URL does NOT imply bulk mining rights, publisher authorization or terms compatibility.

Allowed future publisher-consented path, subject to an actual documented terms/license review:
- Each publisher/channel owner deliberately **authorizes** a specific dedicated Geomacro Bot API integration / independent original official feed, with written revocable scope of publication use and machine processing. Put the bot in only channels where the publisher is authorized to do so.
- Before using a message, confirm platform content/data licensing and AI restrictions permit the specific processing. A channel-owner licence alone may not override Telegram's platform terms. Safest alternative is a non-Telegram **original publisher HTTPS RSS/Atom/JSON push** feed, where original-site terms independently permit this use.
- Authorization evidence, verified source identity, permitted geographic/topic scope, deletion/opt-out and expiration must be kept privately by responsible owner. The historical Supabase Telegram approval table is **NOT** a Cloudflare production authorization system; do not reactivate Supabase.
- Even for genuinely permitted feeds, use only minimal *private leads*, never raw Telegram customer delivery; separately verify with original first-party non-Telegram source and commercial derived-use rights before any customer charge/GRO.
- Therefore **current automated Telegram production authorization remains OFF**. Owner must establish permitted publisher push/feed and an independent terms-compatible scope before any transition to ON. No automatic YES override, session forged or retroactive approvals.

## Operational cadence and coverage limits
- 5-minute scheduled original-source pulse + 15-minute public embargo is a **best-effort 20-minute target**, not a guarantee. GitHub schedule can run late and origin dates can be day-only, late, wrong or blocked. No 195×3 *every news item* promise is honest.
- 195 countries × 3 categories routing is an **eligibility/observation matrix**; active first-party sources are a much smaller verified subset. Country reports must say which countries have genuinely qualified first-party originals and which have UNKNOWN source coverage. Do not infer zero news from no records.
- For wider international trade use WTO RSS + New Zealand Beehive + existing UN/Fed/ECB/BIS/GOV.UK/NRCAN source pool, and WTO free Timeseries / World Bank reference only for explicitly **periodic** structural context. Country local origination needs national official RSS/Atom and documented original article timestamp/rights.
- WTO and NZ Beehive source-credit-required news cannot enter existing no-source/no-attribution **paid** structured responses through the open derived-journal hints. Existing approved structural-baseline x402 capability prices remain frozen and merchant mainnet remains LOCKED until separate verified buyer payment approval.
- This is one genuine source-pipeline improvement, not completion of 195×3 actual total news acquisition, signed GRI, Telegram authorization, a full 20-minute SLA or receipt-proven commercial revenue.

## Owner checklist
1. Do NOT buy a Telegram service, paid source API, GitHub runner or Cloudflare plan; keep owner laptop OFF except for occasional approval.
2. Verify the official NZ/WTO read-only source health diagnostic on GitHub after merge; if Beehive HTML/MIME refuses, keep it quarantined and switch to publisher-approved stable feed where verifiable, not a shadow scraper.
3. To truly bring Telegram channels into the intelligence pipeline, obtain channel-publisher consent **and** a legally/contractually compliant original HTTPS delivery channel. Secure any credentials inside the existing deployment secret store. Do not send OTP/API hash/session to ChatGPT.
4. Watch source-native current original item counts vs the D1 observed publication count, GitHub scheduled-run latency and 72-hour bound. A green scheduled workflow does not prove a new release.
5. To collect USDC, first independently pass an actual rights-verified structured offer + quote + protected mainnet authorization and buyer settlement; source discovery never permits charging.
