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
import http.client
import urllib.error
import urllib.request
from urllib.parse import urljoin, urlencode
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


def parse_optional_source_ids(value: str | None) -> list[str] | None:
    if value is None or not value.strip():
        return None
    return list(dict.fromkeys(
        item.strip()
        for item in value.split(",")
        if item.strip()
    ))


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

# Public Telegram MTProto is opt-in only and is forcibly disabled by every
# production entrypoint. The default is false so direct worker invocation is
# fail-closed as well. Publisher-authorized Telegram uses a separate push path.
TELEGRAM_ENABLED = env_bool("TELEGRAM_ENABLED", False)
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
        "source_id": "un_all_documents_rss",
        "name": "UN Documents All Documents RSS",
        "url": "https://docs.un.org/rss/allundocs.xml",
        "event_type": "GEOPOLITICS_UN_DOCUMENT",
        "fallback_url": "https://www.un.org/en/documents",
        "fallback_link_prefix": "/en/documents",
        "source_reliability": 98.0,
        "max_entry_age_hours": 168,
    },
    {
        "source_id": "un_human_rights_council_rss",
        "name": "UN Human Rights Council RSS",
        "url": "https://docs.un.org/rss/hrc.xml",
        "event_type": "GEOPOLITICS_HUMAN_RIGHTS",
        "fallback_url": "https://hrcportal.ohchr.org/hrc-sessions",
        "fallback_link_prefix": "/",
        "source_reliability": 98.0,
        "max_entry_age_hours": 168,
    },
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
        "fallback_url": "https://main.un.org/securitycouncil/en/content/resolutions-0",
        "fallback_link_prefix": "/securitycouncil/en/content/",
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
        "fallback_url": "https://www.federalreserve.gov/newsevents/pressreleases/2026-press.htm",
        "fallback_link_prefix": "/newsevents/pressreleases/",
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
        "source_id": "bis_rss_media_releases",
        "name": "BIS Media Releases RSS",
        "url": "https://www.bis.org/doclist/all_pressrels.rss",
        "event_type": "MACRO_BIS_RELEASE",
        "source_reliability": 98.0,
        "max_entry_age_hours": 168,
    },
    {
        "source_id": "bis_rss_central_banker_speeches",
        "name": "BIS Central Bankers Speeches RSS",
        "url": "https://www.bis.org/doclist/cbspeeches.rss",
        "event_type": "MACRO_BIS_SPEECH",
        "source_reliability": 95.0,
        "max_entry_age_hours": 168,
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
        raise RuntimeError("BREAKING_RSS_FEEDS_JSON must be valid JSON array") from exc

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
                2,
                min(5, int(retry_attempts)),
            )

        retry_backoff_seconds = item.get("retry_backoff_seconds")
        if retry_backoff_seconds is not None:
            feed["retry_backoff_seconds"] = max(
                0.0,
                min(10.0, float(item.get("retry_backoff_seconds", 0.0))),
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


def telegram_source_id(channel: str) -> str:
    return "telegram_mtproto_flash"


def telegram_reliability(channel: str) -> float:
    return TELEGRAM_SOURCE_RELIABILITY.get(channel.lower(), 55.0)


def parse_published_at(entry: dict[str, Any]) -> str | None:
    for field in ("published_parsed", "updated_parsed", "created_parsed"):
        parsed = entry.get(field)
        if parsed:
            try:
                return datetime.fromtimestamp(timegm(parsed), tz=timezone.utc).isoformat()
            except (TypeError, ValueError, OverflowError):
                pass

    for field in ("published", "updated", "created"):
        raw = entry.get(field)
        if isinstance(raw, str) and raw.strip():
            return raw.strip()

    return None


def iso_to_epoch(value: str | None) -> float | None:
    if not value:
        return None
    try:
        return datetime.fromisoformat(value.replace("Z", "+00:00")).timestamp()
    except (ValueError, TypeError):
        return None


def is_entry_fresh(entry: dict[str, Any], feed: dict[str, Any]) -> bool:
    max_age_hours = float(feed.get("max_entry_age_hours", 24 * 7))
    if max_age_hours <= 0:
        return True
    published_at = parse_published_at(entry)
    published_epoch = iso_to_epoch(published_at)
    if published_epoch is None:
        return True
    return published_epoch >= time.time() - max_age_hours * 3600


def stable_feed_record_id(feed: dict[str, Any], entry: dict[str, Any]) -> str:
    for key in ("id", "guid", "link"):
        value = entry.get(key)
        if isinstance(value, str) and value.strip():
            return value.strip()[:1000]

    title = " ".join(str(entry.get("title", "")).split()).strip()
    published = parse_published_at(entry) or ""
    digest = hashlib.sha256(
        f"{feed['source_id']}|{title}|{published}".encode("utf-8")
    ).hexdigest()
    return f"synthetic:{digest}"


def normalize_feed_entry(feed: dict[str, Any], entry: dict[str, Any]) -> dict[str, Any]:
    title = " ".join(str(entry.get("title", "")).split()).strip()
    if not title:
        title = "Breaking feed update"
    link = str(entry.get("link", "")).strip() or None
    payload = {
        "source_id": feed["source_id"],
        "source_record_id": stable_feed_record_id(feed, entry),
        "published_at": parse_published_at(entry),
        "headline": title[:1200],
        "body": None,
        "source_url": link,
        "event_type": feed["event_type"],
        "source_reliability": feed["source_reliability"],
        "verification_status": "UNVERIFIED",
        "raw_payload": None,
    }
    country_iso3 = str(feed.get("country_iso3", "")).strip().upper()
    if len(country_iso3) == 3:
        payload["country_iso3"] = country_iso3
    return payload


def priority_feed_entries(feed: dict[str, Any], entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    priority_keywords = [
        str(value).strip().lower()
        for value in feed.get("priority_keywords", [])
        if str(value).strip()
    ]
    priority_max_items = int(feed.get("priority_max_items", 0))
    if not priority_keywords or priority_max_items <= 0:
        return []

    selected: list[dict[str, Any]] = []
    for entry in entries:
        haystack = " ".join(
            [
                str(entry.get("title", "")),
                str(entry.get("summary", "")),
                str(entry.get("description", "")),
            ]
        ).lower()
        if any(keyword in haystack for keyword in priority_keywords):
            selected.append(entry)
            if len(selected) >= priority_max_items:
                break
    return selected


def rss_session_headers(feed: dict[str, Any]) -> dict[str, str]:
    accept = "application/rss+xml, application/atom+xml, application/xml;q=0.9, text/xml;q=0.8, */*;q=0.6"
    source_id = str(feed.get("source_id", ""))
    if source_id == "usgs_minerals_news_rss":
        return {
            "User-Agent": USER_AGENT,
            "Accept": accept,
            "Cache-Control": "no-cache",
            "Pragma": "no-cache",
            "Connection": "close",
        }
    return {
        "User-Agent": USER_AGENT,
        "Accept": accept,
    }


def read_rss_response(feed: dict[str, Any], timeout: int) -> bytes:
    request = urllib.request.Request(
        str(feed["url"]),
        headers=rss_session_headers(feed),
    )
    with urllib.request.urlopen(request, timeout=timeout) as response:
        return response.read()


def read_usgs_minerals_response(feed: dict[str, Any], timeout: int) -> bytes:
    request = urllib.request.Request(
        str(feed["url"]),
        headers=rss_session_headers(feed),
    )
    parsed = urllib.parse.urlsplit(str(feed["url"]))
    if parsed.scheme != "https" or not parsed.hostname:
        return read_rss_response(feed, timeout)

    connection = http.client.HTTPSConnection(
        parsed.hostname,
        parsed.port or 443,
        timeout=timeout,
    )
    path = urllib.parse.urlunsplit(("", "", parsed.path or "/", parsed.query, ""))
    try:
        connection.request("GET", path, headers=rss_session_headers(feed))
        response = connection.getresponse()
        payload = response.read()
        if response.status >= 400:
            raise urllib.error.HTTPError(
                str(feed["url"]),
                response.status,
                response.reason,
                dict(response.headers.items()),
                None,
            )
        return payload
    finally:
        connection.close()


def is_retryable_feed_error(exc: BaseException) -> bool:
    if isinstance(exc, urllib.error.HTTPError):
        return exc.code in {408, 409, 425, 429, 500, 502, 503, 504}
    if isinstance(exc, urllib.error.URLError):
        return True
    if isinstance(exc, (TimeoutError, socket.timeout, http.client.HTTPException, ConnectionError)):
        return True
    return False


def fetch_rss_bytes_with_retry(feed: dict[str, Any]) -> bytes:
    timeout = int(feed.get("timeout_seconds", 25))
    attempts = int(feed.get("retry_attempts", 3))
    backoff_seconds = float(feed.get("retry_backoff_seconds", 1.5))
    last_error: BaseException | None = None

    for attempt in range(1, attempts + 1):
        try:
            if str(feed.get("source_id", "")) == "usgs_minerals_news_rss":
                return read_usgs_minerals_response(feed, timeout)
            return read_rss_response(feed, timeout)
        except BaseException as exc:
            last_error = exc
            if attempt >= attempts or not is_retryable_feed_error(exc):
                raise
            delay = backoff_seconds * (2 ** (attempt - 1)) + random.uniform(0, 0.35)
            print(
                json.dumps(
                    {
                        "kind": "rss_retry",
                        "source_id": feed["source_id"],
                        "attempt": attempt,
                        "next_attempt": attempt + 1,
                        "delay_seconds": round(delay, 3),
                        "error": str(exc),
                    }
                ),
                flush=True,
            )
            time.sleep(delay)

    if last_error:
        raise last_error
    raise RuntimeError(f"RSS fetch failed without error: {feed['source_id']}")


def fetch_fallback_entries(feed: dict[str, Any]) -> list[dict[str, Any]]:
    fallback_url = str(feed.get("fallback_url", "")).strip()
    fallback_prefix = str(feed.get("fallback_link_prefix", "")).strip()
    if not fallback_url or not fallback_prefix:
        return []

    request = urllib.request.Request(
        fallback_url,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "text/html,application/xhtml+xml;q=0.9,*/*;q=0.5",
        },
    )
    timeout = int(feed.get("timeout_seconds", 25))
    with urllib.request.urlopen(request, timeout=timeout) as response:
        raw = response.read()

    parser = NewsPageParser(fallback_prefix, fallback_url)
    return parser.feed(raw)


def post_feed_payload(payload: dict[str, Any]) -> dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    headers = {
        "Content-Type": "application/json",
        "User-Agent": USER_AGENT,
    }
    if OIDC_TOKEN:
        headers["Authorization"] = f"Bearer {OIDC_TOKEN}"
        headers["x-geomacro-github-oidc-token"] = OIDC_TOKEN
    if INGEST_TOKEN:
        headers["x-geomacro-flash-ingest-token"] = INGEST_TOKEN

    request = urllib.request.Request(
        INGEST_URL,
        data=body,
        method="POST",
        headers=headers,
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            response_body = response.read().decode("utf-8", errors="replace")
            if response_body.strip():
                try:
                    return json.loads(response_body)
                except json.JSONDecodeError:
                    return {"ok": True, "raw": response_body[:1000]}
            return {"ok": True}
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")[:2000]
        raise RuntimeError(
            f"flash ingest HTTP {exc.code} for source_id={payload.get('source_id')}: {error_body}"
        ) from exc


def fetch_rss_entries(feed: dict[str, Any]) -> tuple[list[dict[str, Any]], str]:
    try:
        raw = fetch_rss_bytes_with_retry(feed)
        parsed = feedparser.parse(raw)
        if getattr(parsed, "bozo", False) and not parsed.entries:
            raise RuntimeError(f"RSS parse failed: {getattr(parsed, 'bozo_exception', 'unknown')}")
        entries = [dict(entry) for entry in parsed.entries]
        if entries:
            return entries, "rss"
    except Exception as rss_error:
        fallback_entries = fetch_fallback_entries(feed)
        if fallback_entries:
            print(
                json.dumps(
                    {
                        "kind": "rss_fallback",
                        "source_id": feed["source_id"],
                        "reason": str(rss_error),
                        "count": len(fallback_entries),
                    }
                ),
                flush=True,
            )
            return fallback_entries, "html_fallback"
        raise

    fallback_entries = fetch_fallback_entries(feed)
    if fallback_entries:
        return fallback_entries, "html_fallback"

    return [], "rss"


def dedupe_entries(feed: dict[str, Any], entries: list[dict[str, Any]]) -> list[dict[str, Any]]:
    unique: dict[str, dict[str, Any]] = {}
    for entry in entries:
        unique[stable_feed_record_id(feed, entry)] = entry
    return list(unique.values())


def run_rss_feed(feed: dict[str, Any]) -> tuple[int, bool]:
    entries, transport = fetch_rss_entries(feed)
    entries = [entry for entry in dedupe_entries(feed, entries) if is_entry_fresh(entry, feed)]
    entries.sort(
        key=lambda entry: iso_to_epoch(parse_published_at(entry)) or 0.0,
        reverse=True,
    )

    selected = entries
    if not RSS_RUN_ONCE:
        selected = entries[:RSS_BOOTSTRAP_MAX_ITEMS]

    priority_entries = priority_feed_entries(feed, entries)
    selected_by_id = {stable_feed_record_id(feed, entry): entry for entry in selected}
    for entry in priority_entries:
        selected_by_id.setdefault(stable_feed_record_id(feed, entry), entry)
    selected = list(selected_by_id.values())

    posted = 0
    for entry in selected:
        post_feed_payload(normalize_feed_entry(feed, entry))
        posted += 1

    print(
        json.dumps(
            {
                "kind": "rss_source_complete",
                "source_id": feed["source_id"],
                "transport": transport,
                "entry_count": len(entries),
                "posted_count": posted,
                "ok": True,
            }
        ),
        flush=True,
    )
    return posted, True


def run_rss_once() -> None:
    print(
        json.dumps(
            {
                "rss": "ready",
                "feed_count": len(RSS_FEEDS),
                "feeds": [feed["source_id"] for feed in RSS_FEEDS],
            }
        ),
        flush=True,
    )
    failures = 0
    for feed in RSS_FEEDS:
        try:
            run_rss_feed(feed)
        except Exception as exc:
            failures += 1
            print(
                json.dumps(
                    {
                        "kind": "rss_error",
                        "source_id": feed["source_id"],
                        "ok": False,
                        "error": str(exc),
                    }
                ),
                file=sys.stderr,
                flush=True,
            )
    if failures:
        raise RuntimeError(f"RSS feeds incomplete: {failures}/{len(RSS_FEEDS)} failed")


async def rss_loop() -> None:
    while True:
        started = time.time()
        try:
            run_rss_once()
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "rss": "poll_error",
                        "error": str(exc),
                    }
                ),
                file=sys.stderr,
                flush=True,
            )
        if RSS_RUN_ONCE:
            return
        elapsed = time.time() - started
        await asyncio.sleep(max(1.0, RSS_POLL_SECONDS - elapsed))


async def main() -> None:
    tasks: list[asyncio.Task[Any]] = []

    if RSS_ENABLED:
        tasks.append(asyncio.create_task(rss_loop()))

    if TELEGRAM_ENABLED:
        api_id = int(require_env("TELEGRAM_API_ID"))
        api_hash = require_env("TELEGRAM_API_HASH")
        session = require_env("TELEGRAM_SESSION")
        if not TELEGRAM_CHANNELS:
            raise RuntimeError("TELEGRAM_CHANNELS is required when TELEGRAM_ENABLED=true")

        client = TelegramClient(StringSession(session), api_id, api_hash)

        @client.on(events.NewMessage(chats=TELEGRAM_CHANNELS))
        async def handle_new_message(event) -> None:
            chat = await event.get_chat()
            channel = str(getattr(chat, "username", "") or getattr(chat, "id", "")).lstrip("@").lower()
            text = str(event.message.message or "")
            if not text.strip():
                return

            payload = {
                "source_id": telegram_source_id(channel),
                "source_record_id": str(event.message.id),
                "published_at": event.message.date.isoformat() if event.message.date else None,
                "headline": headline_from_text(text),
                "body": text[:MAX_TELEGRAM_BODY_CHARS],
                "source_channel": channel,
                "source_url": (
                    f"https://t.me/{channel}/{event.message.id}"
                    if channel and not channel.lstrip("-").isdigit()
                    else None
                ),
                "event_type": "GEOPOLITICS_FLASH",
                "source_reliability": telegram_reliability(channel),
                "verification_status": "UNVERIFIED",
                "raw_payload": None,
            }
            post_feed_payload(payload)

        await client.start()
        tasks.append(asyncio.create_task(client.run_until_disconnected()))

    if not tasks:
        raise RuntimeError("No breaking-data intake mode is enabled")

    await asyncio.gather(*tasks)


if __name__ == "__main__":
    asyncio.run(main())
