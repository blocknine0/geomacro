import asyncio
import json
import os
import time


PRODUCTION_RSS_FEEDS = [
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
]


# Preserve an explicit operator override. Otherwise use the production-safe
# baseline discovered during the first live smoke test. MINING.com is omitted
# because the endpoint returned persistent CDN 403 responses from the worker.
if not os.environ.get("BREAKING_RSS_FEEDS_JSON", "").strip():
    os.environ["BREAKING_RSS_FEEDS_JSON"] = json.dumps(PRODUCTION_RSS_FEEDS)


# Import only after the environment override is in place because worker.py
# resolves its feed list at module-import time.
import worker  # noqa: E402


if __name__ == "__main__":
    started_at = time.time()
    try:
        asyncio.run(worker.main())
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
