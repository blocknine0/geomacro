from pathlib import Path
import unittest

WORKER = Path("workers/telegram-flash/worker.py").read_text(encoding="utf-8")

class WorkerContractTests(unittest.TestCase):
    def test_source_filter_is_supported_and_validated(self):
        self.assertIn("BREAKING_RSS_SOURCE_IDS", WORKER)
        self.assertIn("unknown source IDs", WORKER)
        self.assertIn('"source_filter": requested_source_ids', WORKER)
        self.assertIn("for feed in feeds:", WORKER)

if __name__ == "__main__":
    unittest.main()
