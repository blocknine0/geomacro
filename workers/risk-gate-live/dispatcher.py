"""Real liquidity + 3-hour dispatch with customer-controlled broker bridge.

This layer never treats an OSINT lead as a verified GRO or as permission to
trade. A named, customer-owned approval bridge must authorize each order.
"""
from __future__ import annotations

from datetime import timedelta
import logging
import os

import httpx

from core import dispatch_envelope, no_expired_dispatch, parse_utc, utcnow

log = logging.getLogger("risk-gate-dispatch")
PROVIDERS = {"IBKR", "BLOOMBERG_EMSX", "METATRADER"}

def _headers(token: str) -> dict[str, str]:
    return {"Authorization": f"Bearer {token}"} if token else {}

async def fresh_liquidity(symbol: str, client: httpx.AsyncClient) -> bool:
    endpoint = os.getenv("BROKER_LIQUIDITY_URL", "")
    token = os.getenv("BROKER_LIQUIDITY_TOKEN", "")
    if not endpoint.startswith("https://") or not token or not symbol:
        return False
    try:
        result = await client.get(endpoint, params={"symbol": symbol}, headers=_headers(token))
        result.raise_for_status()
        data = result.json()
        observed = parse_utc(data.get("observed_at"))
        if not observed or abs((utcnow() - observed).total_seconds()) > 30:
            return False
        return (data.get("symbol") == symbol and data.get("liquid") is True)
    except (httpx.HTTPError, ValueError, TypeError):
        log.error("liquidity check unavailable or invalid: fail closed")
        return False

async def notify(envelope: dict, client: httpx.AsyncClient) -> dict[str, bool]:
    """Alert each configured destination, never log credential values."""
    msg = (
        f"GeoMacro Risk Gate candidate | {envelope['event_type']} "
        f"{envelope['severity']}/10 | {','.join(envelope['country_iso3'])} "
        f"| {envelope['target_asset']} | valid until {envelope['expires_at']} "
        "| Source lead is UNVERIFIED; not an execution authorization"
    )
    attempts: dict[str, bool] = {}
    for name, key in (("slack", "SLACK_WEBHOOK_URL"), ("discord", "DISCORD_WEBHOOK_URL")):
        url = os.getenv(key, "")
        if not url.startswith("https://"):
            continue
        try:
            payload = {"text": msg} if name == "slack" else {"content": msg}
            response = await client.post(url, json=payload)
            response.raise_for_status()
            attempts[name] = True
        except httpx.HTTPError:
            attempts[name] = False
            log.error("%s alert delivery failed", name)
    token, chat = os.getenv("TELEGRAM_BOT_TOKEN", ""), os.getenv("TELEGRAM_CHAT_ID", "")
    if token and chat:
        try:
            url = f"https://api.telegram.org/bot{token}/sendMessage"
            response = await client.post(url, json={"chat_id": chat, "text": msg})
            response.raise_for_status()
            attempts["telegram"] = response.json().get("ok") is True
        except (httpx.HTTPError, ValueError):
            attempts["telegram"] = False
            log.error("telegram alert delivery failed")
    return attempts

async def customer_execution_approval(envelope: dict, client: httpx.AsyncClient) -> bool:
    """A customer bridge must explicitly approve each event/action/asset."""
    if os.getenv("BROKER_EXECUTION_ENABLED", "false").lower() != "true":
        return False
    endpoint = os.getenv("CUSTOMER_EXECUTION_APPROVAL_URL", "")
    token = os.getenv("CUSTOMER_EXECUTION_APPROVAL_TOKEN", "")
    if not endpoint.startswith("https://") or not token or not no_expired_dispatch(envelope):
        return False
    try:
        response = await client.post(endpoint, headers=_headers(token), json=envelope)
        response.raise_for_status()
        data = response.json()
        return bool(
            data.get("approved") is True
            and data.get("event_id") == envelope["event_id"]
            and data.get("target_asset") == envelope["target_asset"]
            and data.get("tranche") == 1
            and data.get("action") == "SHORT_OR_HEDGE"
            and parse_utc(data.get("valid_until"))
            and parse_utc(data["valid_until"]) > utcnow()
        )
    except (httpx.HTTPError, ValueError, TypeError):
        log.error("customer order authorization unavailable: fail closed")
        return False

async def submit_tranche_one(envelope: dict, client: httpx.AsyncClient) -> dict:
    """Submit to a *real deployed* customer broker bridge (not a mock execution).

    The bridge is responsible for the native IBKR/Bloomberg EMSX/MetaTrader SDK,
    symbol, account, market-hours and order semantics. It must enforce atomic
    idempotency by event_id; this client does not invent a filled-trade receipt.
    """
    provider = os.getenv("BROKER_PROVIDER", "")
    endpoint = os.getenv("BROKER_BRIDGE_URL", "")
    token = os.getenv("BROKER_BRIDGE_TOKEN", "")
    if (provider not in PROVIDERS or not endpoint.startswith("https://")
            or not token or os.getenv("BROKER_BRIDGE_ATOMIC_IDEMPOTENCY", "").lower() != "true"
            or not no_expired_dispatch(envelope)):
        return {"status": "DISABLED_OR_UNCONFIGURED"}
    response = await client.post(
        endpoint,
        json={"provider": provider, **envelope},
        headers={**_headers(token), "Idempotency-Key": envelope["event_id"]},
        timeout=10,
    )
    response.raise_for_status()
    result = response.json()
    if (result.get("event_id") != envelope["event_id"]
            or result.get("provider") != provider
            or result.get("status") not in {"ACCEPTED", "DUPLICATE"}
            or not result.get("order_id")):
        raise ValueError("broker bridge returned unverified submission receipt")
    return {"status": result["status"], "order_id": str(result["order_id"]), "provider": provider}

async def dispatch_candidate(event: dict) -> dict:
    """Apply operator asset + current liquidity, notify, then seek client consent."""
    symbol = os.getenv("RISK_GATE_TARGET_ASSET", "").strip()
    async with httpx.AsyncClient(timeout=10) as client:
        liquid = await fresh_liquidity(symbol, client)
        if not liquid:
            return {"status": "NO_FRESH_LIQUIDITY_PROOF", "alerts": {}}
        envelope = dispatch_envelope(event, symbol)
        alerts = await notify(envelope, client)
        approved = await customer_execution_approval(envelope, client)
        order = {"status": "NOT_AUTHORIZED"}
        if approved:
            # This returns only an order SUBMISSION receipt, never a claimed fill.
            try:
                order = await submit_tranche_one(envelope, client)
            except (httpx.HTTPError, ValueError):
                # Do not auto-retry an ambiguous order submission. The external
                # bridge must reconcile its idempotency key before resubmission.
                order = {"status": "UNKNOWN_SUBMISSION_REQUIRES_RECONCILIATION"}
                log.error("broker order state ambiguous: manual or bridge reconciliation required")
        return {
            "status": "RISK_GATE_TRIGGER_CANDIDATE",
            "generated_at": envelope["generated_at"],
            "expires_at": envelope["expires_at"],
            "alerts": alerts,
            "approved_for_broker": approved,
            "broker_order": order,
        }
