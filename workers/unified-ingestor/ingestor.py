"""GeoMacro unified asynchronous RSS/Google News/OSINT ingestion service.

All writes go through the authenticated Cloudflare Worker, which performs a
single D1 batch and exact row readback. B2 receives one gzipped NDJSON object
per UTC hour; this service never calls any B2 list API.
"""
from __future__ import annotations

import asyncio
import gzip
import hashlib
import html
import json
import logging
import os
import re
import unicodedata
from contextlib import asynccontextmanager
from datetime import datetime, timezone
from email.utils import parsedate_to_datetime
from pathlib import Path
from typing import Any
from urllib.parse import quote

import feedparser
import httpx
from fastapi import FastAPI, Header, HTTPException
from pydantic import BaseModel, Field

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("geomacro.ingestor")

WORKER_URL = os.environ["GEOMACRO_INGEST_WORKER_URL"].rstrip("/")
WORKER_TOKEN = os.environ["GEOMACRO_INGEST_WORKER_TOKEN"]
RAW_INGEST_TOKEN = os.environ["GEOMACRO_RAW_INGEST_TOKEN"]
for required_secret in ("B2_GATEWAY_URL", "INTERNAL_GATEWAY_TOKEN"):
    if not os.environ.get(required_secret, "").strip():
        raise RuntimeError(f"Missing required environment variable: {required_secret}")
if len(WORKER_TOKEN) < 32 or len(RAW_INGEST_TOKEN) < 32:
    raise RuntimeError("Ingest and OSINT bearer credentials must each contain at least 32 characters")
gateway_url = os.environ["B2_GATEWAY_URL"].rstrip("/")
if not gateway_url.startswith("https://") or len(os.environ["INTERNAL_GATEWAY_TOKEN"]) < 32:
    raise RuntimeError("B2 gateway URL and bearer token are invalid")
POLL_SECONDS = max(60, min(int(os.getenv("POLL_SECONDS", "900")), 3600))
DEFAULT_REGISTRY = Path(__file__).resolve().parents[2] / "config" / "unified-rss-feed-registry.v1.json"
COUNTRY_REGISTRY = Path(__file__).resolve().parents[2] / "config" / "country-iso2-names.v1.json"
if os.getenv("GEOMACRO_RSS_FEEDS_JSON"):
    RSS_FEEDS = json.loads(os.environ["GEOMACRO_RSS_FEEDS_JSON"])
else:
    RSS_FEEDS = json.loads(DEFAULT_REGISTRY.read_text(encoding="utf-8"))["sources"]
GOOGLE_TOPICS = {
    "google_news_geopolitics": "geopolitics conflict sanctions",
    "google_news_central_banks": 'central bank rates Federal Reserve ECB BOJ',
    "google_news_commodities": "commodities oil LNG critical minerals",
}
GOOGLE_PREFIX = "https://news.google.com/rss/search?q="
GOOGLE_SUFFIX = "&hl=en-US&gl=US&ceid=US:en"
COUNTRIES = {
    "US": ("united states", "u.s.", "washington", "white house", "fed "),
    "CN": ("china", "chinese", "beijing", "pboc"),
    "IN": ("india", "indian", "new delhi", "rbi"),
    "RU": ("russia", "russian", "moscow", "kremlin"),
    "GB": ("united kingdom", "britain", "british", "london", "boe"),
    "UA": ("ukraine", "ukrainian", "kyiv"),
    "IR": ("iran", "iranian", "tehran"),
    "IL": ("israel", "israeli", "tel aviv"),
    "TW": ("taiwan", "taiwanese", "taipei"),
    "JP": ("japan", "japanese", "tokyo", "boj"),
    "KR": ("south korea", "seoul", "bank of korea"),
    "DE": ("germany", "german", "berlin", "bundesbank"),
    "FR": ("france", "french", "paris", "banque de france"),
    "BR": ("brazil", "brazilian", "brasilia"),
    "CA": ("canada", "canadian", "ottawa", "bank of canada"),
    "AU": ("australia", "australian", "canberra", "rba"),
    "SA": ("saudi arabia", "saudi", "riyadh"),
    "AE": ("united arab emirates", "uae", "abu dhabi", "dubai"),
    "MX": ("mexico", "mexican", "mexico city"),
    "ZA": ("south africa", "pretoria", "johannesburg"),
}
for country in json.loads(COUNTRY_REGISTRY.read_text(encoding="utf-8"))["countries"]:
    COUNTRIES.setdefault(country["iso2"], (country["name"].lower(),))
CATEGORY_TERMS = {
    "sanctions": ("sanction", "export control", "embargo", "blacklist"),
    "commodities": ("oil", "crude", "lng", "gas price", "copper", "lithium", "rare earth", "mineral", "commodity", "wheat", "gold"),
    "macro_economics": ("inflation", "interest rate", "central bank", "gdp", "currency", "forex", "federal reserve", "ecb", "boj", "employment", "bond yield"),
    "conflict": ("war", "military", "attack", "missile", "troops", "ceasefire", "conflict", "invasion", "armed forces"),
}
STRIP_HTML = re.compile(r"<[^>]*>")
SPACE = re.compile(r"\s+")


def has_term(text: str, term: str) -> bool:
    return re.search(r"(?<!\w)" + re.escape(term) + r"(?!\w)", text, flags=re.IGNORECASE) is not None


def normalized_title(title: str) -> str:
    return SPACE.sub(" ", unicodedata.normalize("NFC", title).strip()).lower()


def event_id(source: str, title: str, published_at: int) -> str:
    raw = f"{source}\n{normalized_title(title)}\n{published_at}".encode()
    return hashlib.sha256(raw).hexdigest()


def clean(value: Any, limit: int) -> str:
    return SPACE.sub(" ", html.unescape(STRIP_HTML.sub(" ", str(value or "")))).strip()[:limit]


def published_epoch(entry: Any) -> int | None:
    parsed = entry.get("published_parsed") or entry.get("updated_parsed")
    if parsed:
        return int(datetime(*parsed[:6], tzinfo=timezone.utc).timestamp())
    raw = entry.get("published") or entry.get("updated")
    if raw:
        try:
            value = parsedate_to_datetime(raw)
            return int(value.astimezone(timezone.utc).timestamp())
        except (TypeError, ValueError, OverflowError):
            pass
    return None


def classify(title: str, summary: str, forced_category: str | None = None) -> tuple[str | None, str | None]:
    text = f"{title} {summary}".lower()
    category = forced_category if forced_category in CATEGORY_TERMS else None
    if not category:
        category = next((name for name, words in CATEGORY_TERMS.items() if any(has_term(text, word) for word in words)), None)
    country = next((iso for iso, words in COUNTRIES.items() if any(has_term(text, word) for word in words)), None)
    return category, country


def normalize_item(item: dict[str, Any], *, source_name: str, source_type: str,
                   credibility: float, forced_category: str | None = None) -> dict[str, Any] | None:
    title = clean(item.get("title"), 1200)
    published = item.get("published_at")
    if not title or not isinstance(published, int) or published <= 0:
        return None
    summary = clean(item.get("summary"), 4000) or None
    category, country = classify(title, summary or "", forced_category)
    if not category:
        return None
    return {
        "id": event_id(source_name, title, published),
        "source_type": source_type,
        "source_name": source_name,
        "source_url": clean(item.get("source_url"), 1800) or None,
        "credibility_score": max(0.1, min(1.0, float(credibility))),
        "title": title,
        "summary": summary,
        "raw_payload_ref": None,
        "country_iso": country,
        "risk_category": category,
        "sentiment_score": None,
        "published_at": published,
    }


class RawObservation(BaseModel):
    source_name: str = Field(min_length=2, max_length=160, pattern=r"^[a-zA-Z0-9_.:-]+$")
    title: str = Field(min_length=1, max_length=1200)
    summary: str | None = Field(default=None, max_length=4000)
    source_url: str | None = Field(default=None, max_length=1800, pattern=r"^https://")
    published_at: int = Field(gt=0)
    country_iso: str | None = Field(default=None, pattern=r"^[A-Z]{2}$")
    risk_category: str | None = None


class IngestService:
    def __init__(self) -> None:
        self.http = httpx.AsyncClient(timeout=httpx.Timeout(25), follow_redirects=True, headers={"User-Agent": "GeoMacro-Research-Bot/1.0 (+https://geomacro.live)"})
        self.pending: dict[str, dict[str, Any]] = {}
        self.source_status: dict[str, dict[str, Any]] = {}
        self.raw_lock = asyncio.Lock()
        self.last_archive_hour: str | None = None

    async def fetch_feed(self, source_name: str, url: str, source_type: str, credibility: float,
                         category: str | None = None) -> list[dict[str, Any]]:
        try:
            response = await self.http.get(url)
            response.raise_for_status()
            parsed = await asyncio.to_thread(feedparser.parse, response.content)
            out = []
            for entry in parsed.entries:
                normalized = normalize_item({
                    "title": entry.get("title"),
                    "summary": entry.get("summary") or entry.get("description"),
                    "source_url": entry.get("link"),
                    "published_at": published_epoch(entry),
                }, source_name=source_name, source_type=source_type,
                    credibility=credibility, forced_category=category)
                if normalized:
                    out.append(normalized)
            self.source_status[source_name] = {"ok": True, "items": len(out),
                "checked_at": datetime.now(timezone.utc).isoformat()}
            return out
        except Exception as exc:
            self.source_status[source_name] = {"ok": False,
                "error": type(exc).__name__,
                "checked_at": datetime.now(timezone.utc).isoformat()}
            log.warning("source poll held source=%s error=%s", source_name, type(exc).__name__)
            return []

    async def collect(self) -> list[dict[str, Any]]:
        jobs = []
        for source, query in GOOGLE_TOPICS.items():
            url = GOOGLE_PREFIX + quote(query) + GOOGLE_SUFFIX
            category = {"google_news_geopolitics": "conflict", "google_news_central_banks": "macro_economics", "google_news_commodities": "commodities"}[source]
            jobs.append(self.fetch_feed(source, url, "verified_media", 0.55, category))
        for spec in RSS_FEEDS:
            if not isinstance(spec, dict) or not spec.get("name") or not spec.get("url"):
                continue
            source_type = spec.get("source_type", "verified_media")
            if source_type not in {"verified_media", "official", "unverified_osint"}:
                continue
            jobs.append(self.fetch_feed(str(spec["name"]), str(spec["url"]), source_type,
                float(spec.get("credibility_score", .75)), spec.get("risk_category")))
        results = await asyncio.gather(*jobs, return_exceptions=True)
        for result in results:
            if isinstance(result, list):
                for event in result:
                    self.pending.setdefault(event["id"], event)
        return await self.flush_batches()

    async def flush_batches(self) -> list[dict[str, Any]]:
        receipts = []
        ids = list(self.pending)
        for start in range(0, len(ids), 100):
            batch_ids = ids[start:start + 100]
            batch = [self.pending[key] for key in batch_ids]
            try:
                r = await self.http.put(WORKER_URL + "/v1/internal/unified-events",
                    headers={"Authorization": f"Bearer {WORKER_TOKEN}"},
                    json={"schema": "geomacro.unified-event-batch.v1", "items": batch})
                data = r.json()
                if r.status_code != 200 or data.get("ok") is not True or data.get("d1_exact_readback_verified") is not True:
                    raise RuntimeError(data.get("error", "D1_BATCH_NOT_VERIFIED"))
                for key in batch_ids:
                    self.pending.pop(key, None)
                receipts.append(data)
            except Exception as exc:
                log.error("batch held count=%d error=%s", len(batch), type(exc).__name__)
                break
        return receipts

    async def add_osint(self, observation: RawObservation) -> dict[str, Any]:
        event = normalize_item(observation.model_dump(), source_name=observation.source_name,
            source_type="unverified_osint", credibility=.2,
            forced_category=observation.risk_category)
        if not event:
            raise ValueError("UNCLASSIFIED_OSINT_EVENT")
        if observation.country_iso:
            event["country_iso"] = observation.country_iso
        async with self.raw_lock:
            if event["id"] in self.pending:
                return {"accepted": False, "duplicate": True, "event_id": event["id"]}
            self.pending[event["id"]] = event
        receipts = await self.flush_batches()
        verified = any(x.get("d1_exact_readback_verified") for x in receipts)
        return {"accepted": verified, "held": not verified, "event_id": event["id"]}

    async def archive_hour(self) -> dict[str, Any]:
        hour = datetime.now(timezone.utc).strftime("%Y%m%dT%H")
        if self.last_archive_hour == hour:
            return {"ok": True, "skipped": "hour_already_attempted"}
        self.last_archive_hour = hour
        try:
            export = await self.http.get(WORKER_URL + "/v1/internal/unified-events/archive?limit=500",
                headers={"Authorization": f"Bearer {WORKER_TOKEN}"})
            if export.status_code != 200:
                raise RuntimeError("D1_ARCHIVE_EXPORT_UNAVAILABLE")
            data = export.json()
            events = data.get("events")
            if data.get("ok") is not True or not isinstance(events, list):
                raise RuntimeError("D1_ARCHIVE_EXPORT_INVALID")
            if not events:
                return {"ok": True, "archived": 0}
            hour_utc = datetime.now(timezone.utc).strftime("%Y-%m-%dT%H")
            slot = await self.http.post(WORKER_URL + "/v1/internal/unified-events/archive-slot",
                headers={"Authorization": f"Bearer {WORKER_TOKEN}"},
                json={"schema": "geomacro.unified-event-archive-slot.v1", "hour_utc": hour_utc})
            slot_body = slot.json()
            if slot.status_code != 200 or slot_body.get("ok") is not True or slot_body.get("reserved") is not True:
                return {"ok": False, "held": True, "error": slot_body.get("error", "B2_HOURLY_SLOT_UNAVAILABLE")}
            payload = b"".join((json.dumps(row, ensure_ascii=False, separators=(",", ":")) + "\n").encode() for row in events)
            archive = gzip.compress(payload, compresslevel=6, mtime=0)
            sha = hashlib.sha256(archive).hexdigest()
            key = f"archive/events/{hour}-{sha}.ndjson.gz"
            gateway = await self.http.put(gateway_url + "/v1/internal/objects?path=" + quote(key, safe="/"),
                headers={"Authorization": f"Bearer {os.environ['INTERNAL_GATEWAY_TOKEN']}",
                    "Content-Type": "application/gzip"}, content=archive)
            gateway_body = gateway.json()
            if gateway.status_code != 200 or gateway_body.get("ok") is not True or \
                gateway_body.get("sha256") != sha or gateway_body.get("size_bytes") != len(archive) or \
                not gateway_body.get("b2_file_id"):
                raise RuntimeError("B2_WRITE_ACK_CHECKSUM_MISMATCH")
            verify = await self.http.post(WORKER_URL + "/v1/internal/unified-events/archive-verify",
                headers={"Authorization": f"Bearer {WORKER_TOKEN}"},
                json={"archive_object_key": key, "archive_sha256": sha})
            verify_body = verify.json()
            if verify.status_code != 200 or verify_body.get("ok") is not True or verify_body.get("b2_exact_readback_verified") is not True:
                raise RuntimeError("B2_EXACT_READBACK_UNVERIFIED")
            ack = await self.http.put(WORKER_URL + "/v1/internal/unified-events/archive-ack",
                headers={"Authorization": f"Bearer {WORKER_TOKEN}"},
                json={"schema": "geomacro.unified-event-archive-ack.v1", "archive_object_key": key,
                    "hour_utc": hour_utc, "archive_sha256": sha,
                    "b2_exact_readback_verified": True, "ids": [row["id"] for row in events]})
            result = ack.json()
            if ack.status_code != 200 or result.get("ok") is not True or result.get("d1_archive_pointer_readback_verified") is not True or result.get("b2_exact_readback_verified") is not True:
                raise RuntimeError("D1_ARCHIVE_ACK_UNVERIFIED")
            log.info("hourly_archive items=%d bytes=%d sha256=%s", len(events), len(archive), sha)
            return {"ok": True, "archived": len(events), "archive_sha256": sha,
                "b2_put_checksum_acknowledged": True,
                "b2_exact_readback_verified": True,
                "d1_archive_pointer_readback_verified": True, "has_more": data.get("has_more") is True}
        except Exception as exc:
            log.error("hourly_archive_held error=%s", type(exc).__name__)
            return {"ok": False, "held": True, "error": type(exc).__name__}

    async def run(self) -> None:
        while True:
            try:
                await self.collect()
            except Exception:
                log.exception("poll_cycle_failed")
            now = datetime.now(timezone.utc)
            hour = now.strftime("%Y%m%dT%H")
            if self.last_archive_hour != hour:
                await self.archive_hour()
            await asyncio.sleep(POLL_SECONDS)

    async def close(self) -> None:
        await self.http.aclose()


service = IngestService()


@asynccontextmanager
async def lifespan(_: FastAPI):
    task = asyncio.create_task(service.run())
    try:
        yield
    finally:
        task.cancel()
        try:
            await task
        except asyncio.CancelledError:
            pass
        await service.close()


app = FastAPI(title="GeoMacro Unified Ingestor", version="1.0.0", lifespan=lifespan)


@app.get("/health")
async def health():
    return {"ok": True, "service": "geomacro-unified-ingestor", "pending": len(service.pending),
        "source_count": len(service.source_status),
        "source_failures": sum(1 for row in service.source_status.values() if not row.get("ok"))}


@app.get("/healthz")
async def healthz():
    # Public liveness endpoint used by Render and the opt-in Cloudflare
    # keepalive. It deliberately exposes no feed registry or source failures.
    return {"ok": True, "service": "geomacro-unified-ingestor"}


@app.post("/v1/osint")
async def receive_osint(item: RawObservation, authorization: str | None = Header(default=None)):
    if authorization != f"Bearer {RAW_INGEST_TOKEN}":
        raise HTTPException(status_code=401, detail="UNAUTHORIZED")
    try:
        return await service.add_osint(item)
    except ValueError as exc:
        raise HTTPException(status_code=422, detail=str(exc)) from exc

