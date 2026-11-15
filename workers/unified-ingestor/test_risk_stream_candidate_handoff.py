import importlib.util
import os
import sys
import types
import unittest
from pathlib import Path

os.environ.update({
    "GEOMACRO_INGEST_WORKER_URL": "https://control.example",
    "GEOMACRO_INGEST_WORKER_TOKEN": "i" * 64,
    "GEOMACRO_RAW_INGEST_TOKEN": "r" * 64,
    "B2_S3_ENDPOINT": "https://s3.example",
    "B2_REGION": "us-east-1",
    "B2_APPLICATION_KEY_ID": "test-key-id",
    "B2_APPLICATION_KEY": "test-key-secret",
    "B2_BUCKET_NAME": "test-bucket",
})

feedparser = types.ModuleType("feedparser")
feedparser.parse = lambda *_args, **_kwargs: types.SimpleNamespace(entries=[])
sys.modules.setdefault("feedparser", feedparser)
boto3 = types.ModuleType("boto3")
boto3.client = lambda *_args, **_kwargs: object()
sys.modules.setdefault("boto3", boto3)
httpx = types.ModuleType("httpx")
httpx.Timeout = lambda *_args, **_kwargs: object()
httpx.AsyncClient = lambda *_args, **_kwargs: types.SimpleNamespace(aclose=lambda: None)
sys.modules.setdefault("httpx", httpx)

module_path = Path(__file__).with_name("ingestor.py")
spec = importlib.util.spec_from_file_location("geomacro_unified_ingestor_test", module_path)
ingestor = importlib.util.module_from_spec(spec)
spec.loader.exec_module(ingestor)


class Response:
    def __init__(self, status, payload):
        self.status_code = status
        self._payload = payload

    def json(self):
        return self._payload


class FakeHttp:
    def __init__(self):
        self.calls = []

    async def post(self, url, *, headers, json):
        self.calls.append((url, headers, json))
        if url.endswith("/attest"):
            return Response(200, {"proof": {
                "facts_signature_b64": "facts-proof",
                "rights_signature_b64": "rights-proof",
            }, "risk_context": None})
        return Response(202, {"ok": True, "accepted": 1, "commercial_delivery": False})


class CandidateHandoffTest(unittest.IsolatedAsyncioTestCase):
    async def test_only_full_item_licensed_candidates_are_forwarded_to_attesters_and_events(self):
        service = object.__new__(ingestor.IngestService)
        service.http = FakeHttp()
        candidate = {
            "schema": "geomacro.risk-stream-candidate.v1",
            "kind": "VERIFIED_ORIGINAL",
            "rights_verification": {"item_license_evidence": {"license_id": "UK_OGL_V3"}},
            "raw_payload": "Publisher-owned factual record with item license evidence.",
            "event_fingerprint": "a" * 64,
            "country_iso3": "GBR",
            "category": "GEOPOLITICS",
        }
        self.assertTrue(await service.emit_verified_risk_stream_candidate(candidate))
        self.assertEqual([call[0] for call in service.http.calls], [
            "https://control.example/v1/internal/risk-stream/attest",
            "https://control.example/v1/internal/risk-stream/events",
        ])
        attestation = service.http.calls[0][2]
        self.assertEqual(attestation["draft"], candidate)
        posted = service.http.calls[1][2]["items"][0]
        self.assertEqual(posted["proof"]["facts_signature_b64"], "facts-proof")
        self.assertEqual(posted["proof"]["rights_signature_b64"], "rights-proof")

    async def test_headline_or_metadata_only_items_never_reach_attesters(self):
        service = object.__new__(ingestor.IngestService)
        service.http = FakeHttp()
        self.assertFalse(await service.emit_verified_risk_stream_candidate({
            "title": "headline only", "source_url": "https://publisher.example/story",
        }))
        self.assertEqual(service.http.calls, [])


if __name__ == "__main__":
    unittest.main()
