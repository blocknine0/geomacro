import asyncio
import json
import os
import random
import sys
import urllib.error
import urllib.request
from typing import Any


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


CORROBORATE_URL = require_env("GEOMACRO_FLASH_CORROBORATE_URL")
INGEST_TOKEN = require_env("GEOMACRO_FLASH_INGEST_TOKEN")

INTERVAL_SECONDS = max(
    10,
    min(
        120,
        int(os.environ.get("FLASH_CORROBORATION_INTERVAL_SECONDS", "15")),
    ),
)

USER_AGENT = os.environ.get(
    "BREAKING_FEED_USER_AGENT",
    "Geomacro/1.0 (+https://geomacro.live; contact=contact@geomacro.live)",
).strip()


def trigger_sync() -> dict[str, Any]:
    request = urllib.request.Request(
        CORROBORATE_URL,
        data=b"{}",
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": USER_AGENT,
            "x-geomacro-flash-token": INGEST_TOKEN,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=30) as response:
            body = response.read().decode("utf-8", errors="replace")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Geomacro corroboration HTTP {exc.code}: {detail[:1000]}"
        ) from exc


async def main() -> None:
    consecutive_failures = 0

    print(
        json.dumps(
            {
                "corroboration": "ready",
                "interval_seconds": INTERVAL_SECONDS,
            }
        ),
        flush=True,
    )

    while True:
        try:
            result = await asyncio.to_thread(trigger_sync)
            consecutive_failures = 0

            print(
                json.dumps(
                    {
                        "kind": "corroboration",
                        "ok": result.get("ok"),
                        "processed": result.get("processed"),
                        "verified": result.get("verified"),
                        "corroborating": result.get("corroborating"),
                        "unverified": result.get("unverified"),
                        "edges_written": result.get("edges_written"),
                    },
                    ensure_ascii=False,
                ),
                flush=True,
            )
        except Exception as exc:
            consecutive_failures += 1

            print(
                json.dumps(
                    {
                        "kind": "corroboration",
                        "ok": False,
                        "consecutive_failures": consecutive_failures,
                        "error": str(exc),
                    },
                    ensure_ascii=False,
                ),
                file=sys.stderr,
                flush=True,
            )

        # Small jitter prevents synchronized fleet polling while preserving the
        # near-real-time verification target.
        jitter = random.uniform(0.0, 2.0)
        await asyncio.sleep(INTERVAL_SECONDS + jitter)


if __name__ == "__main__":
    asyncio.run(main())
