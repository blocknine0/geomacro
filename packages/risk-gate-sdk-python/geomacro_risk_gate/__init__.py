"""GeoMacro Risk Gate client and local historical replay helper."""
from __future__ import annotations
from datetime import datetime
from typing import Any
import json
import urllib.error
import urllib.request

class GeoMacroRiskGateClient:
    def __init__(self, base_url: str, api_key: str, timeout: int = 15):
        if not base_url.startswith("https://"):
            raise ValueError("HTTPS_REQUIRED")
        self.base_url = base_url.rstrip("/")
        self.api_key = api_key
        self.timeout = timeout

    def evaluate(self, request: dict[str, Any]) -> dict[str, Any]:
        body = json.dumps(request, separators=(",", ":")).encode()
        req = urllib.request.Request(
            self.base_url + "/v1/risk-gate/commercial/evaluate", data=body,
            headers={"Authorization": "Bearer " + self.api_key,
                     "Content-Type": "application/json"}, method="POST")
        try:
            with urllib.request.urlopen(req, timeout=self.timeout) as response:
                payload = json.loads(response.read())
        except (urllib.error.URLError, urllib.error.HTTPError) as exc:
            raise RuntimeError("RISK_GATE_CHECK_FAILED") from exc
        if payload.get("execution_authorized") is not False or not payload.get("audit_receipt_hash") or not payload.get("audit_receipt_signature") or not payload.get("advisory_decision"):
            raise RuntimeError("RISK_GATE_CHECK_UNVERIFIABLE")
        return payload

def simulate_historical(transactions: list[dict[str, Any]], checks: list[dict[str, Any]]) -> dict[str, Any]:
    """Replay supplied historical signed checks locally; never estimates fraud prevented."""
    if len(transactions) > 100_000 or len(checks) > 100_000:
        raise ValueError("SIMULATION_LIMIT_EXCEEDED")
    ordered = sorted(checks, key=lambda c: c.get("evaluated_at", ""))
    rows = []
    for tx in transactions:
        at = datetime.fromisoformat(tx["occurred_at"].replace("Z", "+00:00"))
        matches = [c for c in ordered
                   if c.get("subject") == tx.get("subject")
                   and datetime.fromisoformat(c["evaluated_at"].replace("Z", "+00:00")) <= at
                   and datetime.fromisoformat(c.get("valid_until") or c.get("risk", {}).get("expires_at", "9999-12-31T23:59:59+00:00").replace("Z", "+00:00")) > at]
        check = matches[-1] if matches else None
        decision = check.get("advisory_decision") if check else "NO_HISTORICAL_CHECK"
        ratio = 0 if decision in ("REQUIRE_APPROVAL", "PAUSE") else 0.5 if decision == "REDUCE_LIMIT" else 1
        rows.append({"transaction_id": tx.get("id"), "matched": bool(check),
                     "decision": decision, "advisory_exposure_ratio": ratio,
                     "execution_authorized": False})
    states = ["CONTINUE", "REDUCE_LIMIT", "REQUIRE_APPROVAL", "PAUSE", "NO_HISTORICAL_CHECK"]
    return {"schema": "geomacro.risk-gate-local-simulator.v1",
            "checks_used": len(checks), "transactions": len(rows),
            "decision_counts": {s: sum(r["decision"] == s for r in rows) for s in states},
            "rows": rows, "fraud_prevented_estimate": None,
            "simulation_only": True, "execution_authorized": False}
