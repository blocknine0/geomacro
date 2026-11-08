#!/usr/bin/env node
/**
 * READ-ONLY remote schema acceptance for Cloudflare D1 shadow / production.
 * Does not migrate, unlock checkout, mutate data or change billing/quotas.
 * A trusted operator runs it only AFTER the protected AES-256 checkpoint and
 * owner-approved Step3+commercial schema migration.
 *
 * Output is NOT_YET_VERIFIED on any missing, malformed or partial provider
 * query. It never converts local simulations into production schema proof.
 */
import {execFileSync} from 'node:child_process';
import {writeFileSync,mkdirSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {pathToFileURL} from 'node:url';
import {resolve} from 'node:path';
const ID=/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const ACCT=/^[a-f0-9]{32}$/i;
export const REQUIRE=Object.freeze({
 users:'table',api_keys:'table',credit_ledger:'table',
 customer_payment_receipts:'table',customer_entitlement_grants:'table',
 customer_usage_receipts:'table',customer_paypal_checkout_intents:'table',
 commercial_hot50_signed_snapshots:'table',
 commercial_hot50_delivery_receipts:'table',tenant_api_keys_v1:'table',
 phase2h_raw_object_refs_v1:'table',
 tenants_v1:'view',customer_transactions_v1:'view',credit_ledger_v1:'view',
 idx_customer_receipts_user:'index',idx_customer_ledger_user_time:'index',
 idx_customer_api_keys_owner_active:'index',idx_customer_usage_user_recent:'index',
 idx_customer_usage_grant:'index',idx_commercial_hot50_live_view:'index',
 idx_commercial_hot50_receipt_snapshot:'index',
 idx_phase2h_ref_object_key_v1:'index',
 idx_phase2h_ref_country_category_clock_v1:'index',
 idx_phase2h_ref_ingest_clock_v1:'index'
});
export const BASE_REQUIRED_OBJECTS=Object.freeze(Object.fromEntries(
 Object.entries(REQUIRE).filter(([name])=>![
  'commercial_hot50_signed_snapshots','commercial_hot50_delivery_receipts',
  'tenant_api_keys_v1','tenants_v1','customer_transactions_v1','credit_ledger_v1',
  'idx_customer_usage_user_recent','idx_commercial_hot50_live_view',
  'idx_commercial_hot50_receipt_snapshot'
 ].includes(name))
));
const objectsFor=phase=>phase==='base'?BASE_REQUIRED_OBJECTS:
 phase==='full'?REQUIRE:(()=>{throw Error('COMMERCIAL_D1_SCHEMA_PHASE_INVALID')})();
export function commercialSchemaSql(phase='full'){
 return 'SELECT type,name,sql FROM sqlite_schema WHERE name IN ('+
 Object.keys(objectsFor(phase)).map(x=>"'"+x+"'").join(',')+') ORDER BY name';
}
const validRows=n=>Number.isSafeInteger(n)&&n>=0;
export function verifyCommercialD1Schema(rows,meta,phase='full'){
 const required=objectsFor(phase);
 if(!Array.isArray(rows)||rows.length!==Object.keys(required).length||
    !validRows(meta?.rows_read)||meta?.rows_written!==0)
  throw Error('COMMERCIAL_D1_SCHEMA_INCOMPLETE_OR_NOT_READ_ONLY');
 const seen=new Set();
 for(const row of rows){
  if(!Object.hasOwn(required,row.name)||seen.has(row.name)||
     row.type!==required[row.name]||typeof row.sql!=='string')
   throw Error('COMMERCIAL_D1_SCHEMA_OBJECT_MISMATCH');
  seen.add(row.name);
 }
 const sql=name=>rows.find(x=>x.name===name).sql.toLowerCase();
 if(!sql('customer_payment_receipts').includes('unique(provider,environment,provider_event_id)')||
    !sql('api_keys').includes('hmac_sha256')||
    !sql('phase2h_raw_object_refs_v1').includes('pointer_hmac_sha256')||
    !sql('idx_phase2h_ref_country_category_clock_v1').includes('risk_country_iso3'))
  throw Error('COMMERCIAL_D1_INDEX_OR_CRYPTO_CONTRACT_MISMATCH');
 if(phase==='full'&&(
    !sql('tenant_api_keys_v1').includes('key_sha256')||
    !sql('commercial_hot50_delivery_receipts').includes('foreign key')||
    !sql('commercial_hot50_signed_snapshots').includes('signature_b64')||
    !sql('idx_commercial_hot50_live_view').includes('view_key')))
  throw Error('COMMERCIAL_D1_COMMERCIAL_INDEX_OR_CRYPTO_CONTRACT_MISMATCH');
 return {schema:'geomacro.commercial-d1-physical-schema-readback.v1',
  status:'PASS',verified_phase:phase,required_object_count:rows.length,
  provider_rows_read:meta.rows_read,provider_rows_written:0,
  read_only_verified:true,
  phase2h_ref_table_present:true,
  signed_commercial_delivery_schema_present:phase==='full',
  live_data_or_actual_paypal_settlement_verified:false};
}
export function parseWranglerCommercialSchema(json,phase='full'){
 let parsed;try{parsed=JSON.parse(json);}catch{throw Error('D1_REMOTE_JSON_UNVERIFIED');}
 if(!Array.isArray(parsed)||parsed.length!==1||parsed[0]?.success!==true)
  throw Error('D1_REMOTE_PROVIDER_UNVERIFIED');
 return verifyCommercialD1Schema(parsed[0].results,parsed[0].meta,phase);
}
export function createCommercialReadbackReceipt({target,phase='full',now=new Date().toISOString()}={}){
 return {schema:'geomacro.commercial-d1-physical-schema-readback-receipt.v1',
  status:'NOT_YET_VERIFIED',target:target??'unknown',phase,checked_at:now,
  remote_schema_readback_verified:false,production_d1_mutated:false,
  aes_recovery_checkpoint_verified:false,first_real_money_pilot_verified:false,
  protected_canary_promoted:false};
}
export async function runCommercialD1Readback({env=process.env}={}){
 const target=env.GEOMACRO_COMMERCIAL_READBACK_TARGET;
 const phase=env.GEOMACRO_COMMERCIAL_READBACK_PHASE??'full';
 const receipt=createCommercialReadbackReceipt({target,phase});
 const path='artifacts/release/commercial-d1-'+(target==='shadow'?'shadow':'production')+'-readback.json';
 const write=x=>{mkdirSync('artifacts/release',{recursive:true});
  writeFileSync(path,JSON.stringify(x,null,2)+'\n',{mode:0o600});};
 write(receipt);
 const dbId=target==='shadow'?env.GEOMACRO_D1_SHADOW_DATABASE_ID:
  target==='production'?env.D1_DATABASE_ID:null;
 if(!['base','full'].includes(phase)||!dbId||!ID.test(dbId)||!ACCT.test(env.CLOUDFLARE_ACCOUNT_ID??'')||
   !env.CLOUDFLARE_API_TOKEN||env.CLOUDFLARE_API_TOKEN.length<20||
   env.GEOMACRO_COMMERCIAL_READBACK_APPROVED!=='READ_ONLY_SCHEMA_PROOF')
  throw Error('COMMERCIAL_D1_PROVIDER_ACCESS_OR_APPROVAL_REQUIRED');
 let tmp=null;
 try{
  tmp=mkdtempSync(join(tmpdir(),'geomacro-commercial-schema-'));
  const cfg=join(tmp,'wrangler.jsonc');
  writeFileSync(cfg,JSON.stringify({name:'geomacro-commercial-schema-readonly',
   compatibility_date:'2026-10-03',
   d1_databases:[{binding:'DB',database_id:dbId,
    database_name:target==='shadow'?'geomacro-d1-publisher-shadow':'geomacro-control-plane'}]}),{mode:0o600});
  const output=execFileSync('npx',['-y','wrangler@4.136.3','d1','execute','DB',
    '--remote','--json','--config',cfg,'--command',commercialSchemaSql(phase)],
   {encoding:'utf8',stdio:['ignore','pipe','pipe'],timeout:120000,maxBuffer:500000,
    env:{...env,CI:'true'}});
  const proof=parseWranglerCommercialSchema(output,phase);
  write({...receipt,...proof,remote_schema_readback_verified:true,
   receipt_is_merchant_or_backup_proof:false});
  return proof;
 }catch{throw Error('COMMERCIAL_D1_REMOTE_SCHEMA_NOT_YET_VERIFIED');}
 finally{if(tmp)rmSync(tmp,{recursive:true,force:true});}
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
 runCommercialD1Readback().then(x=>console.log(JSON.stringify(x)))
 .catch(e=>{console.error(JSON.stringify({status:'NOT_YET_VERIFIED',
  code:String(e.message).slice(0,100),no_production_mutations:true}));process.exitCode=2;});
