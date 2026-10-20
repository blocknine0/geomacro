import test from "node:test";
import assert from "node:assert/strict";
import {
 CHILE_COPPER_MONTHLY_OFFICIAL_URL,inspectChileanCopperMonthly,observeChileanCopperMonthly
} from "../lib/chile-copper-official-monthly.mjs";
const now=new Date("2026-10-20T08:00:00Z");
const html=(period="Ago.2026")=>
 '<!doctype html><html><main><h1>Producción cobre de mina, COCHILCO</h1>'+
 '<p>Frecuencia Mensual</p><p>Código de serie F034.PCUM.FLU.COCHILCO.Z.0.M</p>'+
 '<div>Observaciones '+period+': 366,3 Jul.2026 400,3</div>'+
 '</main></html>';
test("pinned official Chile series, monthly native reference period only",()=>{
 const url=new URL(CHILE_COPPER_MONTHLY_OFFICIAL_URL);
 assert.equal(url.hostname,"si3.bcentral.cl");
 assert.equal(url.searchParams.get("idSerie"),"F034.PCUM.FLU.COCHILCO.Z.0.M");
 const r=inspectChileanCopperMonthly(html(),now);
 assert.equal(r.country_iso3,"CHL");
 assert.equal(r.latest_observed_reference_month,"2026-08");
 assert.equal(r.reference_lag_months,2);
 assert.equal(r.status,"OFFICIAL_MONTHLY_REFERENCE_PRESENT");
 assert.equal(r.exact_period_value_verified,false);
 assert.equal(r.native_publication_clock_verified,false);
 assert.equal(r.customer_paid_eligible,false);
 assert.doesNotMatch(JSON.stringify(r),/366,3|400,3/);
});
test("publisher page updated in October must not become October copper observation",()=>{
 const evidence=html().replace("<div>Observaciones",
   "<p>Actualizado: 13.Oct.2026</p><p>Last updated Oct.2026</p><div>Observaciones");
 const r=inspectChileanCopperMonthly(evidence,now);
 assert.equal(r.latest_observed_reference_month,"2026-08");
 assert.equal(r.reference_lag_months,2);
 assert.equal(r.native_publication_clock_verified,false);
 assert.equal(r.exact_period_value_verified,false);
});

test("unknown series, future period, empty HTML, scripts fail closed",()=>{
 assert.throws(()=>inspectChileanCopperMonthly("<html>fake chart</html>",now),/CHILE_OFFICIAL_SERIES_NOT_CONFIRMED/);
 const future=inspectChileanCopperMonthly(html("Nov.2026").replace("Jul.2026",""),now);
 assert.equal(future.latest_observed_reference_month,null);
 assert.equal(future.status,"SERIES_PRESENT_NO_PARSEABLE_REFERENCE_PERIOD");
 const nonreal=inspectChileanCopperMonthly(html().replace("Ago.2026","<script>Ago.2026</script>").replace("Jul.2026",""),now);
 assert.equal(nonreal.latest_observed_reference_month,null);
 assert.equal(nonreal.raw_producer_numbers_exposed,false);
});
test("one official GET, provider denial & oversize preserve no-payment",async()=>{
 let calls=0;
 const r=await observeChileanCopperMonthly({now,fetchImpl:async(u,init)=>{
  calls++;assert.equal(u,CHILE_COPPER_MONTHLY_OFFICIAL_URL);
  assert.equal(init.redirect,"error");return new Response(html());
 }});
 assert.equal(calls,1);assert.equal(r.status,"OFFICIAL_MONTHLY_REFERENCE_PRESENT");
 await assert.rejects(()=>observeChileanCopperMonthly({now,fetchImpl:async()=>new Response("403",{status:403})}),/CHILE_DENIED_OR_QUOTA/);
 await assert.rejects(()=>observeChileanCopperMonthly({now,fetchImpl:async()=>new Response("x",{headers:{"content-length":"900000"}})}),/CHILE_BODY_LIMIT/);
});
