# GeoMacro Risk Gate low-latency streaming worker

Status: **isolated integration implementation, NOT production-live acceptance.** No existing signed-GRO, B2 storage, commercial switch, or Risk Gate customer execution authorization was changed.

## Requested pipeline

Sources: Telegram Telethon (authorized-only), AIS WebSocket, licensed Liveuamap API, central-bank RSS, licensed Trading Economics calendar updates, IMF RSS, government-gazette HTML watcher, Fastmarkets/BMI authenticated webhook inputs.

Source lead -> persistent RabbitMQ -> Python ISO3/country extraction + War/Debt/Ban/Sanctions classification -> 1-10 severity -> >=7.5 with actual fresh liquid target -> Slack/Discord/Telegram -> optional customer-controlled broker bridge (IBKR / Bloomberg EMSX / MetaTrader), tranche 1 SHORT_OR_HEDGE, validity three hours.

Every lead is UNVERIFIED and commercial_eligible=false until verified in the existing governed Geomacro path. Broker execution remains disabled by default, and cannot be approved by a source's self-assertion. This implementation provides the HTTPS connector contract to a *separate* customer-owned native IBKR/EMSX/MetaTrader bridge; it does NOT install any of these native broker SDKs or terminal sessions, and does not claim any submitted/fill receipt without proof.

## Installation

1. Copy .env.example to .env and configure real RabbitMQ credentials and at least one source.
2. Specify actual approved URLs, source authorizations, credentials, and original-event timestamps.
3. Provide an authenticated broker-side liquidity URL returning JSON with exact symbol, liquid=true, and observed_at (ISO-8601 timestamp not older than 30 seconds).
4. Configure at least one real alert destination. For execution configure CUSTOMER_EXECUTION_APPROVAL_URL and BROKER_BRIDGE_URL, credentials, provider, and atomic idempotency proof. BROKER_EXECUTION_ENABLED defaults false.
5. From this directory run: docker compose up -d --build. Check http://127.0.0.1:8765/_ready on the host. Webhooks require an existing TLS reverse proxy. The compose service is intentionally bound to localhost; RabbitMQ is not internet-exposed.

Use a real secret manager and secure host for production; compose alone is not a public deployment.

## Source configuration

CENTRAL_BANK_RSS_JSON and IMF_DISPATCH_RSS_JSON accept arrays of objects with fields url, country_iso3, approved=true. Each feed is polled about every 60 seconds. Treat the approved flag as a rights decision, not a shortcut around one.

GOVERNMENT_GAZETTES_JSON accepts url, selector, country_iso3, approved=true. Only permitted pages are scraped. Specify date_selector on each approved gazette entry when the item contains a real datetime or RFC 5322 published stamp; the worker extracts and normalizes it to UTC. No page has an invented publication timestamp; without one it remains a lead, not a trigger.

Trading Economics /calendar/updates is queried only with an approved licensed key. Its event Date is **not** source original publication time. No calendar date is silently used as news-publication proof.

AIS requires AISSTREAM_API_KEY and AIS_BOUNDING_BOXES_JSON (official API subscription) plus AIS_LICENSE_APPROVED=true. Only safety broadcast text is treated as an event lead; vessel position alone does not prove war or affected country.

Liveuamap polling defaults to 600 seconds (LIVEUAMAP_POLL_SECONDS is configurable) to avoid assuming an unlimited licensed request quota. Liveuamap requires a separately licensed LIVEUAMAP_API_URL and key. Provider response mapping must be checked against the actual agreement before setting LIVEUAMAP_LICENSE_APPROVED=true.

Public Telegram MTProto harvesting is disabled under GeoMacro's existing production governance. A new Telethon listener is present only as a permission-bound integration for independently approved publisher channels, explicitly requiring rights_approved=true for every configured channel. It has not been authorized for production by this change.

Fastmarkets and BMI HMAC webhook endpoints are /webhooks/fastmarkets and /webhooks/bmi, with X-Geomacro-Signature containing the raw-body HMAC-SHA256 hex digest; sender authentication and provider rights must be configured. This receiver does not prove the vendors offer or have enabled push-webhooks.

## Timing, storage, failure control

RabbitMQ has durable persistent messages, a 3-hour TTL and a dead-letter queue. Single replica local SQLite persists processed-event idempotency receipts. For horizontal scaling use shared durable dedup before multiple replicas. Message queue lag is logged with a target of less than 150ms (not a measured guarantee). Polling and provider delays are outside this metric.

Dispatch envelope expires exactly 3 hours after generation. Missing, stale (more than 3h) or future original source timestamps fail closed. Customer approval must explicitly match event, asset, action and tranche, and expires. Broker bridge must atomically enforce Idempotency-Key and reconcile ambiguous submissions; automatic blind retries are forbidden.

## Acceptance not yet performed

Real production external host, source credentials/licences, publisher agreements, source freshness proofs, RabbitMQ monitoring, repeated source-to-trade latency measurements, provider webhook semantics, real alert delivery, signed customer approval, native broker integration, real liquidity data, and brokerage sandbox/live transaction acceptance are not established by the code commit.

## Tests

Run from this directory:

    python -m pip install -r requirements.txt
    python -m unittest -v test_core.py
    python -m compileall -q .
