import asyncio
import json
import os
import re
import time
from dataclasses import dataclass
from typing import Any

from telethon import TelegramClient, functions, types
from telethon.sessions import StringSession
from urllib.request import Request, urlopen
from urllib.error import HTTPError

SUPABASE_URL = os.environ["SUPABASE_URL"].rstrip("/")
SUPABASE_SERVICE_ROLE_KEY = os.environ["SUPABASE_SERVICE_ROLE_KEY"]
API_ID = int(os.environ["TELEGRAM_API_ID"])
API_HASH = os.environ["TELEGRAM_API_HASH"]
SESSION = os.environ["TELEGRAM_SESSION"]

MAX_COUNTRIES_PER_RUN = max(1, min(194, int(os.environ.get("TELEGRAM_DISCOVERY_COUNTRIES_PER_RUN", "194"))))
SEARCH_LIMIT = max(10, min(100, int(os.environ.get("TELEGRAM_DISCOVERY_SEARCH_LIMIT", "50"))))
MAX_CANDIDATES_PER_COUNTRY = max(1, min(10, int(os.environ.get("TELEGRAM_DISCOVERY_MAX_CANDIDATES_PER_COUNTRY", "4"))))
MIN_SCORE = max(1, min(100, int(os.environ.get("TELEGRAM_DISCOVERY_MIN_SCORE", "55"))))
SLEEP_SECONDS = max(0.5, float(os.environ.get("TELEGRAM_DISCOVERY_SLEEP_SECONDS", "1.5")))

STOPWORDS = {
    "the", "and", "for", "news", "latest", "today", "official", "channel",
    "world", "live", "updates", "breaking", "telegram", "daily"
}

ROLE_HINTS = {
    "official_authority": (
        "government", "gov", "ministry", "president", "presidency", "prime minister",
        "parliament", "embassy", "foreign affairs", "interior", "defence", "defense",
        "central bank", "police", "army", "national security"
    ),
    "local_news": ("news", "newspaper", "journal", "times", "post", "daily", "media"),
    "regional_news": ("africa", "asia", "europe", "middle east", "regional"),
    "sector_signal": ("oil", "energy", "mining", "minerals", "metals", "finance", "markets", "macro"),
    "independent_osint": ("osint", "intel", "intelligence", "conflict", "war", "security")
}

DOMAIN_HINTS = {
    "GEOPOLITICS": ("war", "conflict", "military", "defence", "defense", "security", "politics", "president", "sanctions"),
    "MACRO": ("economy", "economic", "finance", "markets", "central bank", "inflation", "rates", "currency", "trade"),
    "CRITICAL_MINERALS": ("mining", "minerals", "metals", "lithium", "cobalt", "nickel", "copper", "rare earth", "uranium", "oil", "gas")
}


@dataclass
class Country:
    iso3: str
    name: str
    aliases: list[str]


def normalize(value: str) -> str:
    return " ".join(value.lower().split())


def tokens(value: str) -> set[str]:
    return {
        token for token in re.findall(r"[a-z0-9]+", normalize(value))
        if len(token) > 2 and token not in STOPWORDS
    }


def score_candidate(country: Country, chat: Any, message_text: str) -> int:
    title = str(getattr(chat, "title", "") or "")
    username = str(getattr(chat, "username", "") or "")
    about = str(getattr(chat, "about", "") or "")
    haystack = normalize(" ".join([title, username, about, message_text]))
    country_terms = [country.name, *country.aliases]
    score = 0

    for term in country_terms:
        term_norm = normalize(term)
        if term_norm and term_norm in haystack:
            score += 30 if term_norm == normalize(country.name) else 20

    if getattr(chat, "broadcast", False):
        score += 10
    if getattr(chat, "verified", False):
        score += 10
    if getattr(chat, "scam", False) or getattr(chat, "fake", False):
        score -= 60

    title_tokens = tokens(title)
    if title_tokens:
        score += min(15, len(title_tokens & tokens(country.name)) * 15)

    return max(0, min(100, score))


def infer_role(chat: Any, message_text: str) -> str:
    haystack = normalize(" ".join([
        str(getattr(chat, "title", "") or ""),
        str(getattr(chat, "about", "") or ""),
        message_text,
    ]))
    for role, hints in ROLE_HINTS.items():
        if any(hint in haystack for hint in hints):
            return role
    return "publisher"


def infer_domains(chat: Any, message_text: str) -> list[str]:
    haystack = normalize(" ".join([
        str(getattr(chat, "title", "") or ""),
        str(getattr(chat, "about", "") or ""),
        message_text,
    ]))
    domains = [domain for domain, hints in DOMAIN_HINTS.items() if any(hint in haystack for hint in hints)]
    return domains or ["GEOPOLITICS"]


def public_channel(chat: Any) -> bool:
    username = str(getattr(chat, "username", "") or "").strip()
    return bool(
        username
        and getattr(chat, "broadcast", False)
        and not getattr(chat, "scam", False)
        and not getattr(chat, "fake", False)
    )


def upsert_candidate(row: dict[str, Any]) -> None:
    channel_key = row["channel_key"]
    url = f"{SUPABASE_URL}/rest/v1/live_telegram_channel_registry?on_conflict=channel_key"
    payload = json.dumps(row).encode("utf-8")
    request = Request(
        url,
        data=payload,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Content-Type": "application/json",
            "Prefer": "resolution=merge-duplicates,return=minimal",
        },
        method="POST",
    )
    try:
        with urlopen(request, timeout=20) as response:
            response.read()
    except HTTPError as exc:
        detail = exc.read().decode("utf-8", errors="replace")
        raise RuntimeError(f"Supabase discovery upsert failed HTTP {exc.code}: {detail[:500]}") from exc


def load_countries() -> list[Country]:
    url = (
        f"{SUPABASE_URL}/rest/v1/live_country_registry"
        "?select=iso3,country_name,aliases&enabled=eq.true&order=iso3.asc"
    )
    request = Request(
        url,
        headers={
            "apikey": SUPABASE_SERVICE_ROLE_KEY,
            "Authorization": f"Bearer {SUPABASE_SERVICE_ROLE_KEY}",
            "Accept": "application/json",
        },
        method="GET",
    )
    with urlopen(request, timeout=20) as response:
        rows = json.loads(response.read().decode("utf-8"))
    if not isinstance(rows, list):
        raise RuntimeError("Country registry returned a non-list payload")
    return [
        Country(
            iso3=str(row["iso3"]).upper(),
            name=str(row["country_name"]),
            aliases=[str(value) for value in (row.get("aliases") or []) if str(value).strip()],
        )
        for row in rows
        if isinstance(row, dict) and row.get("iso3") and row.get("country_name")
    ]


async def search_country(client: TelegramClient, country: Country) -> list[dict[str, Any]]:
    queries = [country.name]
    for alias in country.aliases[:2]:
        if alias and alias not in queries:
            queries.append(alias)

    found: dict[str, dict[str, Any]] = {}
    for query in queries:
        result = await client(functions.messages.SearchGlobalRequest(
            broadcasts_only=True,
            groups_only=False,
            users_only=False,
            q=query,
            filter=types.InputMessagesFilterEmpty(),
            min_date=0,
            max_date=0,
            offset_rate=0,
            offset_peer=types.InputPeerEmpty(),
            offset_id=0,
            limit=SEARCH_LIMIT,
        ))

        chats = {int(getattr(chat, "id", 0)): chat for chat in getattr(result, "chats", [])}
        for message in getattr(result, "messages", []):
            peer_id = getattr(getattr(message, "peer_id", None), "channel_id", None)
            chat = chats.get(int(peer_id)) if peer_id is not None else None
            if chat is None or not public_channel(chat):
                continue

            username = str(getattr(chat, "username", "")).lower().strip()
            if not username:
                continue

            message_text = str(getattr(message, "message", "") or "")
            score = score_candidate(country, chat, message_text)
            if score < MIN_SCORE:
                continue

            current = found.get(username)
            if current is None or score > current["score"]:
                found[username] = {
                    "chat": chat,
                    "score": score,
                    "message_text": message_text[:1000],
                }

        await asyncio.sleep(SLEEP_SECONDS)

    return sorted(found.values(), key=lambda item: item["score"], reverse=True)[:MAX_CANDIDATES_PER_COUNTRY]


async def main() -> None:
    countries = load_countries()[:MAX_COUNTRIES_PER_RUN]
    client = TelegramClient(StringSession(SESSION), API_ID, API_HASH)
    await client.start()

    discovered = 0
    countries_with_candidates = 0

    try:
        for country in countries:
            candidates = await search_country(client, country)
            if candidates:
                countries_with_candidates += 1

            for candidate in candidates:
                chat = candidate["chat"]
                username = str(getattr(chat, "username", "")).strip().lower()
                if not username:
                    continue

                role = infer_role(chat, candidate["message_text"])
                domains = infer_domains(chat, candidate["message_text"])

                # Discovery never marks ownership as official and never grants
                # commercial rights. It only admits a public source to the
                # internal lead layer; every message remains UNVERIFIED.
                row = {
                    "channel_key": username,
                    "display_name": str(getattr(chat, "title", "") or username)[:300],
                    "official_status": "UNVERIFIED_OWNERSHIP",
                    "rights_status": "INTERNAL_RESEARCH_ONLY",
                    "source_reliability": float(min(75, max(50, candidate["score"]))),
                    "domains": domains,
                    "enabled": True,
                    "notes": (
                        f"Automated public-channel discovery for {country.iso3}; "
                        f"candidate_score={candidate['score']}; no ownership or "
                        "commercial-rights claim. Independent corroboration required."
                    ),
                    "auto_admission_status": "ACTIVE",
                    "source_role": role,
                    "country_iso3": country.iso3,
                    "language": None,
                    "telegram_public_channel_key": username,
                    "telegram_public_source_url": f"https://t.me/{username}",
                    "last_health_at": None,
                    "consecutive_failures": 0,
                }
                upsert_candidate(row)
                discovered += 1

            print(json.dumps({
                "country": country.iso3,
                "candidates": len(candidates),
                "discovered_total": discovered,
            }), flush=True)

    finally:
        await client.disconnect()

    print(json.dumps({
        "countries_scanned": len(countries),
        "countries_with_candidates": countries_with_candidates,
        "channels_upserted": discovered,
        "finished_at": int(time.time()),
    }), flush=True)


if __name__ == "__main__":
    asyncio.run(main())
