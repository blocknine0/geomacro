#!/usr/bin/env python3
"""Offline additive private D1 schema verification; no Cloudflare credentials."""
import sqlite3
from pathlib import Path

ROOT=Path(__file__).resolve().parents[2]
schema=(ROOT/"workers/control-plane/migrations/0032_telegram_licensed_mtproto_private_research.sql").read_text()
connection=sqlite3.connect(":memory:")
connection.executescript(schema)
connection.executescript(schema)
fields={r[1] for r in connection.execute("PRAGMA table_info(telegram_mtproto_private_research)")}
required={"delivery_id","source_identity_sha256","reference_sha256",
          "content_sha256","category","country_iso3","topic_code",
          "published_at","observed_at","expires_at","rights_state",
          "verification_status","scored","commercial_eligible"}
assert fields==required,(fields,required)
assert not any(x in fields for x in ("raw_text","message_body","channel_handle","source_url","headline"))
row=("mp_"+"a"*32,"b"*64,"c"*64,"d"*64,"macro","IND","CENTRAL_BANK",
     "2026-11-04T00:00:00Z","2026-11-04T00:00:01Z","2026-11-05T01:00:01Z")
connection.execute(
    "INSERT INTO telegram_mtproto_private_research "
    "(delivery_id,source_identity_sha256,reference_sha256,content_sha256,category,"
    "country_iso3,topic_code,published_at,observed_at,expires_at) "
    "VALUES(?,?,?,?,?,?,?,?,?,?)",row)
stored=connection.execute(
    "SELECT rights_state,verification_status,scored,commercial_eligible FROM "
    "telegram_mtproto_private_research WHERE delivery_id=?", (row[0],)).fetchone()
assert stored==("INDIVIDUALLY_LICENSED_MTPROTO_RESEARCH_ONLY","UNVERIFIED",0,0)
for update in (
    "UPDATE telegram_mtproto_private_research SET scored=1",
    "UPDATE telegram_mtproto_private_research SET commercial_eligible=1",
    "UPDATE telegram_mtproto_private_research SET verification_status='VERIFIED'",
    "UPDATE telegram_mtproto_private_research SET rights_state='BOT_RESEARCH'",
):
    try:
        connection.execute(update)
        raise AssertionError("UNSAFE_D1_RESEARCH_PROMOTION_ACCEPTED")
    except sqlite3.IntegrityError:
        pass
connection.close()
print("PASS: isolated additive licensed-MTProto D1 schema, no raw fields, promotion denied")
