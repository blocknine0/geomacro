import asyncio
import json
import os
import sys
import urllib.error
import urllib.request
from datetime import timezone
from typing import Any

from telethon import TelegramClient, events
from telethon.sessions import StringSession


def require_env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def parse_channels(value: str) -> list[str]:
    channels = [item.strip() for item in value.split(",") if item.strip()]
    if not channels:
        raise RuntimeError("TELEGRAM_CHANNELS must contain at least one allowlisted channel")
    return channels


def parse_reliability() -> dict[str, float]:
    raw = os.environ.get("TELEGRAM_SOURCE_RELIABILITY_JSON", "{}").strip()
    try:
        value = json.loads(raw)
    except json.JSONDecodeError as exc:
        raise RuntimeError("TELEGRAM_SOURCE_RELIABILITY_JSON must be valid JSON") from exc

    if not isinstance(value, dict):
        raise RuntimeError("TELEGRAM_SOURCE_RELIABILITY_JSON must be a JSON object")

    result: dict[str, float] = {}
    for key, score in value.items():
        if not isinstance(key, str):
            continue
        try:
            numeric = float(score)
        except (TypeError, ValueError):
            continue
        result[key.lstrip("@").lower()] = max(0.0, min(100.0, numeric))
    return result


API_ID = int(require_env("TELEGRAM_API_ID"))
API_HASH = require_env("TELEGRAM_API_HASH")
SESSION = require_env("TELEGRAM_SESSION")
CHANNELS = parse_channels(require_env("TELEGRAM_CHANNELS"))
INGEST_URL = require_env("GEOMACRO_FLASH_INGEST_URL")
INGEST_TOKEN = require_env("GEOMACRO_FLASH_INGEST_TOKEN")
SOURCE_RELIABILITY = parse_reliability()

MAX_BODY_CHARS = max(
    500,
    min(
        12000,
        int(os.environ.get("TELEGRAM_MAX_BODY_CHARS", "6000")),
    ),
)

client = TelegramClient(
    StringSession(SESSION),
    API_ID,
    API_HASH,
)


def headline_from_text(text: str) -> str:
    for line in text.splitlines():
        cleaned = " ".join(line.split()).strip()
        if cleaned:
            return cleaned[:1200]
    return "Telegram flash"


def channel_key(entity: Any) -> str:
    username = getattr(entity, "username", None)
    if isinstance(username, str) and username.strip():
        return username.lstrip("@").lower()
    return str(getattr(entity, "id", "unknown"))


def channel_label(entity: Any) -> str:
    title = getattr(entity, "title", None)
    username = getattr(entity, "username", None)
    if isinstance(title, str) and title.strip():
        return title.strip()[:300]
    if isinstance(username, str) and username.strip():
        return f"@{username.lstrip('@')}"[:300]
    return str(getattr(entity, "id", "unknown"))[:300]


def source_url(entity: Any, message_id: int) -> str | None:
    username = getattr(entity, "username", None)
    if isinstance(username, str) and username.strip():
        return f"https://t.me/{username.lstrip('@')}/{message_id}"
    return None


def post_json_sync(payload: dict[str, Any]) -> dict[str, Any]:
    request = urllib.request.Request(
        INGEST_URL,
        data=json.dumps(payload, ensure_ascii=False).encode("utf-8"),
        headers={
            "Content-Type": "application/json",
            "Accept": "application/json",
            "x-geomacro-flash-token": INGEST_TOKEN,
        },
        method="POST",
    )

    try:
        with urllib.request.urlopen(request, timeout=15) as response:
            body = response.read().decode("utf-8", errors="replace")
            return json.loads(body)
    except urllib.error.HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(
            f"Geomacro flash ingest HTTP {exc.code}: {detail[:1000]}"
        ) from exc


async def submit_flash(message: Any) -> None:
    entity = await message.get_chat()
    text = (message.raw_text or "").strip()

    if not text:
        # Media-only posts can be handled later by a governed vision/media path.
        # Do not invent a textual flash from unseen media.
        return

    chat_id = getattr(entity, "id", None)
    message_id = int(message.id)
    key = channel_key(entity)

    message_date = message.date
    if message_date.tzinfo is None:
        message_date = message_date.replace(tzinfo=timezone.utc)

    payload = {
        "source_id": "telegram_mtproto_flash",
        "source_record_id": f"{chat_id}:{message_id}",
        "published_at": message_date.astimezone(timezone.utc).isoformat(),
        "headline": headline_from_text(text),
        "body": text[:MAX_BODY_CHARS],
        "source_channel": channel_label(entity),
        "source_url": source_url(entity, message_id),
        "source_reliability": SOURCE_RELIABILITY.get(key, 50.0),
        "verification_status": "UNVERIFIED",
        "raw_payload": {
            "telegram_chat_id": chat_id,
            "telegram_message_id": message_id,
            "telegram_username": getattr(entity, "username", None),
            "edit_date": (
                message.edit_date.astimezone(timezone.utc).isoformat()
                if message.edit_date is not None
                else None
            ),
            "has_media": message.media is not None,
        },
    }

    result = await asyncio.to_thread(post_json_sync, payload)

    print(
        json.dumps(
            {
                "ok": result.get("ok"),
                "flash_id": result.get("flash_id"),
                "channel": key,
                "message_id": message_id,
                "countries": result.get("countries", []),
                "scoring_eligible": result.get("scoring_eligible"),
            },
            ensure_ascii=False,
        ),
        flush=True,
    )


async def safe_submit(message: Any) -> None:
    try:
        await submit_flash(message)
    except Exception as exc:  # keep listener alive on one bad message/API call
        print(
            json.dumps(
                {
                    "ok": False,
                    "error": str(exc),
                    "message_id": getattr(message, "id", None),
                },
                ensure_ascii=False,
            ),
            file=sys.stderr,
            flush=True,
        )


async def main() -> None:
    await client.start()

    resolved = []
    for channel in CHANNELS:
        entity = await client.get_entity(channel)
        resolved.append(entity)
        print(
            json.dumps(
                {
                    "listener": "configured",
                    "channel": channel_key(entity),
                    "label": channel_label(entity),
                },
                ensure_ascii=False,
            ),
            flush=True,
        )

    @client.on(events.NewMessage(chats=resolved))
    async def on_new_message(event: Any) -> None:
        await safe_submit(event.message)

    @client.on(events.MessageEdited(chats=resolved))
    async def on_message_edited(event: Any) -> None:
        # Same source_record_id makes edits idempotent updates rather than duplicates.
        await safe_submit(event.message)

    print(
        json.dumps(
            {
                "listener": "ready",
                "channels": len(resolved),
            }
        ),
        flush=True,
    )

    await client.run_until_disconnected()


if __name__ == "__main__":
    asyncio.run(main())
