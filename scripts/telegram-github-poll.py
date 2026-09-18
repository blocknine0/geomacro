"""Poll subscribed public Telegram channels and feed new/current messages into Geomacro.

This is designed for short-lived GitHub Actions runs, not as a permanent daemon.
The ingest endpoint remains the authoritative admission boundary.
"""

from __future__ import annotations

import asyncio
import json
import os
import sys
from datetime import datetime, timedelta, timezone
from typing import Any

from telethon import TelegramClient
from telethon.errors import FloodWaitError
from telethon.sessions import StringSession

INGEST_URL = os.environ.get("GEOMACRO_FLASH_INGEST_URL", "").strip()
INGEST_TOKEN = os.environ.get("GEOMACRO_FLASH_INGEST_TOKEN", "").strip()
TELEGRAM_API_ID_RAW = os.environ.get("TELEGRAM_API_ID", "").strip()
TELEGRAM_API_HASH = os.environ.get("TELEGRAM_API_HASH", "").strip()
TELEGRAM_SESSION = os.environ.get("TELEGRAM_SESSION", "").strip()
TELEGRAM_CHANNELS = [
    item.strip()
    for item in os.environ.get("TELEGRAM_CHANNELS", "").split(",")
    if item.strip()
]
TELEGRAM_SOURCE_RELIABILITY = os.environ.get(
    "TELEGRAM_SOURCE_RELIABILITY_JSON", "{}"
).strip()
POLL_LIMIT = max(
    20, min(500, int(os.environ.get("TELEGRAM_POLL_LIMIT", "200")))
)
LOOKBACK_MINUTES = max(
    5, min(180, int(os.environ.get("TELEGRAM_LOOKBACK_MINUTES", "30")))
)


def require(value: str, name: str) -> str:
    if not value:
        raise RuntimeError(f"{name} is required")
    return value


def parse_reliability() -> dict[str, float]:
    try:
        raw = json.loads(TELEGRAM_SOURCE_RELIABILITY or "{}")
    except json.JSONDecodeError as exc:
        raise RuntimeError(
            "TELEGRAM_SOURCE_RELIABILITY_JSON must be valid JSON"
        ) from exc

    if not isinstance(raw, dict):
        raise RuntimeError(
            "TELEGRAM_SOURCE_RELIABILITY_JSON must be a JSON object"
        )

    result: dict[str, float] = {}
    for key, value in raw.items():
        try:
            result[str(key).lstrip("@").lower()] = max(
                0.0, min(100.0, float(value))
            )
        except (TypeError, ValueError):
            continue
    return result


def headline_from_text(text: str) -> str:
    lines = [" ".join(line.split()) for line in text.splitlines()]
    lines = [line for line in lines if line]
    if not lines:
        return ""
    return lines[0][:1200]


def iso_utc(value: datetime | None) -> str | None:
    if value is None:
        return None
    if value.tzinfo is None:
        value = value.replace(tzinfo=timezone.utc)
    return value.astimezone(timezone.utc).isoformat()


def public_source_url(username: str, message_id: int) -> str:
    return f"https://t.me/{username}/{message_id}"


def channel_name(entity: Any) -> str:
    title = getattr(entity, "title", None)
    username = getattr(entity, "username", None)
    if isinstance(title, str) and title.strip():
        return title.strip()[:300]
    if isinstance(username, str) and username.strip():
        return f"@{username.lstrip('@')}"[:300]
    return str(getattr(entity, "id", "telegram-channel"))[:300]


async def post_json(
    client: Any,
    payload: dict[str, Any],
) -> dict[str, Any]:
    # Use the stdlib HTTPS client in a thread so the Telethon event loop stays
    # responsive while each ingress request waits on the network.
    import urllib.error
    import urllib.request

    request = urllib.request.Request(
        INGEST_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "User-Agent": (
                "Geomacro/1.0 "
                "(+https://geomacro.live; "
                "contact=contact@geomacro.live)"
            ),
            "x-geomacro-flash-token": INGEST_TOKEN,
        },
        method="POST",
    )

    def send() -> dict[str, Any]:
        try:
            with urllib.request.urlopen(request, timeout=15) as response:
                body = response.read().decode("utf-8", errors="replace")
                parsed = json.loads(body)
                if not isinstance(parsed, dict):
                    raise RuntimeError("ingest response is not a JSON object")
                return parsed
        except urllib.error.HTTPError as exc:
            detail = exc.read().decode("utf-8", errors="replace")
            raise RuntimeError(
                f"Geomacro flash ingest HTTP {exc.code}: {detail[:800]}"
            ) from exc

    return await asyncio.to_thread(send)


async def submit_message(
    message: Any,
    entity: Any,
    reliability: dict[str, float],
) -> tuple[bool, str]:
    text = (message.raw_text or "").strip()
    if not text:
        return False, "empty"

    username = getattr(entity, "username", None)
    if not isinstance(username, str) or not username.strip():
        # Keep this compatible with the existing ingest governance:
        # public username + stable t.me message URL are required.
        return False, "non_public_channel"

    key = username.lstrip("@").lower()
    chat_id = getattr(entity, "id", None)
    message_id = int(message.id)

    payload = {
        "source_id": "telegram_mtproto_flash",
        "source_record_id": f"{chat_id}:{message_id}",
        "published_at": iso_utc(message.date),
        "headline": headline_from_text(text),
        "body": text[:6000],
        "source_channel": channel_name(entity),
        "source_channel_key": key,
        "source_url": public_source_url(key, message_id),
        "source_reliability": reliability.get(key, 50.0),
        "verification_status": "UNVERIFIED",
        "event_type": "TELEGRAM_BREAKING_FLASH",
        "raw_payload": {
            "telegram_chat_id": chat_id,
            "telegram_message_id": message_id,
            "telegram_username": username,
            "edit_date": iso_utc(getattr(message, "edit_date", None)),
            "has_media": getattr(message, "media", None) is not None,
        },
    }

    result = await post_json(None, payload)
    if not result.get("ok"):
        raise RuntimeError("ingest returned ok=false")

    if result.get("duplicate") and result.get("unchanged"):
        return True, "unchanged"
    if result.get("material_update"):
        return True, "material_update"
    return True, "accepted"


async def main() -> int:
    require(INGEST_URL, "GEOMACRO_FLASH_INGEST_URL")
    require(INGEST_TOKEN, "GEOMACRO_FLASH_INGEST_TOKEN")
    require(TELEGRAM_API_ID_RAW, "TELEGRAM_API_ID")
    require(TELEGRAM_API_HASH, "TELEGRAM_API_HASH")
    require(TELEGRAM_SESSION, "TELEGRAM_SESSION")

    if not TELEGRAM_CHANNELS:
        raise RuntimeError("TELEGRAM_CHANNELS is empty")

    try:
        api_id = int(TELEGRAM_API_ID_RAW)
    except ValueError as exc:
        raise RuntimeError("TELEGRAM_API_ID must be an integer") from exc

    reliability = parse_reliability()
    cutoff = datetime.now(timezone.utc) - timedelta(minutes=LOOKBACK_MINUTES)

    client = TelegramClient(
        StringSession(TELEGRAM_SESSION),
        api_id,
        TELEGRAM_API_HASH,
        request_retries=3,
        connection_retries=3,
        retry_delay=1,
        auto_reconnect=True,
        sequential_updates=False,
    )

    accepted = 0
    unchanged = 0
    material_updates = 0
    skipped = 0

    await client.start()

    try:
        for configured_channel in TELEGRAM_CHANNELS:
            entity = await client.get_entity(configured_channel)
            username = getattr(entity, "username", None)
            if not isinstance(username, str) or not username.strip():
                print(
                    json.dumps(
                        {
                            "channel": configured_channel,
                            "status": "skipped",
                            "reason": "not_public_username_channel",
                        }
                    ),
                    flush=True,
                )
                skipped += 1
                continue

            seen = 0
            sent = 0

            try:
                async for message in client.iter_messages(
                    entity,
                    limit=POLL_LIMIT,
                ):
                    message_date = getattr(message, "date", None)
                    if message_date is not None:
                        if message_date.tzinfo is None:
                            message_date = message_date.replace(
                                tzinfo=timezone.utc
                            )
                        if message_date < cutoff:
                            break

                    seen += 1
                    ok, outcome = await submit_message(
                        message,
                        entity,
                        reliability,
                    )
                    if ok:
                        accepted += 1
                        sent += 1
                        if outcome == "unchanged":
                            unchanged += 1
                        elif outcome == "material_update":
                            material_updates += 1

            except FloodWaitError as exc:
                raise RuntimeError(
                    f"Telegram FloodWait for {configured_channel}: "
                    f"{exc.seconds}s"
                ) from exc

            print(
                json.dumps(
                    {
                        "channel": username.lstrip("@").lower(),
                        "status": "ok",
                        "seen": seen,
                        "sent": sent,
                    }
                ),
                flush=True,
            )

    finally:
        await client.disconnect()

    print(
        json.dumps(
            {
                "status": "complete",
                "channels": len(TELEGRAM_CHANNELS),
                "accepted": accepted,
                "unchanged": unchanged,
                "material_updates": material_updates,
                "skipped": skipped,
                "lookback_minutes": LOOKBACK_MINUTES,
                "poll_limit": POLL_LIMIT,
            }
        ),
        flush=True,
    )
    return 0


if __name__ == "__main__":
    try:
        raise SystemExit(asyncio.run(main()))
    except Exception as exc:
        print(
            json.dumps(
                {
                    "status": "failed",
                    "error": str(exc)[:1200],
                }
            ),
            file=sys.stderr,
            flush=True,
        )
        raise
