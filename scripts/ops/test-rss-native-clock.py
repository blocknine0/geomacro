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


def date_only_detector():
    source = Path("workers/telegram-flash/worker.py").read_text(encoding="utf-8")
    parsed = ast.parse(source, filename="workers/telegram-flash/worker.py")
    funcs = [node for node in parsed.body
             if isinstance(node, ast.FunctionDef)
             and node.name == "native_publication_day"]
    if len(funcs) != 1:
        raise AssertionError("RSS_NATIVE_DATE_ONLY_DETECTOR_NOT_UNIQUE")
    from datetime import datetime
    ns = {"re": re, "Any": object, "datetime": datetime}
    exec(compile(ast.Module(body=funcs, type_ignores=[]), "<native-date>", "exec"), ns)
    return ns["native_publication_day"]


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



class PublisherNativeDateOnlyTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls):
        cls.date = staticmethod(date_only_detector())

    def test_precise_original_iso_date_preserved_without_invented_hour(self):
        self.assertEqual(self.date({"published": "2026-11-03"}), "2026-11-03")

    def test_official_date_only_rfc_published_is_preserved_as_date(self):
        self.assertEqual(self.date({"published": "Tue, 03 Nov 2026"}), "2026-11-03")

    def test_issuer_dc_date_precision_is_preserved(self):
        self.assertEqual(self.date({"dc:date": "2026-11-03"}), "2026-11-03")

    def test_no_last_modified_or_aggregation_clock_substitution(self):
        self.assertIsNone(self.date({"updated": "2026-11-03", "created": "2026-11-03"}))

    def test_no_calendar_invalid_or_narrative_date_or_fake_hour(self):
        for entry in (
            {"published": "2026-02-30"},
            {"published": "2026-11-03T15:10:00Z"},
            {"published": "Tuesday, November 3, 2026"},
            {"headline": "Critical minerals update"},
        ):
            with self.subTest(entry=entry):
                self.assertIsNone(self.date(entry))

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
        self.assertEqual(mining["timeout_seconds"], 8)
        self.assertEqual(mining["retry_attempts"], 3)
        self.assertEqual(doe["event_type"], "CRITICAL_MINERALS_GOVERNMENT_RELEASE")
        self.assertEqual(mining["event_type"], "CRITICAL_MINERALS_INDUSTRY_REPORT")
        self.assertNotEqual(doe["source_id"], "usgs_minerals_news_rss")
        self.assertEqual(len(self.sources), 25)

    def test_bis_media_original_issuer_rss_alternate_is_same_publisher(self):
        source = self.sources["bis_rss_media_releases"]
        self.assertEqual(source["retry_attempts"], 2)
        self.assertEqual(source["timeout_seconds"], 8)
        self.assertTrue(source["alternate_feed_url"].startswith("https://www.bis.org/doclist/all_pressrels.rss?"))
        self.assertEqual(source["fallback_url"], "https://www.bis.org/media/news")
        self.assertEqual(source["fallback_link_prefix"], "/media-releases/")

    def test_eu_official_rss_fallback_does_not_fabricate_date(self):
        source = self.sources["eu_council_press_rss"]
        self.assertEqual(source["retry_attempts"], 3)
        self.assertIn("consilium.europa.eu", source["fallback_url"])
        self.assertEqual(source["fallback_link_prefix"], "/en/press/press-releases/")


if __name__ == "__main__":
    unittest.main(verbosity=2)
