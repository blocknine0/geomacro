import unittest
from bs4 import BeautifulSoup
from sources import gazette_original_timestamp

class GazetteTimestampTests(unittest.TestCase):
    def test_original_utc_time_from_item(self):
        item = BeautifulSoup(
            '<article><a href="/law">China export ban</a><time datetime="2026-11-04T01:00:00Z">published</time></article>',
            "html.parser",
        ).article
        self.assertEqual(
            gazette_original_timestamp(item, {}),
            "2026-11-04T01:00:00+00:00",
        )

    def test_missing_or_naive_timestamp_rejected(self):
        item = BeautifulSoup('<article><time datetime="2026-11-04">Today</time></article>', "html.parser").article
        self.assertIsNone(gazette_original_timestamp(item, {}))
        item = BeautifulSoup("<article>No timestamp</article>", "html.parser").article
        self.assertIsNone(gazette_original_timestamp(item, {}))

    def test_explicit_date_selector(self):
        item = BeautifulSoup(
            '<div><a>Ban</a><span class="native" content="2026-11-04T04:00:00+02:00">pub</span></div>',
            "html.parser",
        ).div
        self.assertEqual(
            gazette_original_timestamp(item, {"date_selector": ".native"}),
            "2026-11-04T02:00:00+00:00",
        )

if __name__ == "__main__":
    unittest.main()
