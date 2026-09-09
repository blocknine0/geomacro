import asyncio
import hashlib
import json
import os
import random
import sys
import time
import urllib.error
import urllib.request
from calendar import timegm
from datetime import datetime, timezone
from typing import Any

import feedparser
from telethon import TelegramClient, events
from telethon.sessions import StringSession


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def env_bool(name: str, default: bool) -> bool:
    raw = os.environ.get(name)
    if raw is None:
        return default
    return raw.strip().lower() in {"1", "true", "yes", "on"}


def parse_channels(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def parse_reliability() -> dict[str, float]:
    raw = os.environ.get("TELEGRAM_SOURCE_RELIABILITY_JSON", "{}").strip()
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("TELEGRAM_SOURCE_RELIABILITY_JSON must be valid JSON") from exc

    if not isinstance(value, dict):
        raise RuntimeError("TELEGRAM_SOURCE_RELIABILITY_JSON must be a JSON object")

    result: dict[str, float] = {}
    for key, score in value.items():
        if not isinstance(key, str):
            continue
        try:
            numeric = float(score)
        except (TypeError, ValueError):
            continue
        result[key.lstrip("@").lower()] = max(0.0, min(100.0, numeric))
    return result


INGEST_URL = require_env("GEOMACRO_FLASH_INGEST_URL")
INGEST_TOKEN = require_env("GEOMACRO_FLASH_INGEST_TOKEN")

TELEGRAM_ENABLED = env_bool("TELEGRAM_ENABLED", True)
RSS_ENABLED = env_bool("BREAKING_RSS_ENABLED", True)

TELEGRAM_CHANNELS = parse_channels(os.environ.get("TELEGRAM_CHANNELS", ""))
TELEGRAM_SOURCE_RELIABILITY = parse_reliability()

RSS_POLL_SECONDS = max(
    20,
    min(
        300,
        int(os.environ.get("BREAKING_RSS_POLL_SECONDS", "45")),
    ),
)

RSS_BOOTSTRAP_MAX_ITEMS = max(
    1,
    min(
        100,
        int(os.environ.get("BREAKING_RSS_BOOTSTRAP_MAX_ITEMS", "25")),
    ),
)

USER_AGENT = os.environ.get(
    "BREAKING_FEED_USER_AGENT",
    "Geomacro/1.0 (+https://geomacro.live; contact=contact@geomacro.live)",
).strip()

DEFAULT_RSS_FEEDS: list[dict[str, Any]] = [
    {
        "source_id": "aljazeera_rss",
        "name": "Al Jazeera RSS",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "event_type": "GEOPOLITICS_BREAKING",
        "source_reliability": 70.0,
    },
    {
        "source_id": "federal_reserve_press_rss",
        "name": "Federal Reserve Press Releases",
        "url": "https://www.federalreserve.gov/feeds/press_all.xml",
        "event_type": "MACRO_OFFICIAL_RELEASE",
        "source_reliability": 95.0,
        "country_iso3": "USA",
    },
    {
        "source_id": "forexlive_rss",
        "name": "ForexLive RSS",
        "url": "https://www.forexlive.com/feed/news",
        "event_type": "MACRO_BREAKING",
        "source_reliability": 65.0,
    },
    {
        "source_id": "mining_com_rss",
        "name": "MINING.com RSS",
        "url": "https://www.mining.com/feed/",
        "event_type": "CRITICAL_MINERALS_BREAKING",
        "source_reliability": 70.0,
    },
]


def parse_rss_feeds() -> list[dict[str, Any]]:
    raw = os.environ.get("BREAKING_RSS_FEEDS_JSON", "").strip()
    if not raw:
        return DEFAULT_RSS_FEEDS

    try:
        parsed = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("BREAKING_RSS_FEEDS_JSON must be valid JSON") from exc

    if not isinstance(parsed, list):
        raise RuntimeError("BREAKING_RSS_FEEDS_JSON must be a JSON array")

    feeds: list[dict[str, Any]] = []
    for item in parsed:
        if not isinstance(item, dict):
            continue
        source_id = str(item.get("source_id", "")).strip()
        name = str(item.get("name", source_id)).strip()
        url = str(item.get("url", "")).strip()
        event_type = str(item.get("event_type", "BREAKING_NEWS")).strip()
        if not source_id or not url:
            continue
        feed = {
            "source_id": source_id,
            "name": name[:300],
            "url": url,
            "event_type": event_type[:200],
            "source_reliability": max(
                0.0,
                min(100.0, float(item.get("source_reliability", 50.0))),
            ),
        }
        country_iso3 = str(item.get("country_iso3", "")).strip().upper()
        if len(country_iso3) == 3:
            feed["country_iso3"] = country_iso3
        feeds.append(feed)

    return feeds


RSS_FEEDS = parse_rss_feeds()

MAX_TELEGRAM_BODY_CHARS = max(
    500,
    min(
        12000,
        int(os.environ.get("TELEGRAM_MAX_BODY_CHARS", "6000")),
    ),
)


def headline_from_text(text: str) -> str:
    for line in text.splitlines():
        cleaned = " ".join(line.split()).strip()
        if cleaned:
            return cleaned[:1200]
    return "Breaking flash"


def channel_key(entity: Any) -> str:
    username = getattr(entity, "username", None)
    if isinstance(username, str) and username.strip():
        return username.lstrip("@").lower()
    return str(getattr(entity, "id", "unknown"))


def channel_label(entity: Any) -> str:
    title = getattr(entity, "title", None)
    username = getattr(entity, "username", None)
    if isinstance(title, str) and title.strip():
        return title.strip()[:300]
    if isinstance(username, str) and username.strip():
        return f"@{username.lstrip('@')}"[:300]
    return str(getattr(entity, "id", "unknown"))[:300]


def telegram_source_url(entity: Any, message_id: int) -> str | None:
    username = getattr(entity, "username", None)
    if isinstance(username, str) and username.strip():
        return f"https://t.me/{username.lstrip('@')}/{message_id}"
    return None


def post_json_sync(payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        INGEST_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "x-geomacro-flash-token": INGEST_TOKEN,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8", errors="replace")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Geomacro flash ingest HTTP {exc.code}: {detail[:1000]}"
        ) from exc


def fetch_feed_sync(
    url: str,
    etag: str | None,
    modified: str | None,
) -> tuple[int, bytes, str | None, str | None]:
    headers = {
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        "User-Agent": USER_AGENT,
    }
    if etag:
        headers["If-None-Match"] = etag
    if modified:
        headers["If-Modified-Since"] = modified

    request = urllib.request.Request(url, headers=headers, method="GET")

    try:
        with urllib.request.urlopen(request, timeout=20) as response:
            return (
                int(response.status),
                response.read(),
                response.headers.get("ETag"),
                response.headers.get("Last-Modified"),
            )
    except urllib.error.HTTPError as exc:
        if exc.code == 304:
            return 304, b"", etag, modified
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Feed HTTP {exc.code}: {detail[:500]}") from exc


def structured_time_to_iso(value: Any) -> str | None:
    if value is None:
        return None
    try:
        timestamp = timegm(value)
    except Exception:
        return None
    return datetime.fromtimestamp(timestamp, tz=timezone.utc).isoformat()


def feed_entry_timestamp(entry: Any) -> str | None:
    for key in ("published_parsed", "updated_parsed", "created_parsed"):
        value = entry.get(key)
        iso = structured_time_to_iso(value)
        if iso:
            return iso
    return None


def feed_entry_identity(entry: Any, source_id: str) -> str:
    for key in ("id", "guid", "link"):
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:500]

    material = json.dumps(
        {
            "source_id": source_id,
            "title": str(entry.get("title", "")),
            "published": str(entry.get("published", "")),
            "updated": str(entry.get("updated", "")),
        },
        sort_keys=True,
        ensure_ascii=False,
    )
    return hashlib.sha256(material.encode("utf-8")).hexdigest()


def clean_link(entry: Any) -> str | None:
    link = entry.get("link")
    if isinstance(link, str) and link.strip():
        return link.strip()[:2000]
    return None


async def submit_telegram_message(message: Any) -> None:
    entity = await message.get_chat()
    text = (message.raw_text or "").strip()

    if not text:
        return

    chat_id = getattr(entity, "id", None)
    message_id = int(message.id)
    key = channel_key(entity)

    message_date = message.date
    if message_date.tzinfo is None:
        message_date = message_date.replace(tzinfo=timezone.utc)

    payload = {
        "source_id": "telegram_mtproto_flash",
        "source_record_id": f"{chat_id}:{message_id}",
        "published_at": message_date.astimezone(timezone.utc).isoformat(),
        "headline": headline_from_text(text),
        "body": text[:MAX_TELEGRAM_BODY_CHARS],
        "source_channel": channel_label(entity),
        "source_url": telegram_source_url(entity, message_id),
        "source_reliability": TELEGRAM_SOURCE_RELIABILITY.get(key, 50.0),
        "verification_status": "UNVERIFIED",
        "event_type": "TELEGRAM_BREAKING_FLASH",
        "raw_payload": {
            "telegram_chat_id": chat_id,
            "telegram_message_id": message_id,
            "telegram_username": getattr(entity, "username", None),
            "edit_date": (
                message.edit_date.astimezone(timezone.utc).isoformat()
                if message.edit_date is not None
                else None
            ),
            "has_media": message.media is not None,
        },
    }

    result = await asyncio.to_thread(post_json_sync, payload)

    print(
        json.dumps(
            {
                "kind": "telegram",
                "ok": result.get("ok"),
                "flash_id": result.get("flash_id"),
                "channel": key,
                "message_id": message_id,
                "countries": result.get("countries", []),
                "scoring_eligible": result.get("scoring_eligible"),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


async def safe_submit_telegram(message: Any) -> None:
    try:
        await submit_telegram_message(message)
    except Exception as exc:
        print(
            json.dumps(
                {
                    "kind": "telegram",
                    "ok": False,
                    "error": str(exc),
                    "message_id": getattr(message, "id", None),
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
            flush=True,
        )


async def run_telegram() -> None:
    if not TELEGRAM_ENABLED:
        print(json.dumps({"telegram": "disabled"}), flush=True)
        return

    if not TELEGRAM_CHANNELS:
        raise RuntimeError(
            "TELEGRAM_ENABLED=true but TELEGRAM_CHANNELS is empty"
        )

    api_id = int(require_env("TELEGRAM_API_ID"))
    api_hash = require_env("TELEGRAM_API_HASH")
    session = require_env("TELEGRAM_SESSION")

    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.start()

    resolved = []
    for channel in TELEGRAM_CHANNELS:
        entity = await client.get_entity(channel)
        resolved.append(entity)
        print(
            json.dumps(
                {
                    "telegram": "configured",
                    "channel": channel_key(entity),
                    "label": channel_label(entity),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )

    @client.on(events.NewMessage(chats=resolved))
    async def on_new_message(event: Any) -> None:
        await safe_submit_telegram(event.message)

    @client.on(events.MessageEdited(chats=resolved))
    async def on_message_edited(event: Any) -> None:
        await safe_submit_telegram(event.message)

    print(
        json.dumps(
            {
                "telegram": "ready",
                "channels": len(resolved),
            }
        ),
        flush=True,
    )

    await client.run_until_disconnected()


async def process_feed(
    feed: dict[str, Any],
    state: dict[str, dict[str, Any]],
) -> None:
    source_id = str(feed["source_id"])
    url = str(feed["url"])
    current = state.setdefault(
        source_id,
        {
            "etag": None,
            "modified": None,
            "seen": set(),
            "bootstrapped": False,
        },
    )

    status, raw, etag, modified = await asyncio.to_thread(
        fetch_feed_sync,
        url,
        current["etag"],
        current["modified"],
    )

    if status == 304:
        return

    current["etag"] = etag
    current["modified"] = modified

    parsed = feedparser.parse(raw)
    if getattr(parsed, "bozo", False) and not parsed.entries:
        raise RuntimeError(
            f"Feed parse failed: {getattr(parsed, 'bozo_exception', 'unknown error')}"
        )

    entries = list(parsed.entries)
    if not current["bootstrapped"]:
        entries = entries[:RSS_BOOTSTRAP_MAX_ITEMS]

    new_count = 0
    for entry in reversed(entries):
        identity = feed_entry_identity(entry, source_id)
        if identity in current["seen"]:
            continue

        title = " ".join(str(entry.get("title", "")).split()).strip()
        if not title:
            continue

        payload: dict[str, Any] = {
            "source_id": source_id,
            "source_record_id": identity,
            "published_at": feed_entry_timestamp(entry),
            "headline": title[:1200],
            "body": None,
            "source_channel": str(feed.get("name", source_id))[:300],
            "source_url": clean_link(entry),
            "source_reliability": float(feed.get("source_reliability", 50.0)),
            "verification_status": "UNVERIFIED",
            "event_type": str(feed.get("event_type", "BREAKING_NEWS"))[:200],
            "raw_payload": {
                "feed_guid": str(entry.get("id", entry.get("guid", "")))[:500] or None,
                "feed_published": str(entry.get("published", ""))[:200] or None,
                "feed_updated": str(entry.get("updated", ""))[:200] or None,
            },
        }

        country_iso3 = feed.get("country_iso3")
        if isinstance(country_iso3, str) and len(country_iso3) == 3:
            payload["country_iso3"] = country_iso3

        result = await asyncio.to_thread(post_json_sync, payload)
        current["seen"].add(identity)
        new_count += 1

        if len(current["seen"]) > 5000:
            current["seen"] = set(list(current["seen"])[-2500:])

        print(
            json.dumps(
                {
                    "kind": "rss",
                    "ok": result.get("ok"),
                    "source_id": source_id,
                    "flash_id": result.get("flash_id"),
                    "countries": result.get("countries", []),
                    "headline": title[:180],
                },
                ensure_ascii=False,
            ),
            flush=True,
        )

    current["bootstrapped"] = True

    print(
        json.dumps(
            {
                "kind": "rss_poll",
                "source_id": source_id,
                "http_status": status,
                "entries_seen": len(entries),
                "new_items": new_count,
            }
        ),
        flush=True,
    )


async def run_rss() -> None:
    if not RSS_ENABLED:
        print(json.dumps({"rss": "disabled"}), flush=True)
        return

    if not RSS_FEEDS:
        raise RuntimeError("BREAKING_RSS_ENABLED=true but no RSS feeds are configured")

    state: dict[str, dict[str, Any]] = {}
    failure_count: dict[str, int] = {}

    print(
        json.dumps(
            {
                "rss": "ready",
                "feeds": [feed["source_id"] for feed in RSS_FEEDS],
                "poll_seconds": RSS_POLL_SECONDS,
            }
        ),
        flush=True,
    )

    while True:
        for feed in RSS_FEEDS:
            source_id = str(feed["source_id"])
            try:
                await process_feed(feed, state)
                failure_count[source_id] = 0
            except Exception as exc:
                failure_count[source_id] = failure_count.get(source_id, 0) + 1
                print(
                    json.dumps(
                        {
                            "kind": "rss_error",
                            "source_id": source_id,
                            "failures": failure_count[source_id],
                            "error": str(exc),
                        },
                        ensure_ascii=False,
                    ),
                    file=sys.stderr,
                    flush=True,
                )

        jitter = random.uniform(0.0, min(5.0, RSS_POLL_SECONDS * 0.1))
        await asyncio.sleep(RSS_POLL_SECONDS + jitter)


async def main() -> None:
    if not TELEGRAM_ENABLED and not RSS_ENABLED:
        raise RuntimeError("Both Telegram and RSS breaking-news collectors are disabled")

    tasks = []
    if TELEGRAM_ENABLED:
        tasks.append(asyncio.create_task(run_telegram(), name="telegram"))
    if RSS_ENABLED:
        tasks.append(asyncio.create_task(run_rss(), name="rss"))

    done, pending = await asyncio.wait(
        tasks,
        return_when=asyncio.FIRST_EXCEPTION,
    )

    for task in done:
        error = task.exception()
        if error is not None:
            for pending_task in pending:
                pending_task.cancel()
            raise error

    for task in pending:
        task.cancel()


if __name__ == "__main__":
    started_at = time.time()
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        print(
            json.dumps(
                {
                    "shutdown": "keyboard_interrupt",
                    "uptime_seconds": round(time.time() - started_at, 1),
                }
            ),
            flush=True,
        )
