"""Cloudflare scoped INDEX_ONLY metadata bridge; no news text/licence export."""
import asyncio
import os
import unittest
from unittest.mock import patch
from runtime import Runtime


class ForwardStub:
    def __init__(self, status_code=202, payload=None):
        self.status_code = status_code
        self.payload = payload
        self.request = None

    async def post(self, url, headers, json):
        self.request = (url, headers, json)
        return self

    def json(self):
        return self.payload or {"status": "DURABLY_QUEUED_INDEX_ONLY",
                                "accepted": 1, "commercial_delivery_authorized": False}


class ScopedIndexBridgeTests(unittest.TestCase):
    def event(self):
        return {"event_id": "a" * 64, "source": "central_bank_rss", "category": "macro",
                "source_record_id": "official-bls-cpi", "event_type": "Sanctions",
                "country_iso3": ["USA"], "source_url": "https://www.bls.gov/",
                "published_at": "2026-11-11T22:00:00+00:00",
                "headline": "copyrighted original full text may not be forwarded"}

    def test_unconfigured_fails_nonsigning_and_stores_nothing(self):
        rt = Runtime()
        with patch.dict(os.environ, {}, clear=True):
            self.assertEqual(asyncio.run(rt.forward_index_only(self.event())),
                             {"status": "INDEX_BRIDGE_UNCONFIGURED"})

    def test_scoped_bridge_is_index_only_with_durable_ack(self):
        rt = Runtime()
        rt.index_forward_client = ForwardStub()
        with patch.dict(os.environ, {
            "GEOMACRO_STREAM_INDEX_LEAD_URL":
              "https://api.geomacro.live/v1/internal/risk-stream/index-leads",
            "RISK_STREAM_INDEX_LEAD_BEARER": "K" * 64
        }, clear=True):
            result = asyncio.run(rt.forward_index_only(self.event()))
        self.assertEqual(result["status"], "INDEX_ONLY_DURABLY_QUEUED")
        url, headers, payload = rt.index_forward_client.request
        self.assertTrue(url.startswith("https://api.geomacro.live/"))
        self.assertEqual(payload["items"][0]["category"], "macro")
        self.assertEqual(payload["items"][0]["source"], "RSS")
        self.assertEqual(payload["items"][0]["country_iso3"], "USA")
        self.assertNotIn("headline", str(payload))
        self.assertNotIn("commercial_rights_approved", str(payload))

    def test_broken_ack_blocks_local_receipt(self):
        rt = Runtime()
        rt.index_forward_client = ForwardStub(200)
        with patch.dict(os.environ, {
            "GEOMACRO_STREAM_INDEX_LEAD_URL":
              "https://api.geomacro.live/v1/internal/risk-stream/index-leads",
            "RISK_STREAM_INDEX_LEAD_BEARER": "K" * 64
        }, clear=True):
            with self.assertRaisesRegex(RuntimeError, "durable admission unavailable"):
                asyncio.run(rt.forward_index_only(self.event()))

    def test_non_hot50_leads_are_not_submitted(self):
        rt = Runtime()
        rt.index_forward_client = ForwardStub()
        lead = self.event()
        lead["country_iso3"] = ["NZL"]
        with patch.dict(os.environ, {
            "GEOMACRO_STREAM_INDEX_LEAD_URL":
              "https://api.geomacro.live/v1/internal/risk-stream/index-leads",
            "RISK_STREAM_INDEX_LEAD_BEARER": "K" * 64
        }, clear=True):
            result = asyncio.run(rt.forward_index_only(lead))
        self.assertEqual(result["status"], "INDEX_BRIDGE_COUNTRY_OUT_OF_SCOPE")
        self.assertIsNone(rt.index_forward_client.request)

    def test_untrusted_hosts_refuse_source_export(self):
        rt = Runtime()
        rt.index_forward_client = ForwardStub()
        with patch.dict(os.environ, {
            "GEOMACRO_STREAM_INDEX_LEAD_URL":
              "https://127.0.0.1/v1/internal/risk-stream/index-leads",
            "RISK_STREAM_INDEX_LEAD_BEARER": "K" * 64
        }, clear=True):
            with self.assertRaisesRegex(RuntimeError, "unsafe indexed"):
                asyncio.run(rt.forward_index_only(self.event()))


if __name__ == "__main__":
    unittest.main()
