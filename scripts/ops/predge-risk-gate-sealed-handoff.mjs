#!/usr/bin/env node
/**
 * Owner-only encrypted handoff for Predge's separate D1 Risk Gate token.
 * Emits RSA-OAEP ciphertext only. No plaintext, signatures, payments or GRO
 * are exported. The recipient RSA private key never leaves their machine.
 */
import {createHmac,publicEncrypt,constants,randomUUID} from "node:crypto";
import {mkdirSync,writeFileSync} from "node:fs";
import {decodeRecipientPublicKey} from "./predge-sealed-token-handoff.mjs";

export const RISK_GATE_HMAC_DOMAIN="geomacro-predge-risk-gate-v1";
export const RISK_GATE_OAEP_LABEL="geomacro.predge.risk-gate-token-handoff.v1";
export const RISK_GATE_URL="https://geomacro-control-plane.daspallab202391.workers.dev/v1/partner/predge/risk-gate";
const PATTERN=/^[a-f0-9]{64}$/;
function domain(root,label){
 if(typeof root!=="string"||root.length<32)throw Error("HANDOFF_ROOT_MISSING");
 return createHmac("sha256",root).update(label).digest("hex");
}
export function resolveRiskGateBearer({root,override=""}){
 const token=override||domain(root,RISK_GATE_HMAC_DOMAIN);
 if(!PATTERN.test(token)||token===root||
     token===domain(root,"geomacro-control-plane-v1")||
     token===domain(root,"geomacro-predge-72h-research-only-v2-20261020"))
   throw Error("HANDOFF_RISK_GATE_CREDENTIAL_INVALID_OR_REUSED");
 return token;
}
export function sealRiskGateBearer({root,override="",recipientPublicKeyB64}){
 const key=decodeRecipientPublicKey(recipientPublicKeyB64);
 const token=resolveRiskGateBearer({root,override});
 return publicEncrypt({
   key,padding:constants.RSA_PKCS1_OAEP_PADDING,oaepHash:"sha256",
   oaepLabel:Buffer.from(RISK_GATE_OAEP_LABEL)
 },Buffer.from(token,"utf8"));
}
export async function verifyLiveRiskGateBearer({root,override="",fetcher=fetch}){
 const token=resolveRiskGateBearer({root,override});
 const policy={policy_id:"predge-owner-handoff-no-funds",policy_version:"1",
   continue_max_score:20,reduce_limit_max_score:45,require_approval_max_score:70,
   minimum_confidence_for_auto_continue:0.9,
   require_commercial_verification_for_continue:true};
 const body=JSON.stringify({request_id:"owner-handoff-"+randomUUID(),
   subject:{type:"country",country_iso3:"USA"},policy});
 async function call(bearer){
   const resp=await fetcher(RISK_GATE_URL,{method:"POST",redirect:"manual",
     headers:{"content-type":"application/json",
       ...(bearer?{authorization:"Bearer "+bearer}:{})},
     body,signal:AbortSignal.timeout(10000)});
   if(resp.status>=300&&resp.status<400)throw Error("HANDOFF_REDIRECT_FORBIDDEN");
   const payload=await resp.json();
   if(payload.execution_authorized!==false)throw Error("HANDOFF_EXECUTION_BOUNDARY");
   return {status:resp.status,payload};
 }
 const anon=await call(null);
 if(anon.status!==401||anon.payload.error!=="RISK_GATE_UNAUTHORIZED")
   throw Error("HANDOFF_ANONYMOUS_NOT_DENIED");
 const result=await call(token);
 if(result.status===503&&result.payload.error==="CURRENT_SIGNED_GRO_UNAVAILABLE")
   return {authenticated:true,current_signed_gro:false};
 if(result.status===200&&result.payload.risk_gate?.execution_authorized===false)
   return {authenticated:true,current_signed_gro:true};
 throw Error("HANDOFF_RISK_GATE_LIVE_AUTH_NOT_ACCEPTED");
}
async function main(){
 if(process.argv.length!==3||process.argv[2]!=="--seal-after-live-auth")
   throw Error("HANDOFF_USAGE_INVALID");
 for(const forbidden of ["COINBASE_API_KEY","COINBASE_X402_MAINNET_ACK","SUPABASE_SERVICE_ROLE_KEY"]){
   if(process.env[forbidden])throw Error("HANDOFF_FUNDS_OR_SUPABASE_FORBIDDEN");
 }
 const root=String(process.env.ROOT_LEDGER_TOKEN??"");
 const override=String(process.env.PREDGE_RISK_GATE_TOKEN??"");
 const pub=String(process.env.RECIPIENT_RSA_PUBKEY_B64??"");
 decodeRecipientPublicKey(pub);
 const accepted=await verifyLiveRiskGateBearer({root,override});
 if(!accepted.authenticated)throw Error("HANDOFF_AUTH_UNVERIFIED");
 const ciphertext=sealRiskGateBearer({root,override,recipientPublicKeyB64:pub});
 mkdirSync("artifacts/predge-risk-gate-token",{recursive:true});
 writeFileSync("artifacts/predge-risk-gate-token/predge-risk-gate-token.rsa-oaep-sha256.bin",
   ciphertext,{mode:0o600,flag:"wx"});
 console.log(JSON.stringify({ok:true,encrypted_only:true,
   research_token_included:false,production_gro_verified:accepted.current_signed_gro,
   root_disclosed:false,payment_executed:false}));
}
if(process.argv[1]&&process.argv[1].endsWith("predge-risk-gate-sealed-handoff.mjs"))
 main().catch(()=>{console.error("RISK_GATE_ENCRYPTED_HANDOFF_FAILED");process.exitCode=3;});
