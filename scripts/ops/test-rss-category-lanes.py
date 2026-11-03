#!/usr/bin/env python3
"""No-network coverage and fail-closed RSS three-lane production tests."""
from __future__ import annotations
import ast
import importlib.util
import tempfile
import unittest
from pathlib import Path

ROOT = Path(__file__).resolve().parents[2]
MODULE_PATH = ROOT / "scripts" / "ops" / "plan-rss-category-lanes.py"
spec = importlib.util.spec_from_file_location("rss_category_lanes", MODULE_PATH)
planner = importlib.util.module_from_spec(spec)
spec.loader.exec_module(planner)


class TestThreeDomainRssCategoryLanes(unittest.TestCase):
    def test_all_existing_worker_sources_partition_once_across_three_lanes(self):
        feeds = planner.load_registry()
        lanes = planner.partition(feeds)
        self.assertEqual(set(lanes), set(planner.DOMAINS))
        self.assertTrue(all(lanes.values()))
        ids = [source_id for items in lanes.values() for source_id in items]
        self.assertEqual(len(ids), len(feeds))
        self.assertEqual(set(ids), {f["source_id"] for f in feeds})
        self.assertEqual(len(set(ids)), len(ids))

    def test_new_official_source_is_automatically_selected_by_native_category(self):
        feeds = planner.load_registry()
        feeds.append({
            "source_id": "official_added_later",
            "url": "https://example.gov/official-feed.xml",
            "event_type": "CRITICAL_MINERALS_GOVERNMENT_RELEASE",
        })
        lanes = planner.partition(feeds)
        self.assertIn("official_added_later", lanes["CRITICAL_MINERALS"])

    def test_bad_or_duplicate_source_never_silently_dropped(self):
        feeds = planner.load_registry()
        for altered in [
            {**feeds[0], "source_id": feeds[1]["source_id"]},
            {**feeds[0], "source_id": "bad,cli-injection"},
            {**feeds[0], "url": "http://non-https.example.org/feed"},
            {**feeds[0], "event_type": "UNMAPPED_BREAKING"},
        ]:
            with self.subTest(altered=altered):
                with self.assertRaises(ValueError):
                    planner.partition(feeds + [altered])

    def test_canonical_registry_must_be_literal_and_unambiguous(self):
        with tempfile.TemporaryDirectory() as tmp:
            worker = Path(tmp) / "worker.py"
            worker.write_text("DEFAULT_RSS_FEEDS = []\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "REGISTRY_EMPTY"):
                planner.load_registry(worker)
            worker.write_text("DEFAULT_RSS_FEEDS = make_feeds()\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "NOT_LITERAL"):
                planner.load_registry(worker)
            worker.write_text("DEFAULT_RSS_FEEDS = []\nDEFAULT_RSS_FEEDS = []\n", encoding="utf-8")
            with self.assertRaisesRegex(ValueError, "AMBIGUOUS"):
                planner.load_registry(worker)


if __name__ == "__main__":
    unittest.main()
