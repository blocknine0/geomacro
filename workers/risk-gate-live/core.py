"""Pure, deterministic lead normalization for the isolated Risk Gate streaming lane.

These scores are operational severity estimates (1..10), NOT verified GRO
scores. No upstream source may authorize trading by setting a JSON flag.
"""
from __future__ import annotations

from datetime import datetime, timedelta, timezone
from hashlib import sha256
import json
import re
from typing import Any

import pycountry

THRESHOLD = 7.5
DISPATCH_WINDOW = timedelta(hours=3)
CATEGORY_BY_SOURCE = {
    "telegram_osint": "geopolitics",
    "ais_maritime": "geopolitics",
    "liveuamap": "geopolitics",
    "central_bank_rss": "macro",
    "tradingeconomics": "macro",
    "imf_dispatches": "macro",
    "government_gazettes": "minerals",
    "fastmarkets": "minerals",
    "bmi": "minerals",
}
EVENT_RULES = (
    ("War", 9.0, re.compile(r"\b(?:war|military strikes?|missile attacks?|airstrikes?|invasion|armed conflict|naval attack|shelling)\b", re.I)),
    ("Debt", 8.0, re.compile(r"\b(?:sovereign default|debt default|debt restructuring|bond default|debt crisis)\b", re.I)),
    ("Sanctions", 8.5, re.compile(r"\b(?:sanctions?|embargo|asset freeze|blacklist)\b", re.I)),
    ("Ban", 8.0, re.compile(r"\b(?:export ban|import ban|trade ban|shipment ban|export restrictions?|export controls?)\b", re.I)),
)
ALIASES = {
    "United States": "USA", "US": "USA", "U.S.": "USA",
    "United Kingdom": "GBR", "UK": "GBR",
    "Russia": "RUS", "South Korea": "KOR", "North Korea": "PRK",
    "Iran": "IRN", "China": "CHN", "Taiwan": "TWN",
    "Vietnam": "VNM", "Viet Nam": "VNM",
    "UAE": "ARE", "DR Congo": "COD",
}
NAME_CODES = {}
ISO3_CODES = set()
for _country in pycountry.countries:
    ISO3_CODES.add(_country.alpha_3)
    for _field in ("name", "official_name", "common_name"):
        _name = getattr(_country, _field, None)
        if _name and len(_name) >= 4:
            NAME_CODES[_name.casefold()] = _country.alpha_3
NAME_CODES.update({k.casefold(): v for k, v in ALIASES.items() if len(k) >= 4})
COUNTRY_PATTERN = re.compile(
    r"(?<!\w)(" + "|".join(re.escape(n) for n in sorted(NAME_CODES, key=len, reverse=True)) + r")(?!\w)",
    re.I,
)

def utcnow() -> datetime:
    return datetime.now(timezone.utc)

def parse_utc(value: Any) -> datetime | None:
    if not isinstance(value, str) or not value.strip():
        return None
    try:
        parsed = datetime.fromisoformat(value.replace("Z", "+00:00"))
        if parsed.tzinfo is None:
            return None
        return parsed.astimezone(timezone.utc)
    except ValueError:
        return None

def iso3_list(raw: dict[str, Any], headline: str) -> list[str]:
    codes: set[str] = set()
    for key in ("country_iso3", "iso3", "CountryCode", "country", "Country"):
        value = raw.get(key)
        if isinstance(value, list):
            values = value
        else:
            values = [value]
        for v in values:
            if not isinstance(v, str):
                continue
            candidate = v.strip().upper()
            if candidate in ISO3_CODES:
                codes.add(candidate)
            elif v.strip().casefold() in NAME_CODES:
                codes.add(NAME_CODES[v.strip().casefold()])
            else:
                try:
                    codes.add(pycountry.countries.lookup(v.strip()).alpha_3)
                except LookupError:
                    pass
    for found in COUNTRY_PATTERN.finditer(headline):
        codes.add(NAME_CODES[found.group(1).casefold()])
    return sorted(codes)

def classify(headline: str) -> tuple[str | None, float]:
    matched = [(kind, severity) for kind, severity, pat in EVENT_RULES if pat.search(headline)]
    return max(matched, key=lambda pair: pair[1]) if matched else (None, 1.0)

def canonicalize(raw: dict[str, Any], source: str) -> dict[str, Any]:
    if source not in CATEGORY_BY_SOURCE:
        raise ValueError("unregistered source")
    title = str(raw.get("headline") or raw.get("title") or raw.get("Event") or raw.get("event") or "").strip()
    if not title or len(title) > 1500:
        raise ValueError("invalid headline")
    record_id = str(raw.get("source_record_id") or raw.get("id") or raw.get("CalendarId") or raw.get("url") or "").strip()
    if not record_id:
        raise ValueError("source record id required")
    published = parse_utc(raw.get("published_at") or raw.get("published") or raw.get("Date") or raw.get("date"))
    event_type, severity = classify(title)
    countries = iso3_list(raw, title)
    event_id = sha256(f"{source}\0{record_id}".encode()).hexdigest()
    return {
        "schema": "geomacro.risk-gate-stream-lead.v1",
        "event_id": event_id,
        "source": source,
        "category": CATEGORY_BY_SOURCE[source],
        "source_record_id": record_id[:512],
        "headline": title,
        "published_at": published.isoformat() if published else None,
        "country_iso3": countries,
        "event_type": event_type,
        "severity": severity,
        "source_url": str(raw.get("url") or raw.get("source_url") or "")[:1500] or None,
        "verification_state": "UNVERIFIED",
        "commercial_eligible": False,
    }

def threshold_breached(event: dict[str, Any], liquid: bool) -> bool:
    return bool(
        event.get("event_type")
        and isinstance(event.get("severity"), (int, float))
        and event["severity"] >= THRESHOLD
        and event.get("country_iso3")
        and liquid is True
    )

def dispatch_envelope(event: dict[str, Any], symbol: str, now: datetime | None = None) -> dict[str, Any]:
    now = (now or utcnow()).astimezone(timezone.utc)
    return {
        "event_id": event["event_id"],
        "country_iso3": event["country_iso3"],
        "category": event["category"],
        "event_type": event["event_type"],
        "severity": event["severity"],
        "target_asset": symbol,
        "tranche": 1,
        "requested_action": "SHORT_OR_HEDGE",
        "generated_at": now.isoformat(),
        "expires_at": (now + DISPATCH_WINDOW).isoformat(),
        "source_published_at": event["published_at"],
    }

def no_expired_dispatch(envelope: dict[str, Any], now: datetime | None = None) -> bool:
    now = now or utcnow()
    generated, expires = parse_utc(envelope.get("generated_at")), parse_utc(envelope.get("expires_at"))
    return bool(generated and expires and generated <= now < expires and expires - generated == DISPATCH_WINDOW)
