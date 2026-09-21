import asyncio
import os
import urllib.parse
import urllib.request
import json
from datetime import datetime, timezone
from typing import Any

from telethon import TelegramClient, functions, types
from telethon.sessions import StringSession

PROJECT_REF = "ldpwajisioljyjtojvfx"
CANONICAL_COUNTRY_TARGET_COUNT = 195
CATEGORY_DOMAINS = {
    "GEOPOLITICS": ["GEOPOLITICS"],
    "MACRO": ["MACRO", "GEOPOLITICS"],
    "CRITICAL_MINERALS": ["CRITICAL_MINERALS"],
}


def env(name: str) -> str:
    value = os.environ.get(name, "").strip()
    if not value:
        raise RuntimeError(f"Missing required environment variable: {name}")
    return value


def supabase_request(method: str, path: str, body: Any | None = None) -> Any:
    base = env("APP_SUPABASE_URL").rstrip("/")
    key = env("APP_SUPABASE_SERVICE_ROLE_KEY")
    url = f"{base}/rest/v1/{path.lstrip('/')}"
    headers = {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Prefer": "resolution=ignore-duplicates,return=minimal",
    }
    payload = None
    if body is not None:
        payload = json.dumps(body, ensure_ascii=False).encode("utf-8")
    request = urllib.request.Request(url, data=payload, headers=headers, method=method)
    with urllib.request.urlopen(request, timeout=30) as response:
        raw = response.read().decode("utf-8")
        return json.loads(raw) if raw.strip() else None


def fetch_targets() -> list[dict[str, str]]:
    query = (
        "live_raw_source_targets"
        "?select=target_id,country_iso3,category,telegram_query"
        "&enabled=eq.true"
        "&transport=eq.TELEGRAM_DISCOVERY"
        "&order=country_iso3.asc"
    )
    rows = supabase_request("GET", query)
    return rows if isinstance(rows, list) else []


def encode_channel(row: dict[str, Any]) -> dict[str, Any]:
    return {
        "channel_key": str(row["username"]).lstrip("@").lower(),
        "display_name": str(row.get("title") or row["username"]).strip()[:300],
        "official_status": "UNVERIFIED_OWNERSHIP",
        "rights_status": "INTERNAL_RESEARCH_ONLY",
        "source_reliability": 30,
        "domains": CATEGORY_DOMAINS[str(row["category"])],
        "enabled": False,
        "manual_review_status": "PENDING",
        "discovery_country_iso3": row["country_iso3"],
        "discovery_category": row["category"],
        "discovered_at": datetime.now(timezone.utc).isoformat(),
        "discovery_method": "telegram_public_channel_search_v1",
        "notes": (
            "Automatically discovered from a country/category raw-source target. "
            "Candidate only: manual review is required before the channel can be used "
            "by the live Telegram flash worker."
        ),
    }


async def main() -> None:
    api_id = int(env("TELEGRAM_API_ID"))
    api_hash = env("TELEGRAM_API_HASH")
    session = env("TELEGRAM_SESSION")
    client = TelegramClient(StringSession(session), api_id, api_hash)
    await client.start()

    targets = fetch_targets()
    seen: set[tuple[str, str]] = set()
    candidates: list[dict[str, Any]] = []

    for target in targets:
        query = str(target.get("telegram_query") or "").strip()
        if not query:
            continue
        try:
            result = await client(functions.contacts.SearchRequest(q=query[:255], limit=20))
        except Exception as exc:
            print(json.dumps({
                "ok": False,
                "country_iso3": target["country_iso3"],
                "category": target["category"],
                "error": str(exc)[:500],
            }), flush=True)
            continue

        for entity in getattr(result, "chats", []):
            if not isinstance(entity, types.Channel):
                continue
            username = getattr(entity, "username", None)
            if not isinstance(username, str) or not username.strip():
                continue
            key = (username.lower(), str(target["category"]))
            if key in seen:
                continue
            seen.add(key)
            candidates.append(encode_channel({
                "username": username,
                "title": getattr(entity, "title", None),
                "country_iso3": target["country_iso3"],
                "category": target["category"],
            }))

    if candidates:
        supabase_request(
            "POST",
            "live_telegram_channel_registry?on_conflict=channel_key",
            candidates,
        )

    print(json.dumps({
        "ok": True,
        "targets_processed": len(targets),
        "candidates_discovered": len(candidates),
        "manual_review_required": True,
        "auto_enable": False,
        "project_ref": PROJECT_REF,
    }, ensure_ascii=False), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
