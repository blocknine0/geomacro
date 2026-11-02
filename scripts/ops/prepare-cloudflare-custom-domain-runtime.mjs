/** Prepare one production Wrangler runtime for the actual Cloudflare account.
 * Never manufacture DNS, override another zone, or let an unowned custom
 * hostname disable the live D1 Worker. Domain acceptance is a SEPARATE gate.
 */
import {readFile,writeFile,appendFile} from "node:fs/promises";
import {fileURLToPath} from "node:url";
const HEX32=/^[0-9a-f]{32}$/i;
const HOST="api.geomacro.live",ZONE="geomacro.live";

export function classifyCustomDomainZone({status,payload,accountId}){
  if(status!==200||payload?.success!==true||!Array.isArray(payload.result)||
    !HEX32.test(String(accountId??"")))return null;
  const candidates=payload.result.filter(z=>
    z?.name===ZONE&&HEX32.test(String(z?.id??""))&&
    z?.account?.id===accountId&&z?.status==="active");
  return candidates.length===1?candidates[0].id:null;
}
export function prepareCustomDomainConfig(config,zoneId){
  if(!config||config.name!=="geomacro-control-plane"||
    config.workers_dev!==true||!Array.isArray(config.routes)||
    config.routes.length!==1||config.routes[0]?.pattern!==HOST||
    config.routes[0]?.custom_domain!==true)
    throw Error("API_DOMAIN_CANONICAL_RUNTIME_CONFIG_INVALID");
  const cloned=structuredClone(config);
  if(zoneId&&HEX32.test(zoneId))
    cloned.routes=[{pattern:HOST,custom_domain:true,zone_id:zoneId}];
  else delete cloned.routes;
  return cloned;
}
export async function probeDomainZone({fetcher=fetch,apiToken,accountId}){
  if(!apiToken||!HEX32.test(String(accountId??"")))return null;
  try{
    const response=await fetcher("https://api.cloudflare.com/client/v4/zones?name="+ZONE+"&per_page=5",{
      redirect:"error",
      signal:AbortSignal.timeout(12000),
      headers:{Authorization:"Bearer "+apiToken,Accept:"application/json"},
    });
    if(response.status!==200)return null;
    const body=await response.json();
    return classifyCustomDomainZone({status:response.status,payload:body,accountId});
  }catch{return null}
}
export async function prepareCustomDomainRuntime({
  path="workers/control-plane/wrangler.runtime.jsonc",
  fetcher=fetch,apiToken=process.env.CLOUDFLARE_API_TOKEN,
  accountId=process.env.CLOUDFLARE_ACCOUNT_ID,
  write=writeFile,read=readFile,
}={}){
  const original=JSON.parse(await read(path,"utf8"));
  const zoneId=await probeDomainZone({fetcher,apiToken,accountId});
  const config=prepareCustomDomainConfig(original,zoneId);
  await write(path,JSON.stringify(config,null,2)+"\n","utf8");
  return {admitted:!!zoneId,reason:zoneId?"OWNED_ACTIVE_ZONE_VERIFIED":
    "OWNER_ZONE_NOT_VISIBLE_OR_NOT_ACTIVE"};
}
if(process.argv[1]&&fileURLToPath(import.meta.url)===process.argv[1]){
  try{
    const result=await prepareCustomDomainRuntime();
    if(process.env.GITHUB_OUTPUT)
      await appendFile(process.env.GITHUB_OUTPUT,
        "admitted="+String(result.admitted)+"\n","utf8");
    console.log(result.admitted?
      "API_CUSTOM_DOMAIN_OWNER_ZONE_VERIFIED_AND_CONFIGURED":
      "API_CUSTOM_DOMAIN_OWNER_ZONE_UNAVAILABLE; core Worker safe; standalone domain health remains RED");
  }catch{
    console.error("API_CUSTOM_DOMAIN_PREFLIGHT_INTERNAL_CONFIG_FAILURE");
    process.exitCode=2;
  }
}
