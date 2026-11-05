/** Protected production acceptance, counts and symbolic states only. */
import {writeFileSync,mkdirSync} from "node:fs";
import {RISK_GATE_HOT50} from "../../workers/control-plane/src/risk-gate-hot50-scope.mjs";
import {RISK_GATE_PRODUCT_TIERS} from "../../workers/control-plane/src/risk-gate-three-tier-product.mjs";
const token=process.env.RISK_GATE_TIERED_TOKEN;
if(!/^[a-f0-9]{64}$/.test(token??""))throw Error("HOT50_TIER_PROOF_SECRET_MISSING");
const full=process.env.HOT50_TIER_FULL_CENSUS==="1";
const ids=full?RISK_GATE_HOT50:[RISK_GATE_HOT50[Math.floor(Date.now()/1200000)%50]];
const receipts=[];
for(const id of ids)for(const [tier,price] of Object.entries(RISK_GATE_PRODUCT_TIERS)){
 let receipt={country_iso3:id,tier,ready:false,status:"TRANSPORT_UNAVAILABLE"};
 try{
  const r=await fetch("https://api.geomacro.live/v1/risk-gate/unified/evaluate",{
   method:"POST",redirect:"error",signal:AbortSignal.timeout(25000),
   headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
   body:JSON.stringify({target_type:"COUNTRY",target_id:id,product_tier:tier})});
  const body=await r.json(),product=body?.tiered_product;
  const valid=r.status===200&&body.ok===true&&product?.subject?.id===id&&
   product.price?.usd_per_call===price.usd_per_call&&product.execution_authorized===false&&
   Object.keys(body.categories??{}).length===3;
  const symbolic=String(product?.status??body?.error??"RESPONSE_INVALID");
  receipt={...receipt,http_status:r.status,status:/^[A-Z0-9_]{1,90}$/.test(symbolic)?symbolic:"RESPONSE_INVALID",
   ready:valid&&product.status==="READY",contract_valid:valid};
 }catch{/* No bearer, response body or private evidence in receipt. */}
 receipts.push(receipt);
}
const report={schema:"geomacro.hot50-three-price-production-acceptance.v1",generated_at:new Date().toISOString(),
 scope:"HOT50",full_census:full,countries_checked:ids.length,categories_per_country:3,
 expected_tiers:3,checked:receipts.length,ready:receipts.filter(x=>x.ready).length,
 complete:receipts.every(x=>x.ready),no_funds:true,receipts};
mkdirSync("artifacts/hot50-risk-gate",{recursive:true});
writeFileSync("artifacts/hot50-risk-gate/latest.json",JSON.stringify(report,null,2));
console.log(JSON.stringify({schema:report.schema,countries_checked:report.countries_checked,checked:report.checked,ready:report.ready,complete:report.complete}));
if(!report.complete)process.exitCode=1;
