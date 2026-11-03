#!/usr/bin/env python3
"""Offline RSS source configuration census against the canonical 195 countries.

This is NOT a live coverage certificate: only D1 readback of authentic, dated,
country-attributed originals can establish active country-category coverage.
"""
from __future__ import annotations
import ast
import json
import re
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COUNTRY_FILE = ROOT / "src/lib/canonical-country-registry-195.ts"
WORKER = ROOT / "workers/telegram-flash/worker.py"
OGL = ROOT / "config/official-ogl-atom-sources.json"
CATEGORIES = ("GEOPOLITICS", "MACRO", "CRITICAL_MINERALS")

def canonical_countries() -> list[str]:
    data = COUNTRY_FILE.read_text(encoding="utf-8")
    match = re.search(r"const COUNTRY_ROWS=`(.*?)`;", data, flags=re.DOTALL)
    if match is None:
        raise ValueError("CANONICAL_COUNTRY_ROWS_MISSING")
    records = [row.split("|") for row in match.group(1).splitlines()]
    if len(records) != 195 or any(len(row) != 3 for row in records):
        raise ValueError("CANONICAL_COUNTRY_ROWS_INVALID")
    iso3 = [row[0] for row in records]
    if len(set(iso3)) != 195 or not {"PSE", "VAT"}.issubset(iso3):
        raise ValueError("CANONICAL_COUNTRY_IDS_INVALID")
    return sorted(iso3)

def rss_feeds() -> list[dict]:
    tree = ast.parse(WORKER.read_text(encoding="utf-8"))
    nodes = [n.value for n in tree.body if isinstance(n, ast.AnnAssign)
             and isinstance(n.target, ast.Name) and n.target.id == "DEFAULT_RSS_FEEDS"]
    if len(nodes) != 1:
        raise ValueError("RSS_FEED_REGISTRY_AMBIGUOUS")
    feeds = ast.literal_eval(nodes[0])
    ids = [r["source_id"] for r in feeds]
    if len(ids) != len(set(ids)):
        raise ValueError("RSS_SOURCE_IDS_DUPLICATED")
    return feeds

def census() -> dict:
    countries = canonical_countries()
    feeds = rss_feeds()
    ogl = json.loads(OGL.read_text(encoding="utf-8"))
    proven_ogl_ids = {row["source_id"] for row in ogl["sources"]}
    by_category = {}
    for cat in CATEGORIES:
        by_category[cat] = [r for r in feeds if r["event_type"].startswith(cat + "_")]
        if not by_category[cat]:
            raise ValueError("SOURCE_CATEGORY_HAS_NO_RSS_FEEDS")
    if sum(len(by_category[cat]) for cat in CATEGORIES) != len(feeds):
        raise ValueError("SOURCE_CATEGORY_UNMAPPED")
    unknown_ogl = proven_ogl_ids - {r["source_id"] for r in feeds}
    if unknown_ogl:
        raise ValueError("OGL_SOURCE_NOT_CONFIGURED")
    # Source publisher's jurisdiction is not the jurisdiction of every event.
    publisher_country_ids = set()
    for row in feeds:
        if isinstance(row.get("country_iso3"), str):
            publisher_country_ids.add(row["country_iso3"])
    publisher_country_ids.add("GBR")  # OGL registry attributes its nine UK government issuers.
    if not publisher_country_ids.issubset(set(countries)):
        raise ValueError("SOURCE_PUBLISHER_UNKNOWN_COUNTRY")
    return {
        "schema": "geomacro.rss-195-country-source-census.v1",
        "canonical_country_count": len(countries),
        "country_category_cells": len(countries) * len(CATEGORIES),
        "categories": {cat: {"configured_rss_sources": len(by_category[cat]),
                             "licensed_uk_ogl_feeds": sum(r["source_id"] in proven_ogl_ids for r in by_category[cat])}
                       for cat in CATEGORIES},
        "configured_rss_total": len(feeds),
        "uk_ogl_provenance_rows": len(proven_ogl_ids),
        "country_scoped_source_ids": sorted(r["source_id"] for r in feeds if r.get("country_iso3")),
        "source_publisher_countries_pinned": sorted(publisher_country_ids),
        "country_category_live_d1_verified": None,
        "country_category_live_verified_count": None,
        "country_category_unverified_count": None,
        "claim_195_country_continuous_news_coverage": False,
        "reason": "Configuration does not prove per-country fresh originals, publication time, D1/B2 parity, or legal rights",
    }

if __name__ == "__main__":
    print(json.dumps(census(), sort_keys=True))
