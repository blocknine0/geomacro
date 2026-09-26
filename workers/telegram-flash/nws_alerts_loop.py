import json
import os
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone

import feedparser


INGEST_URL = os.environ.get("GEOMACRO_FLASH_INGEST_URL", "").strip()
INGEST_TOKEN = os.environ.get("GEOMACRO_FLASH_INGEST_TOKEN", "").strip()
FEED_URL = os.environ.get(
    "NWS_ACTIVE_ALERTS_ATOM_URL",
    "https://api.weather.gov/alerts/active.atom",
).strip()
POLL_SECONDS = max(30, min(300, int(os.environ.get("NWS_ALERTS_POLL_SECONDS", "60"))))
USER_AGENT = os.environ.get(
    "BREAKING_FEED_USER_AGENT",
    "Geomacro/1.0 (+https://geomacro.live; contact=contact@geomacro.live)",
).strip()


def require_config() -> None:
    if not INGEST_URL:
        raise RuntimeError("GEOMACRO_FLASH_INGEST_URL is required")
    if not INGEST_TOKEN:
        raise RuntimeError("GEOMACRO_FLASH_INGEST_TOKEN is required")


def fetch_feed() -> list:
    request = urllib.request.Request(
        FEED_URL,
        headers={
            "User-Agent": USER_AGENT,
            "Accept": "application/atom+xml, application/xml;q=0.9, */*;q=0.1",
        },
    )
    with urllib.request.urlopen(request, timeout=25) as response:
        raw = response.read()
    parsed = feedparser.parse(raw)
    if getattr(parsed, "bozo", False) and not parsed.entries:
        raise RuntimeError(f"NWS ATOM parse failed: {getattr(parsed, 'bozo_exception', 'unknown')}")
    return list(parsed.entries)


def iso_timestamp(entry) -> str | None:
    value = getattr(entry, "updated", None) or getattr(entry, "published", None)
    if isinstance(value, str) and value.strip():
        return value.strip()
    return None


def source_url(entry) -> str | None:
    link = getattr(entry, "link", None)
    return link.strip() if isinstance(link, str) and link.strip() else None


def record_id(entry) -> str | None:
    for key in ("id", "guid", "link"):
        value = getattr(entry, key, None)
        if isinstance(value, str) and value.strip():
            return value.strip()
    return None


def post_alert(entry) -> None:
    alert_id = record_id(entry)
    headline = str(getattr(entry, "title", "")).strip()
    if not alert_id or not headline:
        return

    payload = {
        "source_id": "nws_active_alerts_atom",
        "source_record_id": alert_id,
        "published_at": iso_timestamp(entry),
        "headline": headline[:1200],
        "body": None,
        "source_url": source_url(entry),
        "event_type": "MACRO_NATURAL_HAZARD_ALERT",
        "source_reliability": 98,
        "verification_status": "UNVERIFIED",
        "raw_payload": None,
    }
    body = json.dumps(payload).encode("utf-8")
    request = urllib.request.Request(
        INGEST_URL,
        data=body,
        method="POST",
        headers={
            "Content-Type": "application/json",
            "x-geomacro-flash-token": INGEST_TOKEN,
            "User-Agent": USER_AGENT,
        },
    )
    try:
        with urllib.request.urlopen(request, timeout=25) as response:
            response.read()
    except urllib.error.HTTPError as exc:
        error_body = exc.read().decode("utf-8", errors="replace")[:1200]
        raise RuntimeError(f"NWS ingest HTTP {exc.code}: {error_body}") from exc


def main() -> None:
    require_config()
    print(
        json.dumps(
            {
                "nws_alerts": "started",
                "feed": FEED_URL,
                "poll_seconds": POLL_SECONDS,
                "raw_payload_delivery": False,
            }
        ),
        flush=True,
    )
    while True:
        started = time.time()
        try:
            entries = fetch_feed()
            for entry in entries:
                post_alert(entry)
            print(
                json.dumps(
                    {
                        "nws_alerts": "poll_ok",
                        "entries": len(entries),
                        "checked_at": datetime.now(timezone.utc).isoformat(),
                    }
                ),
                flush=True,
            )
        except Exception as exc:
            print(
                json.dumps(
                    {
                        "nws_alerts": "poll_error",
                        "error": str(exc),
                        "checked_at": datetime.now(timezone.utc).isoformat(),
                    }
                ),
                flush=True,
            )
        elapsed = time.time() - started
        time.sleep(max(1.0, POLL_SECONDS - elapsed))


if __name__ == "__main__":
    main()
