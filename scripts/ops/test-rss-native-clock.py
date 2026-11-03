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


if __name__ == "__main__":
    unittest.main(verbosity=2)
