import {describe,it,expect} from "vitest";
import {createHash,generateKeyPairSync} from "node:crypto";
import {mkdtempSync,writeFileSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {
  assertMachineStageEnvironment,readMachineStageInput,
  machineStageDispatchPayload,stageMachineIntelligence,
} from "../../scripts/ops/stage-approved-machine-intelligence-b2.mjs";

const sha=(raw:Buffer)=>createHash("sha256").update(raw).digest("hex");
function publicKey(){
 const {publicKey}=generateKeyPairSync("ed25519");
 const spki=publicKey.export({format:"der",type:"spki"}) as Buffer;
 return {pem:publicKey.export({format:"pem",type:"spki"}).toString(),
   hash:sha(spki),spki:spki.toString("base64")};
}
const facts=publicKey(),rights=publicKey(),gro=publicKey();
function fixture(){
 const root=mkdtempSync(join(tmpdir(),"geomacro-machine-stage-"));
 const input={rows:[{id:"a"},{id:"b"},{id:"c"}],
  eventPackages:["geopolitics","macro","rare_earth"].map(category=>({category}))};
 const bytes=Buffer.from(JSON.stringify(input));
 const path=join(root,"approved-machine.json");
 writeFileSync(path,bytes,{mode:0o600});
 const pin=sha(bytes);
 const env={
  GEOMACRO_QUALIFIED_INTELLIGENCE_INPUT:path,
  GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256:pin,
  B2_ACCOUNT_QUOTA_REQUIRED:"1",B2_ACCOUNT_QUOTA_WORKFLOW_ID:"machine_intelligence_signed_staging",
  B2_REQUEST_BUDGET:"6",B2_KEY_ID:"test",B2_APPLICATION_KEY:"synthetic",
  D1_DATABASE_ID:"synthetic",CLOUDFLARE_API_TOKEN:"synthetic",
  CLOUDFLARE_ACCOUNT_ID:"synthetic",
  GEOMACRO_COMMERCE_LEDGER_TOKEN:"synthetic_ledger_token_more_than_32_chars",
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_PEM:facts.pem,
  GEOMACRO_MACHINE_FACTS_PUBLIC_KEY_SHA256:facts.hash,
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_PEM:rights.pem,
  GEOMACRO_MACHINE_RIGHTS_PUBLIC_KEY_SHA256:rights.hash,
  RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64:gro.spki,
 };
 return {root,bytes,pin,env,cleanup:()=>rmSync(root,{recursive:true,force:true})};
}
function archive(){
 const store=new Map<string,Buffer>();
 let reads=0;
 return {client:{
   getOptional:async (key:string)=>{reads++;return store.get(key)||null;},
   put:async (key:string,bytes:Buffer)=>{store.set(key,Buffer.from(bytes));},
   get:async (key:string)=>{reads++;return store.get(key)!;},
   usage:()=>({requests_started:reads}),
 },store};
}
const approve=async()=>({qualified_until:new Date(Date.now()+30*60_000).toISOString(),
 receipt:{commercial_event_admission:true,qualified_event_count:3}});
describe("owner-private dual-signed immutable Intelligence staging",()=>{
 it("rejects forged byte pin, unscoped source, and unapproved funds config before network",()=>{
  const f=fixture();
  try{
   expect(readMachineStageInput({env:f.env}).pin).toBe(f.pin);
   expect(()=>readMachineStageInput({env:{...f.env,
     GEOMACRO_QUALIFIED_INTELLIGENCE_SHA256:"a".repeat(64)}})).toThrow();
   expect(()=>assertMachineStageEnvironment({...f.env,COINBASE_API_KEY:"forbidden"})).toThrow();
   expect(()=>assertMachineStageEnvironment({...f.env,B2_ACCOUNT_QUOTA_REQUIRED:"0"})).toThrow();
   expect(()=>machineStageDispatchPayload("geomacro-evidence/private/untrusted.json",f.pin)).toThrow();
  }finally{f.cleanup()}
 });
 it("refuses missing signature/rights admission without any B2 access",async()=>{
  const f=fixture();let opened=0;
  try{
   await expect(stageMachineIntelligence({env:f.env,qualifier:async()=>{throw Error("NOT_QUALIFIED")},
     archiveClient:()=>{opened++;throw Error("FORBIDDEN")}})).rejects.toThrow();
   expect(opened).toBe(0);
  }finally{f.cleanup()}
 });
 it("uploads only exact approved private bytes; no payment, public claim or automatic dispatch",async()=>{
  const f=fixture();const b=archive();
  try{
   const r=await stageMachineIntelligence({env:f.env,qualifier:approve,archiveClient:()=>b.client});
   expect(r.exact_private_b2_readback_verified).toBe(true);
   expect(r.publisher_dispatch_accepted).toBe(false);
   expect(r.current_public_intelligence_verified).toBe(false);
   expect(r.b2_writes).toBe(1);
   expect(b.store.get(r.immutable_b2_key)).toEqual(f.bytes);
   const retry=await stageMachineIntelligence({env:f.env,qualifier:approve,archiveClient:()=>b.client});
   expect(retry.b2_writes).toBe(0);
  }finally{f.cleanup()}
 });
 it("dispatches only after exact B2 readback and explicit no-funds consent",async()=>{
  const f=fixture();const b=archive();let dispatched=0;
  const env={...f.env,MACHINE_SIGNED_READY_DISPATCH_ACK:"YES_NO_FUNDS",
   GITHUB_TOKEN:"synthetic_github_token_1234567890123456"};
  try{
   const r=await stageMachineIntelligence({env,qualifier:approve,archiveClient:()=>b.client,
    fetchImpl:async(url:string,init:RequestInit)=>{
      dispatched++;
      expect(url).toBe("https://api.github.com/repos/blocknine0/geomacro/dispatches");
      const payload=JSON.parse(String(init.body));
      expect(payload.event_type).toBe("machine_intelligence_dual_signed_ready");
      expect(payload.client_payload.machine_b2_sha256).toBe(f.pin);
      expect(b.store.has(payload.client_payload.machine_b2_key)).toBe(true);
      return {status:204} as Response;
    }});
   expect(dispatched).toBe(1);
   expect(r.publisher_dispatch_accepted).toBe(true);
   expect(r.publisher_published).toBe(false);
  }finally{f.cleanup()}
 });
 it("rejects corrupt B2 readback and never dispatches",async()=>{
  const f=fixture();const b=archive();let sent=0;
  try{
   b.client.get=async()=>Buffer.from("TAMPERED");
   await expect(stageMachineIntelligence({env:{...f.env,
     MACHINE_SIGNED_READY_DISPATCH_ACK:"YES_NO_FUNDS",
     GITHUB_TOKEN:"synthetic_github_token_1234567890123456"},
     qualifier:approve,archiveClient:()=>b.client,
     fetchImpl:async()=>{sent++;return {status:204} as Response;},
   })).rejects.toThrow("EXACT_PRIVATE_B2_READBACK_REQUIRED");
   expect(sent).toBe(0);
  }finally{f.cleanup()}
 });
});
