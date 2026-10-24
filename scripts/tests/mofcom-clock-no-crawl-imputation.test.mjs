import test from "node:test";
import assert from "node:assert/strict";
import {parseMofcomExportControlHtml,normalizeMofcomExportControl}
 from "../../global-intelligence/adapters/china-mofcom.mjs";
const now="2026-10-24T12:00:00.000Z";
const page="<html><body>exportcontrol.mofcom.gov.cn"+
 '<a href="/notice/18-2025">Rare earth export control</a>'+
 '<time>2026-10-24</time><div>2025-04-04</div>'+
 '</body></html>';
test("HTML index navigation/date is never a first-party original release clock",()=>{
 const rows=parseMofcomExportControlHtml(page,{observedAt:now});
 assert.equal(rows.length,1);
 assert.equal(rows[0].source_id,"china_mofcom_trade_controls");
 assert.equal(rows[0].observed_at,now);
 assert.equal(rows[0].published_at,null);
 assert.equal(rows[0].raw_payload.listingDayHint,"2026-10-24T00:00:00.000Z");
 assert.notEqual(rows[0].published_at,now);
});
test("unclocked MOFCOM normalizer never imputes fetch/retrieval time",()=>{
 const r=normalizeMofcomExportControl({id:"NO_DAY",title:"Rare earth controls",
  retrievedAt:now});
 assert.equal(r.published_at,null);
 assert.equal(r.observed_at,now);
 assert.ok(/^[0-9a-f]{64}$/u.test(r.raw_hash));
});
test("only explicitly supplied calendar date is retained; no synthetic precise hour",()=>{
 const r=normalizeMofcomExportControl({id:"EXPLICIT_2026",
  title:"Rare earth controls",issuedAt:"2026-10-19",
  retrievedAt:now});
 assert.equal(r.published_at,"2026-10-19T00:00:00.000Z");
 // Note: the caller still needs article original-page clock attestation.
 assert.equal(r.observed_at,now);
});