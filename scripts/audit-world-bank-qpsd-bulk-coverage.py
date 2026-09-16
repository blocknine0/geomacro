#!/usr/bin/env python3
"""Read-only World Bank QPSD bulk coverage proof.

The Indicators API endpoint for QPSD source 3009 can return a non-tabular
response even while DataBank is serving current observations. The World Bank
Data Catalog publishes an official bulk CSV archive for QPSD, so this audit
uses that first-party bulk contract instead of scraping DataBank HTML.

No production writes, scoring changes, source promotion, freshness relaxation,
or payability changes are performed here.
"""

from __future__ import annotations

import csv
import hashlib
import io
import json
import os
import re
import sys
import tempfile
import urllib.request
import zipfile
from collections import Counter
from datetime import datetime, timezone
from pathlib import Path

BULK_URL = "https://databankfiles.worldbank.org/public/ddpext_download/QPSD_CSV.zip"
COUNTRY_URL = "https://api.worldbank.org/v2/country?format=json&per_page=500"
OUTPUT = os.getenv(
    "WORLD_BANK_QPSD_COVERAGE_OUTPUT",
    "world-bank-qpsd-sovereign-fiscal-coverage.json",
)
MAX_AGE_DAYS = float(os.getenv("WORLD_BANK_QPSD_MAX_AGE_DAYS", "550"))
AS_OF_RAW = os.getenv("WORLD_BANK_QPSD_AS_OF")
AS_OF = (
    datetime.fromisoformat(AS_OF_RAW.replace("Z", "+00:00"))
    if AS_OF_RAW
    else datetime.now(timezone.utc)
)
if AS_OF.tzinfo is None:
    AS_OF = AS_OF.replace(tzinfo=timezone.utc)
else:
    AS_OF = AS_OF.astimezone(timezone.utc)

SERIES = {
    "DP.DOD.DECT.CR.GG.Z1": {
        "concept": "GENERAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
        "expected_label": "Gross PSD, General Gov., All maturities, All instruments, Nominal Value, % of GDP",
        "production_role": "PREFERRED_SOURCE_SPECIFIC_GENERAL_GOVERNMENT_FISCAL_CANDIDATE",
    },
    "DP.DOD.DECT.CR.CG.Z1": {
        "concept": "CENTRAL_GOVERNMENT_GROSS_DEBT_PCT_GDP",
        "expected_label": "Gross PSD, Central Gov., All maturities, All instruments, Nominal Value, % of GDP",
        "production_role": "SOURCE_SPECIFIC_CENTRAL_GOVERNMENT_COMPARATOR",
    },
}

TIME_RE = re.compile(r"^(\d{4})Q([1-4])(?:\s*\[.*\])?$", re.I)


def sha256(data: bytes) -> str:
    return hashlib.sha256(data).hexdigest()


def fetch_bytes(url: str) -> bytes:
    request = urllib.request.Request(
        url,
        headers={
            "Accept": "*/*",
            "User-Agent": "Geomacro-QPSD-Bulk-Coverage-Audit/1.0 (+https://geomacro.live)",
        },
    )
    with urllib.request.urlopen(request, timeout=90) as response:
        return response.read()


def fetch_json(url: str):
    return json.loads(fetch_bytes(url).decode("utf-8-sig"))


def normalized_header(value: str) -> str:
    return re.sub(r"[^a-z0-9]+", " ", value.strip().lower()).strip()


def parse_number(value: str):
    raw = (value or "").strip()
    if raw in {"", "..", "...", "NA", "N/A", "null", "None"}:
        return None
    raw = raw.replace(",", "")
    try:
        number = float(raw)
    except ValueError:
        return None
    if not (number == number and abs(number) != float("inf")):
        return None
    return number


def quarter_end(period: str):
    match = TIME_RE.match((period or "").strip())
    if not match:
        return None
    year = int(match.group(1))
    quarter = int(match.group(2))
    month = quarter * 3
    # First day of the next quarter minus one second is unnecessary for age;
    # use the final calendar day at 23:59:59 UTC deterministically.
    if month == 12:
        next_month = datetime(year + 1, 1, 1, tzinfo=timezone.utc)
    else:
        next_month = datetime(year, month + 1, 1, tzinfo=timezone.utc)
    from datetime import timedelta
    return next_month - timedelta(seconds=1)


def read_csv_bytes(data: bytes):
    for encoding in ("utf-8-sig", "utf-8", "cp1252", "latin-1"):
        try:
            text = data.decode(encoding)
            return list(csv.reader(io.StringIO(text)))
        except UnicodeDecodeError:
            continue
    raise RuntimeError("Unable to decode QPSD CSV member")


def find_header(rows):
    country_candidates = {"country code", "countrycode", "economy code", "economycode"}
    series_candidates = {"series code", "seriescode", "indicator code", "indicatorcode"}
    for idx, row in enumerate(rows[:20]):
        headers = [normalized_header(cell) for cell in row]
        if any(h in country_candidates for h in headers) and any(h in series_candidates for h in headers):
            return idx, headers
    return None, None


def get_index(headers, candidates):
    for candidate in candidates:
        if candidate in headers:
            return headers.index(candidate)
    return None


def extract_observations(zip_bytes: bytes):
    observations = {series_id: [] for series_id in SERIES}
    labels = {series_id: set() for series_id in SERIES}
    parsed_members = []

    with zipfile.ZipFile(io.BytesIO(zip_bytes)) as archive:
        member_names = archive.namelist()
        csv_members = [name for name in member_names if name.lower().endswith(".csv")]
        if not csv_members:
            raise RuntimeError("Official QPSD bulk archive contained no CSV files")

        for name in csv_members:
            rows = read_csv_bytes(archive.read(name))
            header_idx, headers = find_header(rows)
            if header_idx is None:
                continue

            country_idx = get_index(headers, ["country code", "countrycode", "economy code", "economycode"])
            series_idx = get_index(headers, ["series code", "seriescode", "indicator code", "indicatorcode"])
            label_idx = get_index(headers, ["series name", "seriesname", "indicator name", "indicatorname"])
            time_idx = get_index(headers, ["time", "time period", "timeperiod", "date", "period"])
            value_idx = get_index(headers, ["value", "obs value", "obsvalue", "observation value", "observationvalue"])
            if country_idx is None or series_idx is None:
                continue

            wide_time_columns = []
            for col_idx, raw_header in enumerate(rows[header_idx]):
                period = str(raw_header).strip()
                if TIME_RE.match(period):
                    wide_time_columns.append((col_idx, period))

            member_hits = 0
            for row in rows[header_idx + 1 :]:
                if max(country_idx, series_idx) >= len(row):
                    continue
                series_id = str(row[series_idx]).strip()
                if series_id not in SERIES:
                    continue
                iso3 = str(row[country_idx]).strip().upper()
                if not re.fullmatch(r"[A-Z]{3}", iso3):
                    continue
                if label_idx is not None and label_idx < len(row):
                    label = str(row[label_idx]).strip()
                    if label:
                        labels[series_id].add(label)

                if wide_time_columns:
                    for col_idx, period in wide_time_columns:
                        if col_idx >= len(row):
                            continue
                        value = parse_number(row[col_idx])
                        observed_at = quarter_end(period)
                        if value is None or observed_at is None:
                            continue
                        observations[series_id].append(
                            {"iso3": iso3, "period": period.split()[0], "observed_at": observed_at, "value": value}
                        )
                        member_hits += 1
                elif time_idx is not None and value_idx is not None and max(time_idx, value_idx) < len(row):
                    period = str(row[time_idx]).strip()
                    value = parse_number(row[value_idx])
                    observed_at = quarter_end(period)
                    if value is None or observed_at is None:
                        continue
                    observations[series_id].append(
                        {"iso3": iso3, "period": period, "observed_at": observed_at, "value": value}
                    )
                    member_hits += 1

            if member_hits:
                parsed_members.append({"member": name, "target_observation_count": member_hits})

        return observations, labels, parsed_members, member_names


def world_bank_non_aggregate_countries():
    payload = fetch_json(COUNTRY_URL)
    if not isinstance(payload, list) or len(payload) < 2 or not isinstance(payload[1], list):
        raise RuntimeError("World Bank country metadata response shape was invalid")
    countries = {}
    for row in payload[1]:
        iso3 = str(row.get("id") or "").strip().upper()
        region = row.get("region") or {}
        region_id = str(region.get("id") or "").strip()
        if re.fullmatch(r"[A-Z]{3}", iso3) and region_id and region_id != "NA":
            countries[iso3] = str(row.get("name") or iso3)
    return countries


def latest_fresh(observations, country_set):
    latest = {}
    for row in observations:
        if row["iso3"] not in country_set:
            continue
        observed_at = row["observed_at"]
        if observed_at > AS_OF:
            continue
        current = latest.get(row["iso3"])
        if current is None or observed_at > current["observed_at"]:
            latest[row["iso3"]] = row

    fresh = {}
    for iso3, row in latest.items():
        age_days = max(0.0, (AS_OF - row["observed_at"]).total_seconds() / 86400.0)
        if age_days <= MAX_AGE_DAYS:
            fresh[iso3] = {**row, "age_days": age_days}
    return latest, fresh


def serialize_row(row):
    return {
        "iso3": row["iso3"],
        "period": row["period"],
        "observed_at": row["observed_at"].isoformat().replace("+00:00", "Z"),
        "value": row["value"],
        **({"age_days": row["age_days"]} if "age_days" in row else {}),
    }


def main():
    if MAX_AGE_DAYS <= 0:
        raise RuntimeError("WORLD_BANK_QPSD_MAX_AGE_DAYS must be positive")

    zip_bytes = fetch_bytes(BULK_URL)
    observations, labels, parsed_members, member_names = extract_observations(zip_bytes)
    countries = world_bank_non_aggregate_countries()
    country_set = set(countries)

    series_results = []
    fresh_sets = {}
    for series_id, spec in SERIES.items():
        seen_labels = sorted(labels[series_id])
        if seen_labels and spec["expected_label"] not in seen_labels:
            raise RuntimeError(
                f"QPSD {series_id} label mismatch: {' | '.join(seen_labels[:10])}"
            )
        latest, fresh = latest_fresh(observations[series_id], country_set)
        if not latest:
            raise RuntimeError(
                f"QPSD bulk archive contained no usable observations for {series_id}; members={member_names[:12]}"
            )
        fresh_sets[series_id] = set(fresh)
        period_distribution = Counter(row["period"] for row in latest.values())
        series_results.append(
            {
                "series_id": series_id,
                "concept": spec["concept"],
                "production_role": spec["production_role"],
                "exact_label": spec["expected_label"],
                "observed_labels": seen_labels,
                "latest_non_null_country_count": len(latest),
                "fresh_or_aging_country_count": len(fresh),
                "latest_non_null_iso3": sorted(latest),
                "fresh_or_aging_iso3": sorted(fresh),
                "latest_period_distribution": dict(sorted(period_distribution.items())),
                "fresh_or_aging_rows": [serialize_row(fresh[iso3]) for iso3 in sorted(fresh)],
            }
        )

    gg = fresh_sets["DP.DOD.DECT.CR.GG.Z1"]
    cg = fresh_sets["DP.DOD.DECT.CR.CG.Z1"]
    best = max(len(gg), len(cg))

    report = {
        "schema_version": "geomacro-world-bank-qpsd-sovereign-fiscal-coverage-2.0",
        "generated_at": datetime.now(timezone.utc).isoformat().replace("+00:00", "Z"),
        "as_of": AS_OF.isoformat().replace("+00:00", "Z"),
        "writes_performed": False,
        "source": {
            "provider": "World Bank",
            "database": "Quarterly Public Sector Debt",
            "official_bulk_csv_url": BULK_URL,
            "bulk_archive_sha256": sha256(zip_bytes),
            "official_catalog": "https://datacatalog.worldbank.org/search/dataset/0037906/quarterly-public-sector-debt",
            "official_dataset_terms": "https://www.worldbank.org/ext/en/legal/terms-conditions/datasets",
            "catalog_license": "CC BY 4.0",
            "rights_review_status": "WORLD_BANK_QPSD_CC_BY_4_0_CANDIDATE",
            "rights_note": "Production activation still requires the source registry, attribution text, deterministic adapter, shadow methodology and production census to pass.",
        },
        "archive": {
            "member_count": len(member_names),
            "csv_member_count": len([name for name in member_names if name.lower().endswith('.csv')]),
            "parsed_target_members": parsed_members,
        },
        "country_metadata": {
            "official_country_api": COUNTRY_URL,
            "non_aggregate_world_bank_country_count": len(countries),
        },
        "methodology_boundary": {
            "discovery_only": True,
            "current_wdi_metric": "central_government_debt_pct_gdp",
            "current_eurostat_metric": "general_government_gross_debt_pct_gdp",
            "qpsd_general_government_metric": "DP.DOD.DECT.CR.GG.Z1",
            "qpsd_central_government_metric": "DP.DOD.DECT.CR.CG.Z1",
            "raw_cross_source_value_pooling_allowed": False,
            "cross_concept_peer_pooling_allowed": False,
            "direct_production_fallback_allowed": False,
            "source_specific_peer_universe_required": True,
            "fixed_peer_minimum_unchanged": True,
            "freshness_thresholds_unchanged": True,
        },
        "coverage_summary": {
            "general_government_current_or_aging_country_count": len(gg),
            "central_government_current_or_aging_country_count": len(cg),
            "both_concepts_current_or_aging_count": len(gg & cg),
            "general_government_only_count": len(gg - cg),
            "central_government_only_count": len(cg - gg),
            "best_single_concept_country_count": best,
            "target_100_country_path_plausible_from_qpsd_alone": best >= 100,
            "production_supported_country_count_added": 0,
        },
        "activation_boundary": {
            "production_activation_allowed": False,
            "source_registry_changed": False,
            "scoring_changed": False,
            "country_payability_changed": False,
            "next_required_proof": "Map QPSD bulk coverage against Geomacro's authoritative sovereign registry, verify exact source registration/attribution, build a deterministic source-specific adapter, run >=20-peer shadow scoring, then rerun the full production country census before promotion.",
        },
        "series": series_results,
    }

    Path(OUTPUT).write_text(json.dumps(report, indent=2) + "\n", encoding="utf-8")
    print(json.dumps({
        "generated_at": report["generated_at"],
        "coverage_summary": report["coverage_summary"],
        "archive": report["archive"],
        "activation_boundary": report["activation_boundary"],
    }, indent=2))
    print("PASS: WORLD BANK QPSD BULK FISCAL COVERAGE AUDIT COMPLETE - NO WRITES")


if __name__ == "__main__":
    try:
        main()
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        raise
