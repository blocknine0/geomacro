import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from typing import Any

ARCHIVE_URL = os.environ.get("GEOMACRO_FLASH_ARCHIVE_URL", "").strip()
ARCHIVE_TOKEN = os.environ.get("GEOMACRO_FLASH_INGEST_TOKEN", "").strip()
INTERVAL_SECONDS = max(30, min(900, int(os.environ.get("FLASH_ARCHIVE_INTERVAL_SECONDS", "120"))))
USER_AGENT = os.environ.get(
    "BREAKING_FEED_USER_AGENT",
    "Geomacro/1.0 (+https://geomacro.live; contact=contact@geomacro.live)",
).strip()


def trigger_sync() -> dict[str, Any]:
    if not ARCHIVE_URL:
        raise RuntimeError("GEOMACRO_FLASH_ARCHIVE_URL is required")
    if not ARCHIVE_TOKEN:
        raise RuntimeError("GEOMACRO_FLASH_INGEST_TOKEN is required")

    request = urllib.request.Request(
        ARCHIVE_URL,
        data=b"{}",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "x-geomacro-flash-token": ARCHIVE_TOKEN,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=60) as response:
            return json.loads(response.read().decode("utf-8", errors="replace"))
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Geomacro flash archive HTTP {exc.code}: {detail[:1000]}") from exc


async def main() -> None:
    print(json.dumps({"archive": "ready", "interval_seconds": INTERVAL_SECONDS}), flush=True)
    while True:
        try:
            result = await asyncio.to_thread(trigger_sync)
            print(json.dumps({
                "kind": "archive",
                "ok": result.get("ok"),
                "archived": result.get("archived", 0),
                "manifest_id": result.get("manifest_id"),
            }, ensure_ascii=False), flush=True)
        except Exception as exc:
            print(json.dumps({
                "kind": "archive",
                "ok": False,
                "error": str(exc),
            }, ensure_ascii=False), file=sys.stderr, flush=True)
        await asyncio.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        pass
