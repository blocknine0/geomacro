#!/usr/bin/env python3
"""Read-only production D1 195 x 3 ORIGINAL coverage audit. Does not verify events or rights."""
from __future__ import annotations
import argparse
import json
import re
from datetime import datetime, timezone, timedelta
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
COUNTRY_ROWS = ROOT / "src/lib/canonical-country-registry-195.ts"
DOMAINS = {"geopolitics": 30, "macro": 120, "rare_earth": 240}

def country_registry():
    text = COUNTRY_ROWS.read_text(encoding="utf-8")
    match = re.search(r"const COUNTRY_ROWS=`(.*?)`;", text, re.DOTALL)
    if not match: raise ValueError("COUNTRY_REGISTRY_MISSING")
    entries = [r.split("|") for r in match.group(1).splitlines()]
    iso3 = [r[0] for r in entries]
    if len(iso3) != 195 or len(set(iso3)) != 195 or any(len(r)!=3 for r in entries):
        raise ValueError("COUNTRY_REGISTRY_CORRUPT")
    return sorted(iso3)

def parse_result(data):
    if isinstance(data, list) and len(data)==1 and isinstance(data[0], dict):
        data=data[0]
    if not isinstance(data, dict) or not isinstance(data.get("results"), list):
        raise ValueError("D1_COUNT_ONLY_RESULT_INVALID")
    if data.get("success") is False:
        raise ValueError("D1_QUERY_FAILED")
    return data["results"]

def audit(rows, now):
    if not isinstance(now, datetime) or now.tzinfo is None:
        raise ValueError("AUDIT_CLOCK_INVALID")
    codes=country_registry()
    cells={(country, category): None for country in codes for category in DOMAINS}
    cutoff=now-timedelta(hours=72)
    count=0
    for row in rows:
        if not isinstance(row, dict): raise ValueError("D1_COUNT_ROW_INVALID")
        iso3, category = row.get("risk_country_iso3"), row.get("category")
        key=(iso3,category)
        if key not in cells or cells[key] is not None:
            raise ValueError("D1_COUNTRY_CATEGORY_OR_DUPLICATE_INVALID")
        n=row.get("original_count")
        stamp=row.get("last_published_at")
        if not isinstance(n, int) or isinstance(n, bool) or n<1 or not isinstance(stamp,str):
            raise ValueError("D1_COUNT_OR_NATIVE_CLOCK_INVALID")
        try:
            dt=datetime.fromisoformat(stamp.replace("Z","+00:00"))
            if len(stamp)==10: dt=datetime.strptime(stamp,"%Y-%m-%d").replace(tzinfo=timezone.utc)
        except (TypeError,ValueError):
            raise ValueError("D1_NATIVE_CLOCK_INVALID")
        if dt.tzinfo is None or dt>now+timedelta(minutes=1) or dt<cutoff-timedelta(days=1):
            raise ValueError("D1_NATIVE_CLOCK_OUTSIDE_BOUND")
        cells[key]=(n,stamp,dt)
        count+=n
    summary={}
    for category, threshold in DOMAINS.items():
        present=[country for country in codes if cells[(country,category)] is not None]
        fresh=[country for country in present if "T" in cells[(country,category)][1] and
               now-cells[(country,category)][2]<=timedelta(minutes=threshold) and
               cells[(country,category)][2]<=now]
        summary[category]={
            "country_cells_with_native_dated_originals_72h":len(present),
            "country_cells_with_recent_exact_original_clocks":len(fresh),
            "recent_clock_window_minutes":threshold,
            "countries_without_72h_originals":sorted(set(codes)-set(present)),
            "observed_originals_72h":sum(cells[(country,category)][0] for country in present),
        }
    observed=sum(x["country_cells_with_native_dated_originals_72h"] for x in summary.values())
    fresh=sum(x["country_cells_with_recent_exact_original_clocks"] for x in summary.values())
    return {
        "schema":"geomacro.production-d1-country-category-original-census.v1",
        "audited_at":now.isoformat(),
        "canonical_country_count":len(codes),
        "country_category_total":len(cells),
        "native_dated_original_observed_cells_72h":observed,
        "country_category_unobserved_cells_72h":len(cells)-observed,
        "recent_exact_source_clock_cells":fresh,
        "total_observed_private_originals_72h":count,
        "by_category":summary,
        "d1_raw_sha_authenticated_on_ingest_not_independent_event_verification":True,
        "independently_verified_event_cell_count":None,
        "commercial_rights_verified_cell_count":None,
        "global_585_live_verified":False,
        "no_artificial_coverage_propagation":True,
        "observation_not_equivalent_to_independent_source_verification":True,
    }

def self_test():
    now=datetime(2026,11,4,0,0,tzinfo=timezone.utc)
    rows=[{"risk_country_iso3":"IND","category":"macro","original_count":2,
           "last_published_at":"2026-11-03T23:30:00Z"},
          {"risk_country_iso3":"CAN","category":"rare_earth","original_count":1,
           "last_published_at":"2026-11-03"}]
    out=audit(rows,now)
    assert out["country_category_total"]==585
    assert out["native_dated_original_observed_cells_72h"]==2
    assert out["recent_exact_source_clock_cells"]==1
    assert out["country_category_unobserved_cells_72h"]==583
    assert out["independently_verified_event_cell_count"] is None
    assert out["global_585_live_verified"] is False
    for invalid in (rows+[rows[0]],
        [{"risk_country_iso3":"ZZZ","category":"macro","original_count":1,
          "last_published_at":"2026-11-03T23:30:00Z"}]):
        try: audit(invalid,now)
        except ValueError: pass
        else: raise AssertionError("INVALID_COUNTRY_OR_DUPLICATE_ACCEPTED")

def main():
    parser=argparse.ArgumentParser()
    parser.add_argument("--result-json", type=Path)
    parser.add_argument("--self-test", action="store_true")
    args=parser.parse_args()
    if args.self_test:
        self_test()
        print("COUNTRY_585_AUDIT_CONTRACT_PASS")
        return
    if not args.result_json:
        parser.error("--result-json required unless --self-test")
    rows=parse_result(json.loads(args.result_json.read_text(encoding="utf-8")))
    print(json.dumps(audit(rows,datetime.now(timezone.utc)),sort_keys=True))

if __name__=="__main__": main()
