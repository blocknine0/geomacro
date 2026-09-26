import asyncio
import json
import os
import time

# Public Telegram MTProto scraping/aggregation is not an approved production
# intelligence input. Production runs the governed machine-feed registry only.
# Publisher-authorized Telegram submissions use the isolated push/bot path and
# never rely on this worker's MTProto client.
os.environ["TELEGRAM_ENABLED"] = "false"
os.environ["TELEGRAM_CHANNELS"] = ""

# worker.py is the single source of truth for the governed RSS registry and
# runtime resilience policy. Explicit BREAKING_RSS_FEEDS_JSON remains the only
# supported operator override.
import worker


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
