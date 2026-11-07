/** Main-only protected deployment. No credentials or payment signatures logged. */
import {createHmac,createPrivateKey,createPublicKey,createHash,verify} from 'node:crypto';
import {readFileSync,writeFileSync,appendFileSync,unlinkSync} from 'node:fs';
import {spawnSync} from 'node:child_process';
import {resolve} from 'node:path';
const env=process.env,required=['CLOUDFLARE_API_TOKEN','CLOUDFLARE_ACCOUNT_ID','ROOT_LEDGER_TOKEN','RISK_GATE_SUPABASE_SERVICE_ROLE_KEY'];
if(env.GITHUB_REF!=='refs/heads/main'||env.GITHUB_REPOSITORY!=='blocknine0/geomacro')throw Error('MAIN_ONLY_DEPLOYMENT');
for(const name of required)if(!env[name]||env[name].length<20)throw Error(`${name}_MISSING`);
const root=resolve('services/commercial-api'),config=JSON.parse(readFileSync(root+'/wrangler.jsonc','utf8'));
const seed=createHmac('sha256',env.ROOT_LEDGER_TOKEN).update('geomacro.commercial-risk-receipt.ed25519.v1').digest();
const privateBytes=Buffer.concat([Buffer.from('302e020100300506032b657004220420','hex'),seed]);
const privateKey=createPrivateKey({key:privateBytes,format:'der',type:'pkcs8'});
const publicBytes=createPublicKey(privateKey).export({format:'der',type:'spki'});
const routeZone=String(env.COMMERCIAL_ROUTE_ZONE_ID??'');
if(routeZone){
 if(!/^[a-f0-9]{32}$/.test(routeZone))throw Error('COMMERCIAL_ROUTE_ZONE_ID_INVALID');
 config.routes=['api.geomacro.live/v1/risk-gate','api.geomacro.live/v1/api-keys*','api.geomacro.live/v1/commercial/*','api.geomacro.live/payments/paypal/*']
  .map(pattern=>({pattern,zone_id:routeZone}));
 config.vars.PUBLIC_API_ORIGIN='https://api.geomacro.live';
}
const keyId='geomacro-commercial-'+createHash('sha256').update(publicBytes).digest('hex').slice(0,16);
const secrets={
 COMMERCIAL_SUPABASE_KEY:env.RISK_GATE_SUPABASE_SERVICE_ROLE_KEY,
 COMMERCIAL_ACCEPTANCE_TOKEN:createHmac('sha256',env.ROOT_LEDGER_TOKEN).update('geomacro.commercial-api.no-funds-acceptance.v1').digest('hex'),
 COMMERCIAL_SIGNING_PRIVATE_PKCS8_B64:privateBytes.toString('base64'),
 COMMERCIAL_SIGNING_PUBLIC_SPKI_B64:publicBytes.toString('base64'),
};
const aliases={PAYPAL_CLIENT_ID:'GEOMACRO_PAYPAL_CLIENT_ID',PAYPAL_CLIENT_SECRET:'GEOMACRO_PAYPAL_CLIENT_SECRET',
 PAYPAL_WEBHOOK_ID:'GEOMACRO_PAYPAL_WEBHOOK_ID',PAYPAL_MERCHANT_ID:'GEOMACRO_PAYPAL_MERCHANT_ID',
 X402_PAYEE_ADDRESS:'COINBASE_X402_PAY_TO',BASE_RPC_URL:'BASE_RPC_URL',
 X402_FACILITATOR_HEADERS_JSON:'COMMERCIAL_X402_FACILITATOR_HEADERS_JSON',
 RISK_GATE_TIERED_TOKEN:'RISK_GATE_TIERED_TOKEN'};
for(const [target,source]of Object.entries(aliases))if(env[source])secrets[target]=env[source];
const paypalComplete=['PAYPAL_CLIENT_ID','PAYPAL_CLIENT_SECRET','PAYPAL_WEBHOOK_ID','PAYPAL_MERCHANT_ID'].every(k=>secrets[k])&&!!env.PAYPAL_CATALOG_JSON;
const x402Complete=!!(secrets.X402_PAYEE_ADDRESS&&secrets.BASE_RPC_URL&&env.COMMERCIAL_X402_FACILITATOR_URL);
// This Step B xpay integration is no-funds-only even if an old real-funds ACK exists.
// A separately reviewed future release must explicitly lift this hard code gate.
const xpayNoFundsOnly=String(env.COMMERCIAL_X402_FACILITATOR_URL??'').replace(/\/$/u,'')==='https://facilitator.xpay.sh';
config.vars={...config.vars,DEPLOYED_SHA:env.GITHUB_SHA,COMMERCIAL_SIGNING_KEY_ID:keyId,
 PAYPAL_MODE:env.GEOMACRO_PAYPAL_ENVIRONMENT||'sandbox',
 PAYPAL_ENABLED:String(Boolean(paypalComplete)),X402_ENABLED:String(Boolean(x402Complete&&!xpayNoFundsOnly)),
 X402_FACILITATOR_URL:env.COMMERCIAL_X402_FACILITATOR_URL||'',
 PAYPAL_CATALOG_JSON:env.PAYPAL_CATALOG_JSON||'',
 GEOMACRO_COMMERCIAL_LAUNCH_ACK:'I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH',
 GEOMACRO_REAL_FUNDS_SECURITY_ACK:env.GEOMACRO_REAL_FUNDS_SECURITY_ACK||'',
 GEOMACRO_PAYPAL_KYC_RECEIVE_ACK:env.GEOMACRO_PAYPAL_KYC_RECEIVE_ACK||'',
 GEOMACRO_COMMERCE_EMERGENCY_FREEZE:env.GEOMACRO_COMMERCE_EMERGENCY_FREEZE||'',
 GEOMACRO_COMMERCE_DISABLED_PROVIDERS:env.GEOMACRO_COMMERCE_DISABLED_PROVIDERS||'',
 COMMERCIAL_VERIFY_KEYS_JSON:env.COMMERCIAL_VERIFY_KEYS_JSON||'',
};
const configPath=root+'/wrangler.runtime.jsonc';writeFileSync(configPath,JSON.stringify(config,null,2));
const wrangler=(args,options={})=>{
 const result=spawnSync('npx',['--yes','wrangler@4.136.3',...args,'--config',configPath],
  {cwd:root,env:{...env,WRANGLER_SEND_METRICS:'false'},encoding:'utf8',maxBuffer:2_000_000,...options});
 if(result.status!==0){
  let diagnostic=String(result.stderr||result.stdout||'').slice(-6000);
  for(const value of [...Object.values(secrets),env.CLOUDFLARE_API_TOKEN,env.ROOT_LEDGER_TOKEN])
   if(value)diagnostic=diagnostic.split(value).join('[REDACTED]');
  console.error(diagnostic);throw Error('COMMERCIAL_WRANGLER_FAILED');
 }return result.stdout;
};
try{
 // Preserve provider secrets on every redeploy. An incomplete rail stays disabled.
 const upload=JSON.stringify(secrets);
 for(const value of Object.values(secrets))if(typeof value==='string'&&value.length>20)console.log('::add-mask::'+value);
 wrangler(['deploy']);
 wrangler(['secret','bulk'],{input:upload});
 const deployOutput=wrangler(['deploy']);
 const origins=deployOutput.match(/https:\/\/geomacro-commercial-api\.[a-z0-9-]+\.workers\.dev/g);
 if(!origins?.length)throw Error('COMMERCIAL_WORKER_ORIGIN_MISSING');
 const origin=origins.at(-1);
 let health;
 for(let i=0;i<8;i++){
  try{const r=await fetch(origin+'/health',{signal:AbortSignal.timeout(8000)});const v=await r.json();
   if(r.ok&&v.deployed_sha===env.GITHUB_SHA){health=v;break;}}catch{}
  await new Promise(r=>setTimeout(r,1000));
 }
 if(!health)throw Error('COMMERCIAL_EXACT_SHA_READBACK_FAILED');
 const r=await fetch(origin+'/v1/readiness',{signal:AbortSignal.timeout(15000)}),ready=await r.json();
 if(!r.ok||ready.ledger_verified!==true)throw Error('COMMERCIAL_POSTGRES_READBACK_FAILED');
 const jwks=await (await fetch(origin+'/.well-known/jwks.json')).json();
 if(!jwks.keys?.some(k=>k.kid===keyId&&k.crv==='Ed25519'))throw Error('COMMERCIAL_PUBLIC_KEY_READBACK_FAILED');
 let evidenceProof={status:'NOT_PROBED'};
 if(config.vars.PUBLIC_API_ORIGIN){
  const canonical=await fetch(config.vars.PUBLIC_API_ORIGIN+'/v1/commercial/health',{signal:AbortSignal.timeout(15000)});
  const canonicalHealth=await canonical.json();
  if(!canonical.ok||canonicalHealth.deployed_sha!==env.GITHUB_SHA)throw Error('COMMERCIAL_API_ORIGIN_SHA_MISMATCH');
  const noFunds=await fetch(origin+'/v1/internal/commercial-acceptance',{method:'POST',
   headers:{Authorization:'Bearer '+secrets.COMMERCIAL_ACCEPTANCE_TOKEN},signal:AbortSignal.timeout(30000)});
  const body=await noFunds.json();
  if(noFunds.ok){
   const {audit_receipt,...payload}=body;
   const canonicalize=v=>v===null||typeof v!=='object'?JSON.stringify(v):Array.isArray(v)?'['+v.map(canonicalize).join(',')+']':
    '{'+Object.keys(v).sort().map(k=>JSON.stringify(k)+':'+canonicalize(v[k])).join(',')+'}';
   const bytes=Buffer.from(canonicalize(payload));
   if(payload.execution_authorized!==false||payload.metadata?.certified_risk_index!==false||payload.payment_attempted!==false||
    audit_receipt.public_key_id!==keyId||audit_receipt.hash!==createHash('sha256').update(bytes).digest('hex')||
    !verify(null,bytes,createPublicKey(privateKey),Buffer.from(audit_receipt.signature,'base64')))
    throw Error('COMMERCIAL_NO_FUNDS_PROOF_INVALID');
   evidenceProof={status:'GENUINE_BASIC_ACTIVITY_ADVISORY_VERIFIED',certified_risk_index:false};
  }else evidenceProof={status:'EVIDENCE_BLOCKED_NO_CHARGE',code:body.error??'UPSTREAM_UNAVAILABLE'};
 }
 const summary={schema:'geomacro.commercial-api-deployment.v1',origin,deployed_sha:env.GITHUB_SHA,
  public_api_origin:config.vars.PUBLIC_API_ORIGIN,custom_api_route_attached:Boolean(config.routes?.length),
  ledger_verified:true,signer_verified:health.signer_configured===true,
  paypal_configured:health.paypal_configured,x402_configured:health.x402_configured,
  blockers:health.blockers,evidence_proof:evidenceProof,xpay_no_funds_only:xpayNoFundsOnly,real_payment_attempted:false};
 console.log(JSON.stringify(summary));
 if(env.GITHUB_STEP_SUMMARY)appendFileSync(env.GITHUB_STEP_SUMMARY,'\n'+JSON.stringify(summary,null,2)+'\n');
}catch(error){console.error(error.message);process.exitCode=1;}
finally{unlinkSync(configPath);}
