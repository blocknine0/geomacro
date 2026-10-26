# Free-tier, publisher-consented Telegram live metadata fastlane

This path is for **live private unverified research leads**, not Telegram scraping,
public AI news publication, commercial permissions, paid delivery, signed risk
scores or guaranteed global coverage.

## Source and permission gates

The private producer repository `blocknine0/geomacro-telegram-signals`
maintains the reviewed publisher channel registry. Only a channel with
`BOT_API_CHANNEL_POST`, individually documented voluntary content-specific
consent, nonexpired authorisation, and the actual publisher-installed Bot
can produce. Every source begins disabled. Revocation requires disabling that
entry in the private registry, redeploying the worker and removing the Bot;
previous D1 records expire after 25h (or can be deleted sooner).

Telegram Bot API webhook delivers `channel_post` and
`edited_channel_post`; no sessions, MTProto polling or
`t.me/s` scraping. Bot token and webhook secret are stored only in protected
worker/GitHub secrets. No user-supplied Telegram URL is fetched.

## D1-first private ingestion

For a source passing those gates, the producer can use
`TELEGRAM_FREE_D1_RESEARCH_ENABLED=true`. It hashes identities, broadly
classifies category and topic in ephemeral memory, and persists **only**
the source-neutral hash reference, category, country if approved, broad topic,
claimed Telegram timestamp and reception time. No usernames, raw posts,
links, content, media or hidden prompt are stored. Duplicate message IDs
are idempotent and edits replace the metadata row.

Protected API:
`GET /v1/internal/telegram-free-live-research-json?category=macro&offset=0`
requires the pre-existing server-only `CONTROL_PLANE_TOKEN`; never expose
this token in browser JavaScript. Paging: 0/100/200, at most 100 results/page.
Records auto-expire from API visibility after 25 hours. Storage pruning runs
on new events and scheduled housekeeping in the producer.

This is a free-tier architecture without B2 PUT/GET per message. Cloudflare
D1 Free has daily read/write and storage limits; if exhausted the ingestion
must return an error and must not fabricate a successful durable write.
No paid account, x402 capability, Supabase or PREDGE activation is required.

## Three categories and practical status

Registry category map: `GEOPOLITICS → geopolitics`,
`MACRO → macro`, `CRITICAL_MINERALS → rare_earth`.
On 2026-10-27 audit: 131/15/6 discovery candidates and **zero**
authorized/active channel entries. The 585-cell 195×3 matrix therefore
represents *routing*, not verified live Telegram news.

A live fact about a specific event must be independently observed on an
approved official original (RSS/Atom/first-party article) before publication
as verified public news. Telegram-only topic/hash metadata does not prove
who did what, location, date accuracy, licensing or impact.

## Operations

1. Deploy this main D1 migration and private API first.
2. Merge the associated producer implementation and enable the approved
   D1 research mode in its protected environment only after per-source consent.
3. Add Bot via publisher, verify Bot admin rights, `setWebhook` and
   `getWebhookInfo` with a protected owner operator.
4. Ask publisher to post one new permitted item; verify D1 row in the
   protected API and match private category and original timestamp.
5. If webhook delivery fails, use Telegram's `getWebhookInfo` for queue
   diagnostics, never claim latency or coverage absent proof.

No raw Telegram content is an authoritative or independently licensed original.
