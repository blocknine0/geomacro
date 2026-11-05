export type GateState="CONTINUE"|"REDUCE_LIMIT"|"REQUIRE_APPROVAL"|"PAUSE";
export type GateCheck={
 request_id:string;subject:{type:"country"|"corridor";id:string};decision:GateState;
 execution_authorized:false;audit_receipt_hash:string;audit_receipt_signature:string;
 audit_receipt_signature_scheme:"HMAC-SHA256";audit_receipt_signature_key_id:string;
 risk?:{score:number;confidence:number;generated_at:string;expires_at:string};
};
export type HistoricalTransaction={id:string;subject:{type:"country"|"corridor";id:string};occurred_at:string;amount?:number};
export type HistoricalCheck=GateCheck&{evaluated_at:string};
export class GeoMacroRiskGateClient{
 constructor(private readonly opts:{baseUrl:string;apiKey:string;fetcher?:typeof fetch}){
  if(!/^https:\/\//.test(opts.baseUrl))throw Error("HTTPS_REQUIRED");
 }
 async evaluate(input:Record<string,unknown>):Promise<GateCheck>{
  const f=this.opts.fetcher??fetch;
  const res=await f(this.opts.baseUrl.replace(/\/$/,"")+"/v1/risk-gate/tiered/evaluate",{
   method:"POST",headers:{Authorization:"Bearer "+this.opts.apiKey,"Content-Type":"application/json"},
   body:JSON.stringify(input),redirect:"error",
  });
  const body=await res.json();
  if(!res.ok||body?.execution_authorized!==false||
    typeof body?.audit_receipt_hash!=="string"||
    typeof body?.audit_receipt_signature!=="string")throw Error("RISK_GATE_CHECK_FAILED");
  return body as GateCheck;
 }
 simulateHistorical(transactions:HistoricalTransaction[],checks:HistoricalCheck[]){
  if(transactions.length>100000||checks.length>100000)throw Error("SIMULATION_LIMIT_EXCEEDED");
  const sorted=[...checks].sort((a,b)=>Date.parse(a.evaluated_at)-Date.parse(b.evaluated_at));
  const rows=transactions.map(tx=>{
   const at=Date.parse(tx.occurred_at);
   const check=sorted.filter(c=>c.subject.type===tx.subject.type&&c.subject.id===tx.subject.id&&
    Date.parse(c.evaluated_at)<=at&&Date.parse(c.risk?.expires_at??"")>at).at(-1)??null;
   return {transaction_id:tx.id,matched:!!check,decision:check?.decision??"NO_HISTORICAL_CHECK",
    advisory_exposure_ratio:check?.decision==="PAUSE"?0:check?.decision==="REQUIRE_APPROVAL"?0:
     check?.decision==="REDUCE_LIMIT"?0.5:1,execution_authorized:false as const};
  });
  const counts=Object.fromEntries(["CONTINUE","REDUCE_LIMIT","REQUIRE_APPROVAL","PAUSE","NO_HISTORICAL_CHECK"]
   .map(k=>[k,rows.filter(r=>r.decision===k).length]));
  return {schema:"geomacro.risk-gate-local-simulator.v1",checks_used:sorted.length,
   transactions:rows.length,decision_counts:counts,rows,
   fraud_prevented_estimate:null,simulation_only:true,execution_authorized:false as const};
 }
}
