/**
 * Strict provider read-only proof that production Phase2H reference-only
 * writer/reader switches are disabled when no production HMAC exists.
 *
 * This is NOT proof of existing R2 pointer bytes or signing-key custody.
 * No Cloudflare changes; never output private bindings or tokens.
 */
const fail=x=>{throw Error("STEP3_PRODUCTION_REF_OFF_"+x)};
const ACCOUNT=/^[a-f0-9]{32}$/iu;
const UUID=/^[a-f0-9]{8}(?:-[a-f0-9]{4}){3}-[a-f0-9]{12}$/iu;
const WRITER="GEOMACRO_PHASE2H_REF_ONLY_V1";
const READER="GEOMACRO_PHASE2H_REF_ONLY_READERS_V1";
const HMAC="PHASE2H_R2_REFERENCE_HMAC_KEY";
async function getJson(url,token,fetchImpl){
 let r;
 try{r=await fetchImpl(url,{
  method:"GET",cache:"no-store",redirect:"error",
  headers:{Authorization:"Bearer "+token,"Cache-Control":"no-store"},
  signal:AbortSignal.timeout(15000)
 })}catch{fail("PROVIDER_GET_UNAVAILABLE")}
 if(r?.status!==200||r.redirected)fail("PROVIDER_GET_NOT_200");
 let obj;
 try{obj=await r.json()}catch{fail("PROVIDER_JSON_INVALID")}
 if(obj?.success!==true||typeof obj.result!=="object")
  fail("PROVIDER_RESPONSE_UNVERIFIED");
 return obj.result;
}
export function classifyProductionRefOnlySettings({bindings,deployedVersions}={}){
 if(!Array.isArray(bindings)||bindings.length===0||
    new Set(bindings.map(b=>b?.name)).size!==bindings.length)
  fail("MISSING_OR_DUPLICATE_SETTINGS_BINDINGS");
 const relevant=[WRITER,READER,HMAC];
 for(const name of relevant){
  const b=bindings.find(x=>x.name===name);
  if(!b)continue;
  if(name===HMAC){
   // The caller omitted production HMAC specifically because this must
   // be an UNUSED first-time ref-only lane. An existing deployed key
   // with unknown value requires original-key recovery, not key bypass.
   fail("EXISTING_DEPLOYED_HMAC_REQUIRES_ORIGINAL_KEY");
  }
  if(b.type!=="plain_text"||b.text!=="0")
   fail("REFERENCE_ONLY_WRITER_OR_READER_NOT_EXPLICITLY_DISABLED");
 }
 if(!Array.isArray(deployedVersions)||deployedVersions.length!==1||
    !UUID.test(deployedVersions[0]?.version_id??"")||
    deployedVersions[0]?.percentage!==100)
  fail("PRODUCTION_VERSION_DEPLOYMENT_AMBIGUOUS");
 return Object.freeze({
  status:"PASS_REAL_PROVIDER_PRODUCTION_REFERENCE_ONLY_SWITCHES_OFF",
  source:"CLOUDFLARE_DEPLOYED_WORKER_SETTINGS_AND_VERSION",
  writer_enabled:false,reader_enabled:false,
  deployed_version_count:1,
  production_hmac_deployed:false,
  real_production_pointer_hmac_verified:false,
  remote_writes:0,
  production_cutover_authorized:false,
  canary_promoted:false
 });
}
export async function verifyProductionRefOnlyOff({
 env=process.env,fetchImpl=fetch
}={}){
 if(!ACCOUNT.test(env.CLOUDFLARE_ACCOUNT_ID??"")||
    typeof env.CLOUDFLARE_API_TOKEN!=="string"||
    env.CLOUDFLARE_API_TOKEN.length<20)
  fail("PROVIDER_IDENTITY_OR_CREDENTIAL_MISSING");
 const base="https://api.cloudflare.com/client/v4/accounts/"+
  env.CLOUDFLARE_ACCOUNT_ID+"/workers/scripts/geomacro-control-plane";
 const settings=await getJson(base+"/settings",env.CLOUDFLARE_API_TOKEN,fetchImpl);
 if(!Array.isArray(settings.bindings))
  fail("BINDING_INVENTORY_UNVERIFIED");
 const deployment=await getJson(base+"/deployments",env.CLOUDFLARE_API_TOKEN,fetchImpl);
 if(!Array.isArray(deployment.deployments)||deployment.deployments.length<1)
  fail("DEPLOYMENT_INVENTORY_UNVERIFIED");
 // The existing real Shadow proof uses the latest deployment record.
 const latest=[...deployment.deployments].sort((a,b)=>
  Date.parse(b.created_on)-Date.parse(a.created_on))[0];
 return classifyProductionRefOnlySettings({
  bindings:settings.bindings,
  deployedVersions:latest?.versions
 });
}
