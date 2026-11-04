"""RabbitMQ-backed low-latency Risk Gate candidate processing service."""
from __future__ import annotations

import asyncio
from contextlib import asynccontextmanager
import hashlib
import hmac
import json
import logging
import os
from pathlib import Path
import sqlite3
import time

import aio_pika
from fastapi import FastAPI, HTTPException, Request
from fastapi.responses import JSONResponse

from core import canonicalize, threshold_breached
from dispatcher import dispatch_candidate
from sources import (
    configured_json, poll_gazettes, poll_liveuamap, poll_rss,
    poll_tradingeconomics, stream_ais, stream_telegram,
)

logging.basicConfig(level=os.getenv("LOG_LEVEL", "INFO"))
log = logging.getLogger("risk-gate-runtime")
QUEUE = "geomacro.risk-gate-leads.v1"
DEAD_LETTER = "geomacro.risk-gate-leads.dead.v1"
MAX_BODY = 64 * 1024

class Runtime:
    def __init__(self):
        self.connection = None
        self.channel = None
        self.queue = None
        self.tasks = []
        self.db = None
        self.broker_connected = False

    async def connect(self):
        url = os.getenv("RABBITMQ_URL", "")
        if not url.startswith("amqp"):
            raise RuntimeError("RABBITMQ_URL must be configured for a durable AMQP broker")
        self.connection = await aio_pika.connect_robust(url, timeout=10)
        self.channel = await self.connection.channel(publisher_confirms=True)
        await self.channel.set_qos(prefetch_count=1)
        await self.channel.declare_queue(DEAD_LETTER, durable=True)
        self.queue = await self.channel.declare_queue(
            QUEUE, durable=True, arguments={
                "x-message-ttl": 3 * 60 * 60 * 1000,
                "x-dead-letter-exchange": "",
                "x-dead-letter-routing-key": DEAD_LETTER,
            },
        )
        db_path = Path(os.getenv("RISK_GATE_STATE_DB", "/data/risk_gate_events.sqlite"))
        db_path.parent.mkdir(parents=True, exist_ok=True)
        self.db = sqlite3.connect(db_path, isolation_level=None)
        self.db.execute("PRAGMA journal_mode=WAL")
        self.db.execute("PRAGMA synchronous=FULL")
        self.db.execute(
            "CREATE TABLE IF NOT EXISTS processed_events (event_id TEXT PRIMARY KEY, "
            "result_json TEXT NOT NULL, processed_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP)"
        )
        self.broker_connected = True

    async def publish(self, source: str, record: dict):
        if not self.connection or self.connection.is_closed:
            raise RuntimeError("message queue unavailable")
        body = json.dumps({
            "source": source,
            "record": record,
            "queued_at_ms": round(time.time() * 1000),
        }, separators=(",", ":"), default=str).encode()
        if len(body) > MAX_BODY:
            raise ValueError("lead exceeds message size limit")
        await self.channel.default_exchange.publish(
            aio_pika.Message(body, content_type="application/json",
                             delivery_mode=aio_pika.DeliveryMode.PERSISTENT),
            routing_key=QUEUE,
            mandatory=True,
        )

    async def consume_one(self, body: bytes):
        envelope = json.loads(body)
        event = canonicalize(envelope["record"], envelope["source"])
        queued_at = envelope.get("queued_at_ms")
        if isinstance(queued_at, (int, float)):
            lag_ms = max(0, round(time.time() * 1000 - queued_at))
            log.info("queue_latency_ms=%d under_150ms=%s", lag_ms, lag_ms < 150)
        existing = self.db.execute(
            "SELECT result_json FROM processed_events WHERE event_id = ?", (event["event_id"],)
        ).fetchone()
        if existing:
            log.info("duplicate_event_id=%s", event["event_id"])
            return
        result = {"status": "NO_THRESHOLD_OR_COUNTRY"}
        # Raw source feeds remain UNVERIFIED and never directly grant
        # commercial GRO eligibility or permit customer broker execution.
        if threshold_breached(event, True):
            result = await dispatch_candidate(event)
        self.db.execute(
            "INSERT OR IGNORE INTO processed_events (event_id, result_json) VALUES (?, ?)",
            (event["event_id"], json.dumps(result)),
        )
        log.info("event_id=%s source=%s category=%s status=%s",
                 event["event_id"], event["source"], event["category"], result["status"])

    async def consume_forever(self):
        async with self.queue.iterator() as incoming:
            async for msg in incoming:
                try:
                    async with msg.process(requeue=False):
                        await self.consume_one(msg.body)
                except asyncio.CancelledError:
                    raise
                except Exception as exc:
                    # RabbitMQ DLQ retains messages that genuinely fail processing.
                    log.exception("poison_message_dead_lettered error=%s", type(exc).__name__)

    async def start(self):
        await self.connect()
        self.tasks.append(asyncio.create_task(self.consume_forever(), name="consumer"))
        self.tasks.append(asyncio.create_task(poll_rss(
            "central_bank_rss", configured_json("CENTRAL_BANK_RSS_JSON", []),
            self.publish), name="central-banks"))
        self.tasks.append(asyncio.create_task(poll_rss(
            "imf_dispatches", configured_json("IMF_DISPATCH_RSS_JSON", []),
            self.publish), name="imf-dispatches"))
        self.tasks.append(asyncio.create_task(poll_gazettes(
            configured_json("GOVERNMENT_GAZETTES_JSON", []),
            self.publish), name="government-gazettes"))
        for name, fn in (
            ("tradingeconomics", poll_tradingeconomics),
            ("liveuamap", poll_liveuamap),
            ("ais", stream_ais),
            ("authorized-telegram", stream_telegram),
        ):
            self.tasks.append(asyncio.create_task(fn(self.publish), name=name))
        for task in self.tasks:
            task.add_done_callback(self.task_ended)

    def task_ended(self, task):
        if not task.cancelled():
            try:
                err = task.exception()
            except asyncio.CancelledError:
                return
            if err:
                log.error("source_or_consumer_crashed task=%s reason=%s",
                          task.get_name(), type(err).__name__)
                self.broker_connected = False

    async def stop(self):
        for task in self.tasks:
            task.cancel()
        await asyncio.gather(*self.tasks, return_exceptions=True)
        if self.connection:
            await self.connection.close()
        if self.db:
            self.db.close()
        self.broker_connected = False

runtime = Runtime()

@asynccontextmanager
async def lifespan(app: FastAPI):
    await runtime.start()
    try:
        yield
    finally:
        await runtime.stop()

app = FastAPI(title="GeoMacro Risk Gate Streaming", lifespan=lifespan, docs_url=None, redoc_url=None)

@app.get("/_health")
async def health():
    return {"service": "risk-gate-stream", "queue_connected": runtime.broker_connected,
            "state": "READINESS_ONLY_NOT_PRODUCTION_ACCEPTANCE"}

@app.get("/_ready")
async def ready():
    if not runtime.broker_connected or not runtime.connection or runtime.connection.is_closed:
        return JSONResponse(status_code=503, content={"ready": False})
    return {"ready": True, "queue": QUEUE}

@app.post("/webhooks/{source}")
async def ingest_webhook(source: str, request: Request):
    if source not in {"fastmarkets", "bmi"}:
        raise HTTPException(status_code=404)
    secret_env = {"fastmarkets": "FASTMARKETS_WEBHOOK_SECRET", "bmi": "BMI_WEBHOOK_SECRET"}[source]
    approved_env = {"fastmarkets": "FASTMARKETS_LICENSE_APPROVED", "bmi": "BMI_LICENSE_APPROVED"}[source]
    secret = os.getenv(secret_env, "")
    if not secret or os.getenv(approved_env, "").lower() != "true":
        raise HTTPException(status_code=503, detail="licensed webhook not configured")
    body = await request.body()
    if not body or len(body) > MAX_BODY:
        raise HTTPException(status_code=413)
    received = request.headers.get("X-Geomacro-Signature", "")
    expected = hmac.new(secret.encode(), body, hashlib.sha256).hexdigest()
    if not hmac.compare_digest(received, expected):
        raise HTTPException(status_code=401, detail="invalid HMAC")
    try:
        record = json.loads(body)
        canonicalize(record, source)  # enforce mandatory fields before enqueue
        await runtime.publish(source, record)
    except (ValueError, TypeError, KeyError, json.JSONDecodeError):
        raise HTTPException(status_code=422, detail="invalid event schema")
    except Exception:
        raise HTTPException(status_code=503, detail="broker unavailable")
    return JSONResponse(status_code=202, content={"accepted_to_queue": True,
                                                  "verified": False,
                                                  "commercial_eligible": False})
