"""Source-side adapters. Disabled unless a named feed and lawful access are configured.

Provider messages are leads only. A transport-success receipt is not a source-
rights or verification receipt. No proxy bypass, public-channel harvesting or
unauthorized paid-data access is implemented here.
"""
from __future__ import annotations

import asyncio
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
import json
import logging
import os
from typing import Awaitable, Callable
from urllib.parse import urlparse

from bs4 import BeautifulSoup
import feedparser
import httpx
from telethon import TelegramClient, events
from telethon.sessions import StringSession
import websockets

log = logging.getLogger("risk-gate-sources")
Publish = Callable[[str, dict], Awaitable[None]]

def configured_json(name: str, default):
    raw = os.getenv(name)
    if not raw:
        return default
    return json.loads(raw)

def enabled(name: str) -> bool:
    return os.getenv(name, "").lower() == "true"

def safe_http_endpoint(url: str) -> bool:
    parsed = urlparse(url)
    return parsed.scheme == "https" and bool(parsed.hostname)

def feed_timestamp(entry: dict) -> str | None:
    for field in ("published", "updated"):
        value = entry.get(field)
        if not value:
            continue
        try:
            dt = parsedate_to_datetime(value)
            if dt.tzinfo:
                return dt.astimezone(timezone.utc).isoformat()
        except (TypeError, ValueError, IndexError):
            pass
    return None

async def poll_rss(name: str, feeds: list[dict], publish: Publish, poll_seconds: int = 60) -> None:
    if not feeds:
        return
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        while True:
            for feed in feeds:
                try:
                    url = feed["url"]
                    if not safe_http_endpoint(url) or not feed.get("approved", False):
                        continue
                    response = await client.get(url, headers={"User-Agent": "GeoMacro-Source-Watcher/1.0"})
                    response.raise_for_status()
                    parsed = feedparser.parse(response.content)
                    if parsed.bozo and not parsed.entries:
                        raise ValueError("malformed RSS/ATOM")
                    for entry in parsed.entries[:100]:
                        headline = str(entry.get("title", "")).strip()
                        rid = str(entry.get("id") or entry.get("link") or "")
                        if not headline or not rid:
                            continue
                        record = {
                            "id": rid, "headline": headline,
                            "url": entry.get("link"),
                            "published_at": feed_timestamp(entry),
                            "country_iso3": feed.get("country_iso3"),
                        }
                        await publish(name, record)
                except Exception as exc:
                    log.error("source=%s feed=%s error=%s", name, feed.get("url"), type(exc).__name__)
            await asyncio.sleep(max(20, poll_seconds))

async def poll_gazettes(feeds: list[dict], publish: Publish) -> None:
    if not feeds:
        return
    async with httpx.AsyncClient(timeout=15, follow_redirects=False) as client:
        while True:
            for feed in feeds:
                if not feed.get("approved") or not safe_http_endpoint(feed.get("url", "")):
                    continue
                try:
                    response = await client.get(feed["url"], headers={"User-Agent":"GeoMacro-Source-Watcher/1.0"})
                    response.raise_for_status()
                    doc = BeautifulSoup(response.text, "html.parser")
                    selector = str(feed.get("selector") or "")
                    if not selector:
                        continue
                    for node in doc.select(selector)[:60]:
                        title = node.get_text(" ", strip=True)
                        link = node if node.name == "a" else node.find("a")
                        href = link.get("href") if link else None
                        absolute = httpx.URL(feed["url"]).join(href or "").__str__()
                        if not title or not href or not absolute.startswith("https://"):
                            continue
                        # Without an original publisher time this is not promoted as fresh.
                        await publish("government_gazettes", {
                            "id": absolute, "headline": title[:1500],
                            "url": absolute, "country_iso3": feed.get("country_iso3"),
                            "published_at": None,
                        })
                except Exception as exc:
                    log.error("source=government_gazettes error=%s", type(exc).__name__)
            await asyncio.sleep(120)

async def poll_tradingeconomics(publish: Publish) -> None:
    key = os.getenv("TRADINGECONOMICS_API_KEY", "").strip()
    if not key or not enabled("TRADINGECONOMICS_LICENSE_APPROVED"):
        return
    url = "https://api.tradingeconomics.com/calendar/updates"
    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            try:
                response = await client.get(url, headers={"Authorization":key}, params={"f":"json"})
                response.raise_for_status()
                data = response.json()
                if not isinstance(data, list):
                    raise ValueError("unexpected economic calendar schema")
                for item in data[:150]:
                    if not isinstance(item, dict):
                        continue
                    rid = item.get("CalendarId") or item.get("Ticker")
                    headline = item.get("Event")
                    if not rid or not headline:
                        continue
                    await publish("tradingeconomics", {
                        "id": str(rid) + ":" + str(item.get("Date") or ""),
                        "headline": str(headline),
                        "Country": item.get("Country"),
                        "Date": item.get("Date"),
                    })
            except Exception as exc:
                log.error("source=tradingeconomics error=%s", type(exc).__name__)
            await asyncio.sleep(60)

async def poll_liveuamap(publish: Publish) -> None:
    # Contract-dependent endpoint: the provider URL must come from a licensed API agreement.
    url = os.getenv("LIVEUAMAP_API_URL", "").strip()
    token = os.getenv("LIVEUAMAP_API_TOKEN", "").strip()
    if not safe_http_endpoint(url) or not token or not enabled("LIVEUAMAP_LICENSE_APPROVED"):
        return
    async with httpx.AsyncClient(timeout=15) as client:
        while True:
            try:
                response = await client.get(url, headers={"Authorization":f"Bearer {token}"})
                response.raise_for_status()
                data = response.json()
                items = data if isinstance(data, list) else data.get("items", [])
                if not isinstance(items, list):
                    raise ValueError("unexpected Liveuamap API response")
                for item in items[:150]:
                    if not isinstance(item, dict):
                        continue
                    record = {
                        "id": item.get("id"), "headline": item.get("title") or item.get("headline"),
                        "url": item.get("url"), "published_at": item.get("published_at"),
                        "country_iso3": item.get("country_iso3"),
                    }
                    if record["id"] and record["headline"]:
                        await publish("liveuamap", record)
            except Exception as exc:
                log.error("source=liveuamap error=%s", type(exc).__name__)
            await asyncio.sleep(60)

async def stream_ais(publish: Publish) -> None:
    key = os.getenv("AISSTREAM_API_KEY", "").strip()
    boxes = configured_json("AIS_BOUNDING_BOXES_JSON", [])
    if not key or not boxes or not enabled("AIS_LICENSE_APPROVED"):
        return
    while True:
        try:
            async with websockets.connect(
                "wss://stream.aisstream.io/v0/stream",
                compression="deflate", ping_interval=30, ping_timeout=15,
            ) as stream:
                await stream.send(json.dumps({
                    "APIKey": key, "BoundingBoxes": boxes,
                    "FilterMessageTypes": ["SafetyBroadcastMessage"],
                }))
                async for message in stream:
                    packet = json.loads(message)
                    if packet.get("MessageType") != "SafetyBroadcastMessage":
                        continue
                    content = packet.get("Message", {}).get("SafetyBroadcastMessage", {})
                    title = str(content.get("Text") or "").strip()
                    meta = packet.get("MetaData") or {}
                    if not title:
                        continue
                    await publish("ais_maritime", {
                        "id": str(meta.get("MMSI")) + ":" + str(meta.get("time_utc")) + ":" + title[:80],
                        "headline": title, "published_at": meta.get("time_utc"),
                        # An AIS flag or bounding box is NOT a verified incident country.
                    })
        except asyncio.CancelledError:
            raise
        except Exception as exc:
            log.error("source=ais_maritime error=%s", type(exc).__name__)
        await asyncio.sleep(10)

async def stream_telegram(publish: Publish) -> None:
    # An independently reviewed publisher allowlist is required. This is never
    # public Telegram channel discovery or a scraping bypass.
    channels = configured_json("TELEGRAM_AUTHORIZED_CHANNELS_JSON", [])
    if (not enabled("TELEGRAM_AUTHORIZED_INGEST_ENABLED") or not channels
            or not all(c.get("rights_approved") is True for c in channels)):
        return
    api_id = os.getenv("TELEGRAM_API_ID", "")
    api_hash = os.getenv("TELEGRAM_API_HASH", "")
    session = os.getenv("TELEGRAM_SESSION", "")
    if not all((api_id, api_hash, session)):
        raise RuntimeError("authorized Telegram runtime credentials missing")
    ids = [c["channel"] for c in channels]
    country_by_channel = {str(c["channel"]): c.get("country_iso3") for c in channels}
    client = TelegramClient(StringSession(session), int(api_id), api_hash)
    @client.on(events.NewMessage(chats=ids))
    async def handler(event):
        chat = await event.get_chat()
        key = str(getattr(chat, "username", "") or getattr(chat, "id", ""))
        await publish("telegram_osint", {
            "id": f"{event.chat_id}:{event.message.id}",
            "headline": (event.message.message or "")[:1500],
            "published_at": event.message.date.astimezone(timezone.utc).isoformat(),
            "country_iso3": country_by_channel.get(key),
        })
    async with client:
        await client.run_until_disconnected()
