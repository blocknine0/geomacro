#!/usr/bin/env python3
"""Bounded, read-only validation of an independently licensed historical reference.

No use as current original news, GRI score, customer delivery, paid eligibility,
source-rights attestation or per-country freshness proof. No database writes.
"""
import argparse
import csv
import hashlib
import io
import json
import sys
import urllib.request
import zipfile
from collections import Counter
from pathlib import Path

UPSTREAM_COMMIT = "36b8c237b2378a6d0242c94dddb3516873ad9fc4"
UPSTREAM_BLOB_SHA1 = "580a189550e1487111c65d0a81f6ee21b4661753"
UPSTREAM_URL = (
    "https://raw.githubusercontent.com/tianyufan-econ/global-geopolitics/"
    + UPSTREAM_COMMIT + "/Geopolitical_Scores/dyad_geopolitical_scores.zip"
)
MAX_COMPRESSED = 36 * 1024 * 1024
MAX_UNCOMPRESSED = 120 * 1024 * 1024
FIELDS = frozenset({
    "country1_code", "country2_code", "year",
    "geo_score_dyn", "number_of_events",
})


def git_blob_sha1(blob):
    header = ("blob %d\0" % len(blob)).encode("ascii")
    return hashlib.sha1(header + blob).hexdigest()


def download_archive():
    request = urllib.request.Request(
        UPSTREAM_URL,
        headers={"User-Agent": "Geomacro-historical-reference-audit/1.0",
                 "Accept": "application/octet-stream"},
        method="GET",
    )
    with urllib.request.urlopen(request, timeout=35) as response:
        if response.status != 200 or response.geturl() != UPSTREAM_URL:
            raise ValueError("HISTORICAL_SOURCE_REDIRECT_OR_STATUS")
        length = response.headers.get("Content-Length")
        if length and int(length) > MAX_COMPRESSED:
            raise ValueError("HISTORICAL_SOURCE_TOO_LARGE")
        content = response.read(MAX_COMPRESSED + 1)
    if len(content) > MAX_COMPRESSED:
        raise ValueError("HISTORICAL_SOURCE_TOO_LARGE")
    if git_blob_sha1(content) != UPSTREAM_BLOB_SHA1:
        raise ValueError("HISTORICAL_SOURCE_BLOB_HASH_MISMATCH")
    return content


def inspect_archive(blob, require_full=True):
    if len(blob) > MAX_COMPRESSED:
        raise ValueError("HISTORICAL_ARCHIVE_SIZE_EXCEEDED")
    with zipfile.ZipFile(io.BytesIO(blob)) as archive:
        names = [f for f in archive.infolist() if not f.is_dir()]
        if len(names) != 1 or not names[0].filename.endswith(".csv"):
            raise ValueError("HISTORICAL_ARCHIVE_SHAPE_INVALID")
        member = names[0]
        if (member.file_size > MAX_UNCOMPRESSED or
            member.filename.startswith("/") or ".." in member.filename):
            raise ValueError("HISTORICAL_ARCHIVE_UNSAFE_MEMBER")
        years = Counter()
        countries = set()
        latest_pairs = set()
        with archive.open(member) as binary:
            reader = csv.DictReader(io.TextIOWrapper(binary, encoding="utf-8-sig"))
            if not FIELDS.issubset(reader.fieldnames or []):
                raise ValueError("HISTORICAL_COLUMNS_MISSING")
            for record in reader:
                year = int(record["year"])
                a, b = record["country1_code"], record["country2_code"]
                if not (1950 <= year <= 2024 and len(a) == len(b) == 3
                        and a.isascii() and b.isascii() and a.isupper()
                        and b.isupper() and a < b):
                    raise ValueError("HISTORICAL_COUNTRY_YEAR_INVALID")
                score = float(record["geo_score_dyn"])
                if not (-1 <= score <= 1):
                    raise ValueError("HISTORICAL_SCORE_OUT_OF_RANGE")
                if int(record["number_of_events"]) < 0:
                    raise ValueError("HISTORICAL_EVENT_COUNT_INVALID")
                years[year] += 1
                countries.update((a, b))
                if year == 2024:
                    latest_pairs.add((a, b))
    if require_full:
        if (len(countries) != 193 or len(years) != 75
                or set(years) != set(range(1950, 2025))
                or any(n != 18528 for n in years.values())
                or len(latest_pairs) != 18528):
            raise ValueError("HISTORICAL_FULL_PANEL_INCOMPLETE")
    return {
        "schema": "geomacro.external-historical-dyad-readonly.v1",
        "source_repository": "tianyufan-econ/global-geopolitics",
        "source_commit": UPSTREAM_COMMIT,
        "source_blob_git_sha1": UPSTREAM_BLOB_SHA1,
        "archive_sha256": hashlib.sha256(blob).hexdigest(),
        "license_record": "upstream-repository-MIT; attribution-required",
        "year_min": min(years) if years else None,
        "year_max": max(years) if years else None,
        "country_count_in_historical_panel": len(countries),
        "historical_country_pair_count_2024": len(latest_pairs),
        "historical_observation_rows": sum(years.values()),
        "research_reference_only": True,
        "current_original_events_verified": False,
        "current_2026_coverage_verified": False,
        "independently_reviewed_gri": False,
        "licensed_current_news": False,
        "commercial_product_activated": False,
        "signed_hot_product_created": False,
        "x402_payment_executed": False,
        "source_raw_payload_exported": False,
    }


def main():
    parser = argparse.ArgumentParser()
    mode = parser.add_mutually_exclusive_group(required=True)
    mode.add_argument("--download", action="store_true")
    mode.add_argument("--archive", type=Path)
    parser.add_argument("--out", type=Path, required=True)
    args = parser.parse_args()
    data = download_archive() if args.download else args.archive.read_bytes()
    if args.download and git_blob_sha1(data) != UPSTREAM_BLOB_SHA1:
        raise ValueError("HISTORICAL_SOURCE_BLOB_HASH_MISMATCH")
    report = inspect_archive(data)
    args.out.parent.mkdir(parents=True, exist_ok=True)
    args.out.write_text(json.dumps(report, sort_keys=True, indent=2) + "\n", "utf-8")
    print(json.dumps({
        "historical_rows": report["historical_observation_rows"],
        "historical_countries": report["country_count_in_historical_panel"],
        "research_only": True, "commercially_ready": False
    }))


if __name__ == "__main__":
    try:
        main()
    except (ValueError, OSError, zipfile.BadZipFile, csv.Error) as exc:
        print(f"HISTORICAL_REFERENCE_NOT_ACCEPTED: {exc}", file=sys.stderr)
        sys.exit(2)
