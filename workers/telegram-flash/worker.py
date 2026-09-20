import asyncio
import hashlib
import math
import json
import os
import random
import re
import socket
import sys
import time
import urllib.error
import urllib.request
from urllib.parse import urljoin
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
INGEST_TOKEN = os.environ.get("GEOMACRO_FLASH_INGEST_TOKEN", "").strip()
OIDC_TOKEN = os.environ.get("GEOMACRO_FLASH_OIDC_TOKEN", "").strip()

TELEGRAM_ENABLED = env_bool("TELEGRAM_ENABLED", True)
RSS_ENABLED = env_bool("BREAKING_RSS_ENABLED", True)
RSS_RUN_ONCE = env_bool("BREAKING_RSS_RUN_ONCE", False)

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

FIXED_RSS_COUNTRIES: dict[str, str] = {
    "federal_reserve_press_rss": "USA",
}

HIGH_CONFIDENCE_HEADLINE_COUNTRIES: list[tuple[str, str]] = [
    ("CHN", r"\b(?:china|chinese|beijing|prc|pboc|people'?s republic of china)\b"),
]

class NewsPageParser:
    def __init__(self, link_prefix: str, base_url: str):
        from html.parser import HTMLParser

        class _Parser(HTMLParser):
            def __init__(self, outer: "NewsPageParser"):
                super().__init__(convert_charrefs=True)
                self.outer = outer
                self.in_link = False
                self.href: str | None = None
                self.text_parts: list[str] = []

            def handle_starttag(self, tag: str, attrs: list[tuple[str, str | None]]) -> None:
                if tag != "a":
                    return
                href = dict(attrs).get("href")
                if not isinstance(href, str) or not href:
                    return
                if self.outer.link_prefix not in href:
                    return
                self.in_link = True
                self.href = href
                self.text_parts = []

            def handle_data(self, data: str) -> None:
                if self.in_link:
                    self.text_parts.append(data)

            def handle_endtag(self, tag: str) -> None:
                if tag != "a" or not self.in_link:
                    return
                title = " ".join("".join(self.text_parts).split()).strip()
                href = self.href
                self.in_link = False
                self.href = None
                self.text_parts = []
                if not href or not title or title.lower() == "read article":
                    return
                absolute = urljoin(self.outer.base_url, href)
                self.outer.entries.append({
                    "id": absolute,
                    "link": absolute,
                    "title": title[:1200],
                })

        self.link_prefix = link_prefix
        self.base_url = base_url
        self.entries: list[dict[str, Any]] = []
        self._parser = _Parser(self)

    def feed(self, raw: bytes) -> list[dict[str, Any]]:
        from html import unescape

        text = raw.decode("utf-8", errors="replace")
        self._parser.feed(unescape(text))
        self._parser.close()

        unique: dict[str, dict[str, Any]] = {}
        for entry in self.entries:
            unique[entry["link"]] = entry
        return list(unique.values())


DEFAULT_RSS_FEEDS: list[dict[str, Any]] = [
    {
        "source_id": "un_geneva_press_rss",
        "name": "UN Geneva Press Releases RSS",
        "url": "https://www.ungeneva.org/news-media/press-releases-list/rss.xml",
        "event_type": "GEOPOLITICS_OFFICIAL_RELEASE",
        "source_reliability": 95.0,
        "max_entry_age_hours": 48,
    },
    {
        "source_id": "un_security_council_docs_rss",
        "name": "UN Security Council Documents RSS",
        "url": "https://docs.un.org/rss/scdocs.xml",
        "event_type": "GEOPOLITICS_SECURITY_DOCUMENT",
        "source_reliability": 98.0,
        "max_entry_age_hours": 168,
    },
    {
        "source_id": "eu_council_press_rss",
        "name": "Council of the EU Press Releases RSS",
        "url": "https://www.consilium.europa.eu/en/rss/pressreleases.ashx",
        "event_type": "GEOPOLITICS_EU_OFFICIAL_RELEASE",
        "source_reliability": 95.0,
        "max_entry_age_hours": 72,
    },
    {
        "source_id": "ecb_press_rss",
        "name": "ECB Press Releases RSS",
        "url": "https://www.ecb.europa.eu/rss/press.html",
        "event_type": "MACRO_ECB_RELEASE",
        "source_reliability": 98.0,
        "max_entry_age_hours": 72,
    },
    {
        "source_id": "ecb_market_information_rss",
        "name": "ECB Market Information Dissemination RSS",
        "url": "https://mid.ecb.europa.eu/rss/mid.xml",
        "event_type": "MACRO_MARKET_INFORMATION",
        "source_reliability": 98.0,
        "max_entry_age_hours": 168,
    },
    {
        "source_id": "un_geneva_meeting_summaries_rss",
        "name": "UN Geneva Meeting Summaries RSS",
        "url": "https://www.ungeneva.org/news-media/meeting-summaries-list/rss.xml",
        "event_type": "GEOPOLITICS_OFFICIAL_MEETING",
        "source_reliability": 95.0,
        "max_entry_age_hours": 168,
    },

    {
        "source_id": "aljazeera_rss",
        "name": "Al Jazeera RSS",
        "url": "https://www.aljazeera.com/xml/rss/all.xml",
        "event_type": "GEOPOLITICS_BREAKING",
        "source_reliability": 70.0,
        "priority_keywords": [
            "china",
            "chinese",
            "beijing",
            "taiwan",
            "south china sea",
            "philippines",
        ],
        "priority_max_items": 5,
    },
    {
        "source_id": "bbc_world_rss",
        "name": "BBC News World RSS",
        "url": "https://feeds.bbci.co.uk/news/world/rss.xml",
        "event_type": "GEOPOLITICS_BREAKING",
        "source_reliability": 85.0,
        "priority_keywords": [
            "china",
            "chinese",
            "beijing",
            "taiwan",
            "south china sea",
            "philippines",
        ],
        "priority_max_items": 5,
    },
    {
        "source_id": "xinhua_english_china_rss",
        "name": "Xinhua English China RSS",
        "url": "https://www.xinhuanet.com/english/rss/chinarss.xml",
        "event_type": "GEOPOLITICS_BREAKING",
        "source_reliability": 90.0,
        "country_iso3": "CHN",
        "max_entry_age_hours": 24,
        "priority_keywords": [
            "china",
            "chinese",
            "beijing",
            "taiwan",
            "south china sea",
            "philippines",
            "trump",
            "xi",
            "sanctions",
            "tariff",
            "trade",
            "export",
            "imports",
            "military",
            "missile",
            "drone",
            "semiconductor",
            "chip",
            "rare earth",
            "critical mineral",
        ],
        "priority_max_items": 10,
        "fallback_url": "https://english.news.cn/china/index.htm",
        "fallback_link_prefix": "/2026",
    },
    {
        "source_id": "scmp_china_rss",
        "name": "South China Morning Post China RSS",
        "url": "https://www.scmp.com/rss/4/feed",
        "event_type": "GEOPOLITICS_BREAKING",
        "source_reliability": 80.0,
        "country_iso3": "CHN",
        "priority_keywords": [
            "china",
            "chinese",
            "beijing",
            "taiwan",
            "south china sea",
            "united states",
            "trump",
            "xi",
        ],
        "priority_max_items": 10,
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
        "priority_keywords": [
            "china",
            "chinese",
            "beijing",
            "taiwan",
            "south china sea",
            "philippines",
        ],
        "priority_max_items": 5,
    },
    {
        "source_id": "nrcan_news_atom",
        "name": "Natural Resources Canada News Releases Atom",
        "url": "https://api.io.canada.ca/io-server/gc/news/en/v2?dept=naturalresourcescanada&sort=publishedDate&orderBy=desc&publishedDate%3E=2021-07-23&pick=50&format=atom&atomtitle=Natural%20Resources%20Canada",
        "event_type": "CRITICAL_MINERALS_GOVERNMENT_RELEASE",
        "source_reliability": 95.0,
        "max_entry_age_hours": 168,
        "priority_keywords": [
            "critical mineral",
            "critical minerals",
            "lithium",
            "cobalt",
            "nickel",
            "graphite",
            "rare earth",
            "rare-earth",
            "copper",
            "mining",
            "minerals",
            "mineral"
        ],
        "priority_max_items": 10,
    },
    {
        "source_id": "usgs_minerals_news_rss",
        "name": "USGS Minerals News RSS",
        "url": "https://www.usgs.gov/news/minerals/feed",
        "event_type": "CRITICAL_MINERALS_BREAKING",
        "source_reliability": 90.0,
        "timeout_seconds": 25,
        "retry_attempts": 3,
        "retry_backoff_seconds": 2,
        "fallback_url": "https://www.usgs.gov/programs/mineral-resources-program/news",
        "fallback_link_prefix": "/programs/mineral-resources-program/news/",
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

        timeout_seconds = item.get("timeout_seconds")
        priority_keywords = item.get("priority_keywords")
        if isinstance(priority_keywords, list):
            feed["priority_keywords"] = [
                str(value).strip()
                for value in priority_keywords
                if str(value).strip()
            ][:30]

        priority_max_items = item.get("priority_max_items")
        if priority_max_items is not None:
            feed["priority_max_items"] = max(
                0,
                min(10, int(priority_max_items)),
            )

        max_entry_age_hours = item.get("max_entry_age_hours")
        if max_entry_age_hours is not None:
            feed["max_entry_age_hours"] = max(
                1,
                min(168, float(max_entry_age_hours)),
            )

        fallback_url = item.get("fallback_url")
        if isinstance(fallback_url, str) and fallback_url.strip():
            feed["fallback_url"] = fallback_url.strip()[:1000]

        fallback_link_prefix = item.get("fallback_link_prefix")
        if isinstance(fallback_link_prefix, str) and fallback_link_prefix.strip():
            feed["fallback_link_prefix"] = fallback_link_prefix.strip()[:300]

        if timeout_seconds is not None:
            feed["timeout_seconds"] = max(
                10,
                min(90, int(timeout_seconds)),
            )

        retry_attempts = item.get("retry_attempts")
        if retry_attempts is not None:
            feed["retry_attempts"] = max(
                0,
                min(3, int(retry_attempts)),
            )

        retry_backoff_seconds = item.get("retry_backoff_seconds")
        if retry_backoff_seconds is not None:
            feed["retry_backoff_seconds"] = max(
                0.0,
                min(10.0, float(retry_backoff_seconds)),
            )
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
        },
        method="POST",
    )

    if INGEST_TOKEN:
        request.add_header("x-geomacro-flash-token", INGEST_TOKEN)
    if OIDC_TOKEN:
        request.add_header("x-geomacro-github-oidc-token", OIDC_TOKEN)
        request.add_header("Authorization", f"Bearer {OIDC_TOKEN}")

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8", errors="replace")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Geomacro flash ingest HTTP {exc.code}: {detail[:1000]}"
        ) from exc


def fetch_web_page_sync(
    url: str,
    timeout_seconds: int = 30,
    retry_attempts: int = 1,
    retry_backoff_seconds: float = 2.0,
) -> tuple[int, bytes]:
    headers = {
        "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        "User-Agent": USER_AGENT,
    }
    last_error: Exception | None = None

    for attempt in range(retry_attempts + 1):
        request = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
                return int(response.status), response.read()
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            if 500 <= exc.code < 600 and attempt < retry_attempts:
                last_error = exc
            else:
                raise RuntimeError(f"Web page HTTP {exc.code}: {detail[:500]}") from exc
        except (TimeoutError, socket.timeout, urllib.error.URLError) as exc:
            last_error = exc

        if attempt < retry_attempts:
            time.sleep(retry_backoff_seconds * (attempt + 1))

    raise RuntimeError(
        f"Web page read failed after {retry_attempts + 1} attempts: {last_error}"
    ) from last_error


def fetch_feed_sync(
    url: str,
    etag: str | None,
    modified: str | None,
    timeout_seconds: int = 20,
    retry_attempts: int = 0,
    retry_backoff_seconds: float = 1.0,
) -> tuple[int, bytes, str | None, str | None]:
    headers = {
        "Accept": "application/rss+xml, application/atom+xml, application/xml, text/xml;q=0.9, */*;q=0.5",
        "User-Agent": USER_AGENT,
    }
    if etag:
        headers["If-None-Match"] = etag
    if modified:
        headers["If-Modified-Since"] = modified

    last_error: Exception | None = None

    for attempt in range(retry_attempts + 1):
        request = urllib.request.Request(url, headers=headers, method="GET")
        try:
            with urllib.request.urlopen(request, timeout=timeout_seconds) as response:
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
            if 500 <= exc.code < 600 and attempt < retry_attempts:
                last_error = exc
            else:
                raise RuntimeError(f"Feed HTTP {exc.code}: {detail[:500]}") from exc
        except (TimeoutError, socket.timeout, urllib.error.URLError) as exc:
            last_error = exc

        if attempt < retry_attempts:
            time.sleep(retry_backoff_seconds * (attempt + 1))

    raise RuntimeError(
        f"Feed read failed after {retry_attempts + 1} attempts: {last_error}"
    ) from last_error


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


def feed_entry_matches_priority(
    entry: Any,
    keywords: list[str],
) -> bool:
    text = " ".join(
        str(entry.get(key, "")).strip()
        for key in ("title", "summary", "description")
    ).lower()
    return any(
        keyword.strip().lower() in text
        for keyword in keywords
        if keyword.strip()
    )


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

    public_username = getattr(entity, "username", None)
    if not isinstance(public_username, str) or not public_username.strip():
        raise RuntimeError(
            "Telegram raw-signal source must be a public channel with a username"
        )

    key = public_username.lstrip("@").lower()

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
        "source_channel_key": key,
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
        username = getattr(entity, "username", None)
        if not isinstance(username, str) or not username.strip():
            raise RuntimeError(
                f"Configured Telegram source {channel!r} is not a public username channel"
            )
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

    transport = "rss"
    try:
        status, raw, etag, modified = await asyncio.to_thread(
            fetch_feed_sync,
            url,
            current["etag"],
            current["modified"],
            int(feed.get("timeout_seconds", 20)),
            int(feed.get("retry_attempts", 0)),
            float(feed.get("retry_backoff_seconds", 1.0)),
        )
    except Exception as primary_error:
        fallback_url = str(feed.get("fallback_url", "")).strip()
        fallback_link_prefix = str(feed.get("fallback_link_prefix", "")).strip()
        if not fallback_url or not fallback_link_prefix:
            raise

        status, raw = await asyncio.to_thread(
            fetch_web_page_sync,
            fallback_url,
            35,
            2,
            3.0,
        )
        transport = "official_page_fallback"

    if status == 304:
        return

    current["etag"] = etag
    current["modified"] = modified

    if transport == "rss":
        parsed = feedparser.parse(raw)
        if getattr(parsed, "bozo", False) and not parsed.entries:
            raise RuntimeError(
                f"Feed parse failed: {getattr(parsed, 'bozo_exception', 'unknown error')}"
            )
        all_entries = list(parsed.entries)

        # Treat HTTP 200 as transport success, not freshness success. Some
        # publishers retain legacy RSS URLs that serve archival entries.
        max_entry_age_hours = feed.get("max_entry_age_hours")
        fallback_url = str(feed.get("fallback_url", "")).strip()
        fallback_link_prefix = str(feed.get("fallback_link_prefix", "")).strip()
        if max_entry_age_hours is not None and fallback_url and fallback_link_prefix:
            published_times = [
                timegm(parsed_time) if parsed_time else float("nan")
                for parsed_time in (
                    entry.get("published_parsed")
                    or entry.get("updated_parsed")
                    or entry.get("created_parsed")
                    for entry in all_entries
                )
            ]
            latest_published = max(
                (value for value in published_times if math.isfinite(value)),
                default=float("nan"),
            )
            stale_cutoff = time.time() - float(max_entry_age_hours) * 60 * 60
            if not math.isfinite(latest_published) or latest_published < stale_cutoff:
                fallback_status, fallback_raw = await asyncio.to_thread(
                    fetch_web_page_sync,
                    fallback_url,
                    35,
                    2,
                    3.0,
                )
                parser = NewsPageParser(fallback_link_prefix, fallback_url)
                fallback_entries = parser.feed(fallback_raw)
                if not fallback_entries:
                    raise RuntimeError(
                        "RSS feed was stale and official fallback page returned no governed news entries"
                    )
                all_entries = fallback_entries
                transport = "official_page_fallback"

    else:
        parser = NewsPageParser(
            str(feed.get("fallback_link_prefix", "")),
            str(feed.get("fallback_url", "")),
        )
        all_entries = parser.feed(raw)
        if not all_entries:
            raise RuntimeError(
                "Official fallback page returned no governed news entries"
            )
    if not current["bootstrapped"]:
        latest_entries = all_entries[:RSS_BOOTSTRAP_MAX_ITEMS]
        priority_keywords = [
            str(value).strip()
            for value in feed.get("priority_keywords", [])
            if str(value).strip()
        ]
        priority_max_items = max(
            0,
            min(10, int(feed.get("priority_max_items", 0))),
        )
        priority_entries = [
            entry
            for entry in all_entries[RSS_BOOTSTRAP_MAX_ITEMS:]
            if feed_entry_matches_priority(entry, priority_keywords)
        ][:priority_max_items]
        seen_ids = {
            feed_entry_identity(entry, source_id)
            for entry in latest_entries
        }
        entries = latest_entries + [
            entry
            for entry in priority_entries
            if feed_entry_identity(entry, source_id) not in seen_ids
        ]
    else:
        entries = all_entries

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

        country_iso3 = (
            feed.get("country_iso3")
            or FIXED_RSS_COUNTRIES.get(source_id)
        )
        if isinstance(country_iso3, str) and len(country_iso3) == 3:
            payload["country_iso3"] = country_iso3
        else:
            normalized_title = " ".join(title.split()).strip().lower()
            for iso3, pattern in HIGH_CONFIDENCE_HEADLINE_COUNTRIES:
                if re.search(pattern, normalized_title, flags=re.IGNORECASE):
                    payload["country_iso3"] = iso3
                    break

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

    priority_items_selected = max(
        0,
        len(entries) - RSS_BOOTSTRAP_MAX_ITEMS,
    )

    current["bootstrapped"] = True

    print(
        json.dumps(
            {
                "kind": "rss_poll",
                "source_id": source_id,
                "http_status": status,
                "transport": transport,
                "entries_seen": len(entries),
                "new_items": new_count,
                "priority_items_selected": priority_items_selected,
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
                "run_once": RSS_RUN_ONCE,
            }
        ),
        flush=True,
    )

    while True:
        cycle_failed = False

        for feed in RSS_FEEDS:
            source_id = str(feed["source_id"])
            try:
                await process_feed(feed, state)
                failure_count[source_id] = 0
            except Exception as exc:
                cycle_failed = True
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

        if RSS_RUN_ONCE:
            if not cycle_failed:
                return

            # A one-shot certification poll must tolerate a transient outage in
            # one governed publisher. Retry the failed cycle a bounded number of
            # times rather than failing the whole acceptance run immediately.
            max_one_shot_retries = 3
            retry_cycle = max(failure_count.values(), default=0)
            if retry_cycle >= max_one_shot_retries:
                failed_sources = [
                    source_id
                    for source_id, failures in failure_count.items()
                    if failures > 0
                ]
                raise RuntimeError(
                    "One-shot RSS cycle failed after bounded retries for: "
                    + ", ".join(failed_sources)
                )

            delay = 5 * retry_cycle
            print(
                json.dumps(
                    {
                        "kind": "rss_retry",
                        "retry_cycle": retry_cycle,
                        "delay_seconds": delay,
                        "failed_sources": [
                            source_id
                            for source_id, failures in failure_count.items()
                            if failures > 0
                        ],
                    }
                ),
                flush=True,
            )
            await asyncio.sleep(delay)
            continue

        jitter = random.uniform(0.0, min(5.0, RSS_POLL_SECONDS * 0.1))
        await asyncio.sleep(RSS_POLL_SECONDS + jitter)


async def main() -> None:
    if not TELEGRAM_ENABLED and not RSS_ENABLED:
        raise RuntimeError("Both Telegram and RSS breaking-news collectors are disabled")

    if TELEGRAM_ENABLED and not INGEST_TOKEN:
        raise RuntimeError(
            "TELEGRAM_ENABLED=true requires GEOMACRO_FLASH_INGEST_TOKEN"
        )

    if RSS_ENABLED and not (INGEST_TOKEN or OIDC_TOKEN):
        raise RuntimeError(
            "RSS collection requires GEOMACRO_FLASH_INGEST_TOKEN or GEOMACRO_FLASH_OIDC_TOKEN"
        )

    if RSS_RUN_ONCE and TELEGRAM_ENABLED:
        raise RuntimeError("BREAKING_RSS_RUN_ONCE requires TELEGRAM_ENABLED=false")

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
