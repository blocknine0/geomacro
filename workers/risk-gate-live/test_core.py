import unittest
from datetime import datetime, timedelta, timezone
from core import canonicalize, threshold_breached, dispatch_envelope, no_expired_dispatch

class PipelineContractTests(unittest.TestCase):
    def test_three_categories_iso3_and_severity(self):
        examples = [
            ("telegram_osint", "Military strike in Ukraine", "UKR", "geopolitics"),
            ("tradingeconomics", "Debt default in Argentina", "ARG", "macro"),
            ("government_gazettes", "China export ban on rare earths", "CHN", "minerals"),
        ]
        for source, title, code, category in examples:
            with self.subTest(source=source):
                obj = canonicalize({"id": source, "headline": title}, source)
                self.assertEqual(obj["category"], category)
                self.assertIn(code, obj["country_iso3"])
                self.assertGreaterEqual(obj["severity"], 7.5)
                self.assertFalse(obj["commercial_eligible"])
                self.assertEqual(obj["verification_state"], "UNVERIFIED")

    def test_liquidity_gate(self):
        event = canonicalize({"id": "1", "headline": "US sanctions on Iran"}, "telegram_osint")
        self.assertTrue(threshold_breached(event, True))
        self.assertFalse(threshold_breached(event, False))
        event["country_iso3"] = []
        self.assertFalse(threshold_breached(event, True))

    def test_no_invented_country_or_publication(self):
        obj = canonicalize({"id": "2", "headline": "Major export ban declared"}, "government_gazettes")
        self.assertEqual(obj["country_iso3"], [])
        self.assertIsNone(obj["published_at"])
        self.assertFalse(threshold_breached(obj, True))

    def test_three_hour_strict_window(self):
        now = datetime(2026, 11, 4, tzinfo=timezone.utc)
        event = canonicalize({"id": "3", "headline": "War in Ukraine"}, "liveuamap")
        receipt = dispatch_envelope(event, "BTCUSD", now)
        self.assertTrue(no_expired_dispatch(receipt, now + timedelta(hours=2, minutes=59)))
        self.assertFalse(no_expired_dispatch(receipt, now + timedelta(hours=3)))
        self.assertEqual(receipt["tranche"], 1)

    def test_idempotent_event_key(self):
        raw = {"id": "same", "headline": "Iran sanctions"}
        a = canonicalize(raw, "central_bank_rss")["event_id"]
        b = canonicalize(raw, "central_bank_rss")["event_id"]
        self.assertEqual(a, b)
        self.assertNotEqual(a, canonicalize(raw, "imf_dispatches")["event_id"])

if __name__ == "__main__":
    unittest.main()
