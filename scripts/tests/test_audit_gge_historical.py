#!/usr/bin/env python3
"""Offline tests; no network or secrets required."""
import hashlib
import io
import sys
import unittest
import zipfile
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parents[1] / "ops"))
from audit_gge_historical import inspect_archive, git_blob_sha1


def fixture(rows, header="country1_code,country2_code,year,geo_score_dyn,number_of_events"):
    mem = io.BytesIO()
    with zipfile.ZipFile(mem, "w", zipfile.ZIP_DEFLATED) as archive:
        archive.writestr("dyad_geopolitical_scores.csv", header + "\n" + "\n".join(rows) + "\n")
    return mem.getvalue()


class ReferenceAuditTest(unittest.TestCase):
    def test_bounded_historical_fixture_is_research_only(self):
        archive = fixture([
            "CHN,USA,2024,-0.4,3",
            "DEU,FRA,2023,0.6,5",
        ])
        report = inspect_archive(archive, require_full=False)
        self.assertEqual(report["year_max"], 2024)
        self.assertEqual(report["historical_observation_rows"], 2)
        self.assertEqual(report["historical_country_pair_count_2024"], 1)
        self.assertEqual(report["country_count_in_historical_panel"], 4)
        self.assertTrue(report["research_reference_only"])
        self.assertFalse(report["commercial_product_activated"])
        self.assertFalse(report["current_2026_coverage_verified"])
        self.assertFalse(report["signed_hot_product_created"])
        self.assertEqual(report["archive_sha256"], hashlib.sha256(archive).hexdigest())

    def test_demo_fixture_cannot_impersonate_full_panel(self):
        with self.assertRaisesRegex(ValueError, "HISTORICAL_FULL_PANEL_INCOMPLETE"):
            inspect_archive(fixture(["CHN,USA,2024,-0.2,1"]))

    def test_reject_new_current_data_in_historical_lane(self):
        with self.assertRaisesRegex(ValueError, "HISTORICAL_COUNTRY_YEAR_INVALID"):
            inspect_archive(fixture(["CHN,USA,2026,-0.2,1"]), require_full=False)

    def test_reject_invalid_scores_and_pairs(self):
        for row in ("CHN,USA,2024,1.9,1", "USA,CHN,2024,0.3,1",
                    "CHN,USA,2024,0.2,-1"):
            with self.subTest(row=row):
                with self.assertRaises(ValueError):
                    inspect_archive(fixture([row]), require_full=False)

    def test_reject_missing_contract_columns(self):
        with self.assertRaisesRegex(ValueError, "HISTORICAL_COLUMNS_MISSING"):
            inspect_archive(fixture(["CHN,USA,2024,0.1,1"], header="country,year"), require_full=False)

    def test_reject_unsafe_archive(self):
        mem = io.BytesIO()
        with zipfile.ZipFile(mem, "w") as archive:
            archive.writestr("../escape.csv", "country1_code")
        with self.assertRaisesRegex(ValueError, "HISTORICAL_ARCHIVE_UNSAFE_MEMBER"):
            inspect_archive(mem.getvalue(), require_full=False)

    def test_standard_git_blob_hash(self):
        blob = b"test"
        self.assertEqual(git_blob_sha1(blob), hashlib.sha1(b"blob 4\0test").hexdigest())


if __name__ == "__main__":
    unittest.main()
