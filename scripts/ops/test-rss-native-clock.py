#!/usr/bin/env python3
"""Guard RSS publisher-native timestamp detection against accidental double escaping.

Load only the pure function from worker.py so this regression test cannot start
the Telegram worker or contact publishers, tokens, payments or live systems.
"""
import ast
from pathlib import Path
import re
import unittest


def clock_detector():
    source = Path("workers/telegram-flash/worker.py").read_text(encoding="utf-8")
    parsed = ast.parse(source, filename="workers/telegram-flash/worker.py")
    matches = [
        node for node in parsed.body
        if isinstance(node, ast.FunctionDef)
        and node.name == "feed_source_timestamp_has_clock"
    ]
    if len(matches) != 1:
        raise AssertionError("RSS_NATIVE_CLOCK_DETECTOR_NOT_UNIQUE")
    code = compile(ast.Module(body=matches, type_ignores=[]), "<rss-clock>", "exec")
    namespace = {"re": re, "Any": object}
    exec(code, namespace)
    return namespace["feed_source_timestamp_has_clock"]


class PublisherNativeClockTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.detect = staticmethod(clock_detector())

    def test_rfc822_publisher_time(self):
        self.assertTrue(self.detect({
            "published": "Tue, 03 Nov 2026 12:46:23 GMT"
        }))

    def test_iso8601_publisher_time(self):
        self.assertTrue(self.detect({
            "published": "2026-11-03T12:46:23+00:00"
        }))

    def test_dc_date_with_native_time(self):
        self.assertTrue(self.detect({
            "dc:date": "2026-11-03T12:46:23Z"
        }))

    def test_day_only_not_assigned_fake_hour(self):
        self.assertFalse(self.detect({"published": "2026-11-03"}))

    def test_missing_clock_not_promoted(self):
        self.assertFalse(self.detect({"title": "New policy release"}))

    def test_narrative_text_not_assigned_clock(self):
        self.assertFalse(self.detect({"published": "Tuesday, November 3, 2026"}))

    def test_compact_year_is_not_a_publication_time(self):
        self.assertFalse(self.detect({"published": "2026-11-03 2026"}))

    def test_out_of_range_minutes_is_not_a_clock(self):
        self.assertFalse(self.detect({"published": "2026-11-03T12:70:00Z"}))


class GovernedSourceRegistryTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        tree = ast.parse(Path("workers/telegram-flash/worker.py").read_text(encoding="utf-8"))
        assignments = [node for node in tree.body
                       if isinstance(node, ast.AnnAssign)
                       and isinstance(node.target, ast.Name)
                       and node.target.id == "DEFAULT_RSS_FEEDS"]
        if len(assignments) != 1:
            raise AssertionError("RSS_DEFAULT_SOURCE_REGISTRY_UNAVAILABLE")
        cls.sources = {entry["source_id"]: entry
                       for entry in ast.literal_eval(assignments[0].value)}

    def test_independent_critical_materials_feeds(self):
        doe = self.sources["doe_critical_materials_rss"]
        mining = self.sources["mining_com_critical_minerals_rss"]
        self.assertEqual(doe["url"], "https://www.energy.gov/rss/energygov/2193718")
        self.assertEqual(mining["url"], "https://www.mining.com/feed/")
        self.assertEqual(doe["event_type"], "CRITICAL_MINERALS_GOVERNMENT_RELEASE")
        self.assertEqual(mining["event_type"], "CRITICAL_MINERALS_INDUSTRY_REPORT")
        self.assertNotEqual(doe["source_id"], "usgs_minerals_news_rss")
        self.assertEqual(len(self.sources), 20)

    def test_eu_official_rss_fallback_does_not_fabricate_date(self):
        source = self.sources["eu_council_press_rss"]
        self.assertEqual(source["retry_attempts"], 3)
        self.assertIn("consilium.europa.eu", source["fallback_url"])
        self.assertEqual(source["fallback_link_prefix"], "/en/press/press-releases/")


if __name__ == "__main__":
    unittest.main(verbosity=2)
