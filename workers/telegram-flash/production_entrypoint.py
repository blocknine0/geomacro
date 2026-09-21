import asyncio
import json
import time

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
