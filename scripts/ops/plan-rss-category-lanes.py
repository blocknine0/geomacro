#!/usr/bin/env python3
"""Automatically partition existing first-party/eligible RSS discovery feeds.

Reads the existing Python worker's literal DEFAULT_RSS_FEEDS registry. Nothing
is scraped from Telegram, no credentials are needed, and no event is invented.
An unknown domain, duplicate source ID, or empty category fails closed.
"""
from __future__ import annotations

import argparse
import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
WORKER = ROOT / "workers" / "telegram-flash" / "worker.py"
DOMAINS = ("GEOPOLITICS", "MACRO", "CRITICAL_MINERALS")
SOURCE_ID = re.compile(r"^[a-z][a-z0-9_]{2,100}$")


def load_registry(path: Path = WORKER) -> list[dict]:
    module = ast.parse(path.read_text(encoding="utf-8"), filename=str(path))
    assignments = [
        node.value
        for node in module.body
        if isinstance(node, (ast.Assign, ast.AnnAssign))
        and any(
            isinstance(target, ast.Name) and target.id == "DEFAULT_RSS_FEEDS"
            for target in (
                node.targets if isinstance(node, ast.Assign) else [node.target]
            )
        )
    ]
    if len(assignments) != 1:
        raise ValueError("RSS_CANONICAL_FEED_REGISTRY_MISSING_OR_AMBIGUOUS")
    try:
        feeds = ast.literal_eval(assignments[0])
    except (ValueError, TypeError, SyntaxError, RecursionError) as exc:
        raise ValueError("RSS_CANONICAL_FEED_REGISTRY_NOT_LITERAL") from exc
    if not isinstance(feeds, list) or not feeds:
        raise ValueError("RSS_CANONICAL_FEED_REGISTRY_EMPTY")
    return feeds


def partition(feeds: list[dict]) -> dict[str, list[str]]:
    lanes: dict[str, list[str]] = {key: [] for key in DOMAINS}
    seen: set[str] = set()
    for row in feeds:
        if not isinstance(row, dict):
            raise ValueError("RSS_FEED_CONFIG_INVALID")
        source_id, event_type = row.get("source_id"), row.get("event_type")
        url = row.get("url")
        if (
            not isinstance(source_id, str)
            or not SOURCE_ID.fullmatch(source_id)
            or source_id in seen
            or not isinstance(event_type, str)
            or not isinstance(url, str)
            or not url.startswith("https://")
        ):
            raise ValueError("RSS_FEED_IDENTITY_OR_URL_INVALID")
        matches = [
            domain
            for domain in DOMAINS
            if event_type.startswith(domain + "_")
        ]
        if len(matches) != 1:
            raise ValueError("RSS_FEED_CATEGORY_UNMAPPED")
        seen.add(source_id)
        lanes[matches[0]].append(source_id)
    if any(not ids for ids in lanes.values()):
        raise ValueError("RSS_PRIVATE_CATEGORY_UNCOVERED")
    if sum(len(ids) for ids in lanes.values()) != len(feeds):
        raise ValueError("RSS_PRIVATE_PARTITION_INCOMPLETE")
    return lanes


def main() -> int:
    parser = argparse.ArgumentParser()
    parser.add_argument("--category", choices=DOMAINS, required=True)
    parser.add_argument("--github-env", type=Path, required=True)
    args = parser.parse_args()

    lanes = partition(load_registry())
    selected = lanes[args.category]
    if not args.github_env.is_file():
        raise ValueError("GITHUB_ENV_FILE_MISSING")
    with args.github_env.open("a", encoding="utf-8") as handle:
        handle.write("BREAKING_RSS_SOURCE_IDS=" + ",".join(selected) + "\n")
        handle.write("RSS_PRIVATE_LANE=" + args.category + "\n")

    print(json.dumps({
        "schema": "geomacro.rss-private-three-lane-plan.v1",
        "lane": args.category,
        "source_count": len(selected),
        "all_configured_sources": sum(map(len, lanes.values())),
        "per_domain_source_counts": {name: len(ids) for name, ids in lanes.items()},
        "fully_partitioned": True,
        "telegram_external_channels_activated": 0,
        "source_publication_or_d1_storage_not_yet_proven": True,
    }, sort_keys=True))
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
