# Telegram permissioned source -> reusable research JSON (25 October 2026)

This implementation **does not activate unlicensed sources** or merge
Telegram-only posts into publicly sold/current Geomacro news. It adds an
automatic production bridge for Telegram channels **after** source-specific
publisher consent and platform terms/content permissions have been reviewed
under the existing private registry and the publisher installs the Bot.

The private canonical repo is `blocknine0/geomacro-telegram-signals`.
The audited 25 Oct 2026 main registry had 152 source candidates:
131 Geopolitics, 15 Macro/FX, 6 Critical Minerals, nine distinct ISO3
countries, **zero ACTIVE or publisher-authorized entries**. No script, owner
approval of this feature, or 195 country-routing cell can invent the required
individual content/platform consent. Telegram 2026 content terms restrict
AI harvesting/indexing even from public channels. Do not scrape `t.me/s`,
export MTProto sessions, mass-enroll the 152 channels, or relabel discovery
candidates as permissioned.

## Hosted pipeline: no always-on laptop

1. Existing publisher-controlled Telegram channel grants *specific* direct Bot
   submissions, consent remains in force, and bot is added as administrator.
   Source registry has real per-source `publisher_authorized`,
   `BOT_API_CHANNEL_POST`, expiry, official identity, reviewed Telegram
   consent and `activation_status=ACTIVE`.
2. Owner-controlled private GitHub Actions deploys the existing Cloudflare
   Telegram webhook with real protected Bot token and secret and confirms
   getMe, admin access, setWebhook and readback. This can occur one time;
   thereafter the webhook pushes new consented updates.
3. Existing webhook creates **hash/topic-only, UNVERIFIED** envelope;
   source message text/URL is not stored. Existing shared B2 quota governor
   reserves PUT+GET and verifies exact compressed B2 readback. A source post
   without a verified quota slot cannot be advertised as delivered.
4. Existing hourly `telegram-b2-d1-consumer.yml` validates B2 SHA and D1
   producer pin, writes private leads, verifies independent D1 readback and
   only then ACKs the exact queue delivery. It now also writes a separate
   `telegram_research_json` D1 projection after that ACK.
5. Protected GET
   `https://geomacro-control-plane.daspallab202391.workers.dev/v1/internal/telegram-research-json`
   returns `geomacro.telegram-research-json.v1` metadata JSON, 72-hour
   rolling window, max 300 compact entries, 100 entries per page. Existing
   control-plane root bearer is mandatory. Optional `country=IND` or
   `category=rare_earth` and `offset=100`; no raw source material.
   NEVER embed that privileged bearer in public website JavaScript.
6. A distinct non-Telegram original issuer/verified permissioned source must
   corroborate the same event before Geomacro *separately* creates a usable
   public reusable factual news JSON item. Merely adding a private Telegram
   lead does not satisfy copyright, commercial source rights, Facts/Rights,
   signed GRO/GRI or x402 paid product requirements.

## 195 country routing, not fabricated Telegram feed activation

The producer's existing
`python scripts/audit_intake_readiness.py --coverage-out ...`
generates a 195 x 3 = 585 **routing/candidate** matrix from the pinned
country registry and actual consent-bearing source registry. Distinguish
`NO_COUNTRY_CHANNEL`, `AUTHORIZATION_REQUIRED` and
`AUTHORIZED_INTAKE_NOT_LIVE_PROOF`. Where no eligible channel has been
onboarded, a country/category remains unobserved, not current/covered.

## Source onboarding (the only remaining external gate for first live post)

An actual publisher or channel operator must approve the content-specific
use and add the bot. In the protected private repository, use the existing
`scripts/ops/apply_owner_private_bot_approval.py` with **real** local owner
and platform approval records, not dummy references. Validate the registry;
configure existing `production` environment secrets:
`TELEGRAM_BOT_TOKEN`, `TELEGRAM_WEBHOOK_SECRET`,
`TELEGRAM_HUMAN_APPROVAL=YES`, Cloudflare/B2 secrets and the repository
variable `TELEGRAM_PRODUCTION_DEPLOY_ENABLED=true`. Run and verify
`Deploy Telegram Signal Worker`. Publisher then submits one new post
after webhook activation; verify B2 SHA, D1 ACK, and protected JSON item.
Never send the bot token or approval documents in chat.

## Fail-closed acceptance

- Offline tests protect D1 source match, prior CONSUMED ACK, country/category,
  72-hour expiration, prohibited raw headline/post URL, no score/payment and
  strong bearer authentication at the existing worker guard.
- Protected D1 GET failure is 503, not empty confirmed news.
- No private JSON artifact is uploaded to the **public** main GitHub
  repository. Private API serves reusable research JSON instead.
- Production starts with 0 Telegram items while the real private source
  registry has 0 authorized publisher feeds. A green CI and deployment can
  prove the feature is installed but **not Telegram ingestion**.
- This changes neither public `/v1/public/reusable-source-news` nor
  existing x402 price/rights routes; no Telegram lead is sold.
