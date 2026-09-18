import json
import os
import time
import urllib.error
import urllib.request


EXPORT_URL = os.environ.get(
    "GEOMACRO_FLASH_ALIGNMENT_EXPORT_URL",
    "https://qogpagklwbfdmrgnrhzi.supabase.co/functions/v1/live-flash-alignment-export",
).strip()
ALIGN_URL = os.environ.get(
    "GEOMACRO_FLASH_ALIGNMENT_URL",
    "https://ldpwajisioljyjtojvfx.supabase.co/functions/v1/live-flash-align",
).strip()
SIGNAL_TOKEN = os.environ.get("GEOMACRO_FLASH_INGEST_TOKEN", "").strip()
MAIN_TOKEN = os.environ.get("GEOMACRO_MAIN_FLASH_INGEST_TOKEN", "").strip()

try:
    interval = int(os.environ.get("FLASH_ALIGNMENT_INTERVAL_SECONDS", "30"))
except ValueError:
    interval = 30
INTERVAL_SECONDS = max(15, min(300, interval))


def post_json(url: str, token: str, payload: dict) -> dict:
    request = urllib.request.Request(
        url,
        data=json.dumps(payload).encode("utf-8"),
        method="POST",
        headers={
            "Content-Type": "application/json",
            "Cache-Control": "no-store",
            "x-geomacro-flash-token": token,
            "User-Agent": "Geomacro-Telegram-Alignment/1.0",
        },
    )
    with urllib.request.urlopen(request, timeout=20) as response:
        return json.loads(response.read().decode("utf-8"))


def run_once() -> None:
    if not EXPORT_URL or not ALIGN_URL or not SIGNAL_TOKEN or not MAIN_TOKEN:
        print(
            json.dumps(
                {
                    "alignment": "disabled",
                    "reason": "required_alignment_environment_missing",
                }
            ),
            flush=True,
        )
        return

    exported = post_json(EXPORT_URL, SIGNAL_TOKEN, {"limit": 100})

    if exported.get("raw_content_included") is not False:
        raise RuntimeError("alignment export violated raw-content boundary")

    records = exported.get("records")
    if not isinstance(records, list):
        raise RuntimeError("alignment export returned invalid records")

    if not records:
        print(
            json.dumps(
                {
                    "alignment": "idle",
                    "records_exported": 0,
                }
            ),
            flush=True,
        )
        return

    result = post_json(
        ALIGN_URL,
        MAIN_TOKEN,
        {
            "schema_version": "telegram-signal-alignment-export-v1.0.0",
            "records": records,
        },
    )

    if result.get("raw_content_stored") is not False:
        raise RuntimeError("main alignment endpoint violated raw-content boundary")

    print(
        json.dumps(
            {
                "alignment": "success",
                "records_exported": len(records),
                "processed": result.get("processed", 0),
                "aligned": result.get("aligned", 0),
                "quarantined": result.get("quarantined", 0),
            }
        ),
        flush=True,
    )


async def main() -> None:
    import asyncio

    while True:
        try:
            run_once()
        except (urllib.error.URLError, TimeoutError, ValueError, RuntimeError) as exc:
            print(
                json.dumps(
                    {
                        "alignment": "error",
                        "error": str(exc),
                    }
                ),
                flush=True,
            )
        await asyncio.sleep(INTERVAL_SECONDS)


if __name__ == "__main__":
    import asyncio

    asyncio.run(main())
