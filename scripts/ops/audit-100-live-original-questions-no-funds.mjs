#!/usr/bin/env node
/**
 * 100 exactly preserved user questions from founder mock suite.
 * Calls PUBLIC canonical production API, never signs, pays or submits wallet
 * credentials. Outputs factual HTTP responses/verified zero-fund refusals only.
 */
import {readFileSync,writeFileSync,mkdirSync} from "node:fs";
import {inflateSync} from "node:zlib";
import {createHash} from "node:crypto";
import {resolve} from "node:path";

const CASES="scripts/tests/data/launch-100-original-questions.zlib.b64";
const EXPECTED_SHA="27e28da3af26d36538d797b4802d1edad78c728a1bdf2801ab742a4bdf547dbc";
const SHA=data=>createHash("sha256").update(data).digest("hex");
const raw=inflateSync(Buffer.from(readFileSync(CASES,"utf8").trim(),"base64")).toString("utf8");
if(SHA(raw)!==EXPECTED_SHA)throw Error("LAUNCH_100_EXACT_QUESTIONS_HASH_MISMATCH");
const cases=JSON.parse(raw);
if(!Array.isArray(cases)||cases.length!==100||
  cases.some((x,i)=>!Array.isArray(x)||x.length!==11||
    x[0]!=="GM-"+String(i+1).padStart(3,"0")||
    !["user","machine"].includes(x[2])||
    typeof x[1]!=="string"||x[1].length<10))
  throw Error("LAUNCH_100_CASES_NOT_ORIGINAL");
const categoryCount={Geopolitics:0,"Macro / FX":0,"Critical Minerals":0};
const skuCount={};
for(const c of cases){
  if(!(c[3] in categoryCount))throw Error("LAUNCH_100_CATEGORY_UNEXPECTED");
  categoryCount[c[3]]++;
  const key=c[4].capability+"/"+c[4].variant;
  skuCount[key]=(skuCount[key]??0)+1;
}
if(JSON.stringify(Object.values(categoryCount))!==JSON.stringify([34,33,33])||
   Object.keys(skuCount).length!==9||
   cases.filter(c=>c[2]==="user").length!==50||
   cases.filter(c=>c[2]==="machine").length!==50)
  throw Error("LAUNCH_100_DISTRIBUTION_CHANGED");
const root="https://geomacro.live";
const route={user:"/api/v1/intelligence/structured-answer",machine:"/api/v1/intelligence/query"};
const resultDir=resolve(process.env.RUNNER_TEMP??"/tmp","geomacro-100-live-no-funds");
mkdirSync(resultDir,{recursive:true});
const records=[];
const scrub=raw=>typeof raw==="string"?raw.slice(0,120):null;
function errorCode(body){
  if(!body||typeof body!=="object")return null;
  return scrub(body.error?.code??body.error_code??body.reason??body.code??
    (typeof body.error==="string"?body.error:null));
}
const plannedDelay=Number(process.env.GEOMACRO_LIVE_AUDIT_DELAY_MS??3800);
if(!Number.isFinite(plannedDelay)||plannedDelay<3500||plannedDelay>15000)
  throw Error("LAUNCH_100_RATE_SAFETY_DELAY_INVALID");
const offline=process.argv.includes("--self-test");
for(const [index,c] of cases.entries()){
  const [id,question,actor,category,product,subjects,topics,intent,tier,detail,price]=c;
  const languageNumber=(index+1)%10;
  const native=languageNumber===5?"bn":languageNumber===8?"hi":null;
  const effectiveProduct=product.variant==="newly_qualified_signed"?{...product,
    issued_after:new Date(Date.now()-60_000).toISOString()}:product;
  const canonical={
    schema_version:"geomacro.agent-query.v1",question,product:effectiveProduct,subjects,topics,intent,
    fulfillment_mode:"published_only",delivery_tier:tier,detail,
    client_request_id:"GM-MOCK100-"+String(index+1).padStart(3,"0"),
    ...(native?{response_locale:native}:{})
  };
  const payload=actor==="user"?{
    question,product:effectiveProduct,subjects,topics,client_request_id:canonical.client_request_id,
    ...(native?{language:native}:{})
  }:canonical;
  const item={
    id,actor,category,price_usdc:price,sku:product.capability+"/"+product.variant,
    question,request_body:payload,api_url:root+route[actor],
    live_request_adjustment:product.variant==="newly_qualified_signed"?"FRESH_FIVE_MINUTE_ISSUED_AFTER":null,
    status:"NOT_EXECUTED",http_status:null,classification:"NOT_EXECUTED",
    response_json:null,error_code:null,settlement_performed:false,
    payment_signature_sent:false,fee_collected_usdc:"0"
  };
  if(!offline){
    try{
      const response=await fetch(item.api_url,{
        method:"POST",redirect:"error",headers:{
          "Accept":"application/json","Content-Type":"application/json",
          "Cache-Control":"no-store","User-Agent":"GeoMacro-100-NoFunds-Audit/1.0"
        },body:JSON.stringify(payload),signal:AbortSignal.timeout(12000)
      });
      item.http_status=response.status;
      const contentType=response.headers.get("content-type")??"";
      const buf=await response.text();
      const safeLength=buf.length<=100_000 && contentType.includes("application/json");
      const json=safeLength?JSON.parse(buf):null;
      item.error_code=errorCode(json);
      item.status="RESPONDED";
      item.payment_challenge_present=Boolean(response.headers.get("payment-required"));
      item.delivered_product_hash_present=Boolean(response.headers.get("x-geomacro-delivery-sha256"));
      if(!safeLength){
        item.classification="REAL_NON_JSON_RESPONSE";
        item.error_code="NON_JSON_OR_OVERSIZED";
        item.response_json={content_type:contentType.slice(0,80)};
      }else if(response.status===402){
        item.classification="PROVEN_ELIGIBLE_X402_CHALLENGE_NO_PAYMENT";
        // Deliberately do not republish merchant account/payment header.
        item.response_json={x402Version:json?.x402Version??null,
          resource_present:Boolean(json?.resource),
          accepted_network_count:Array.isArray(json?.accepts)?json.accepts.length:0};
      }else if(response.status===200){
        // A paid 200 without a PAYMENT-SIGNATURE is unexpected. Retain a
        // sanitized shaped evidence object, but do not expose raw payload.
        item.classification="SECURITY_UNPAID_PAID_PRODUCT_DELIVERY";
        item.response_json={schema_version:json?.schema_version??null,
          product:json?.product??null,
          answer_status:json?.answer?.status??null,
          paid_delivery_without_signature:true,
          source_private:json?.raw_data_delivered===false,
          structural_rows:Array.isArray(json?.structural)?json.structural.length:null};
      }else if(response.status===422||response.status===400||response.status===503||
        response.status===409||response.status===403||response.status===404){
        item.classification="REAL_CANONICAL_NO_CHARGE_REFUSAL";
        item.response_json={ok:json?.ok??false,chargeable:json?.chargeable??null,
          payment_authorized:json?.payment_authorized??null,
          error:{code:item.error_code??"UNSPECIFIED"}};
      }else if(response.status===429){
        item.classification="REAL_RATE_LIMIT_REFUSAL";
        item.response_json={error:{code:item.error_code??"RATE_LIMIT"}};
      }else {
        item.classification="REAL_UNEXPECTED_HTTP_STATUS";
        item.response_json={error:{code:item.error_code??"UNEXPECTED_RESPONSE"}};
      }
    }catch(error){
      item.status="NETWORK_FAILURE";item.classification="NETWORK_OR_JSON_READ_FAILED";
      item.error_code=scrub(error?.name??"REQUEST_FAILED");
    }
    // Bounded requests: <= 9.5/min for each API namespace, never storm D1.
    if(index<cases.length-1)await new Promise(r=>setTimeout(r,plannedDelay));
  }
  records.push(item);
}
const classes={};for(const row of records)classes[row.classification]=(classes[row.classification]??0)+1;
const summary={
  schema:"geomacro.100-exact-questions-real-production-no-funds.v1",
  generated_at:new Date().toISOString(),source:"geomacro.live",questions_sha256:EXPECTED_SHA,
  same_original_questions:true,cases:100,categories:categoryCount,sku_distribution:skuCount,
  requests_attempted:offline?0:100,
  real_paid_structured_responses_without_payment:classes.SECURITY_UNPAID_PAID_PRODUCT_DELIVERY??0,
  eligible_x402_challenges:classes.PROVEN_ELIGIBLE_X402_CHALLENGE_NO_PAYMENT??0,
  canonical_no_charge_refusals:classes.REAL_CANONICAL_NO_CHARGE_REFUSAL??0,
  network_or_json_failures:classes.NETWORK_OR_JSON_READ_FAILED??0,
  classification_counts:classes,
  actual_payer_settlements:0,real_usdc_spent:"0",predge_modified:false,
  result_interpretation:"Refusals and 402 preflight are real production outcomes, NOT 100 paid answers.",
};
writeFileSync(resultDir+"/summary.json",JSON.stringify(summary,null,2)+"\n");
writeFileSync(resultDir+"/100-original-questions-real-responses.json",JSON.stringify({
  summary,results:records},null,2)+"\n");
console.log(JSON.stringify(summary));
if(!offline&&((classes.SECURITY_UNPAID_PAID_PRODUCT_DELIVERY??0)>0||
  (classes.NETWORK_OR_JSON_READ_FAILED??0)>20))
  process.exitCode=2;
