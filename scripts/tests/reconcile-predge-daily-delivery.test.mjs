import {test} from "node:test";
import assert from "node:assert/strict";
import {mkdtempSync,readFileSync,rmSync,writeFileSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {buildD1DailyQueries,parsePartner,reconcileDaily} from "../ops/reconcile-predge-daily-delivery.mjs";

const day="2026-11-18",hash="a".repeat(64);

test("daily D1 queries restrict signed creation and delivery reads to one UTC day",()=>{
 const queries=buildD1DailyQueries(day);
 assert.match(queries.created,/FROM risk_stream_signed_gro WHERE created_at>=/u);
 assert.match(queries.created,/created_at<'2026-11-19T00:00:00'/u);
 assert.match(queries.deliveries,/risk_stream_predge_daily_delivery_ledger WHERE day_utc='2026-11-18'/u);
 assert.throws(()=>buildD1DailyQueries("2026-02-30"),/INVALID_UTC_DAY/u);
});

test("partner report parser reads JSON array and quoted CSV values",()=>{
 const dir=mkdtempSync(join(tmpdir(),"predge-partner-"));
 try{
  const json=join(dir,"partner.json"),csv=join(dir,"partner.csv");
  writeFileSync(json,JSON.stringify({deliveries:[{gro_id:hash,receipt_sha256:hash}]}));
  writeFileSync(csv,'gro_id,receipt_sha256,note\n'+`${hash},${hash},"received, matched"\n`);
  assert.equal(parsePartner(json)[0].gro_id,hash);
  assert.deepEqual(parsePartner(csv)[0],{gro_id:hash,receipt_sha256:hash,note:"received, matched"});
 }finally{rmSync(dir,{recursive:true,force:true});}
});

test("CLI reconciler writes machine-readable JSON and CSV with partner diff",async()=>{
 const dir=mkdtempSync(join(tmpdir(),"predge-daily-"));
 try{
  const partner=join(dir,"partner.json");
  writeFileSync(partner,JSON.stringify([{gro_id:hash,receipt_sha256:hash}]));
  const calls=[];
  const run=(_database,sql)=>{
   calls.push(sql);
   if(sql.includes("risk_stream_signed_gro"))return [{created_at:`${day}T01:00:00.000Z`,country_iso3:"USA",category:"GEOPOLITICS",tier:"BASIC"}];
   return [{day_utc:day,gro_id:hash,receipt_sha256:hash,country_iso3:"USA",category:"GEOPOLITICS",tier:"BASIC",delivery_status:"DELIVERED"}];
  };
  const result=await reconcileDaily({day,partnerReport:partner,run,outDir:dir});
  assert.equal(result.created_total,1);assert.equal(result.delivered_total,1);
  assert.equal(result.partner_reconciliation.matched_count,1);
  const json=JSON.parse(readFileSync(join(dir,`${day}-summary.json`),"utf8"));
  assert.equal(json.expected_geomacro_net_usd,0.1);
  assert.match(readFileSync(join(dir,`${day}-summary.csv`),"utf8"),/"BASIC","1","1","1","0","0.1"/u);
  assert.equal(calls.length,2);
 }finally{rmSync(dir,{recursive:true,force:true});}
});
