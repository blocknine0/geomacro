const EXPECTED_SERVICE="geomacro-unified-ingestor";

export function normalizeUnifiedIngestorHealthUrl(value){
 if(typeof value!=="string"||value.length>512)return null;
 try{
  const url=new URL(value);
  if(url.protocol!=="https:"||!url.hostname.endsWith(".onrender.com")||
     url.username||url.password||url.pathname!=="/healthz"||url.search||url.hash||
     url.port)return null;
  return url.href;
 }catch{return null}
}

export async function pingUnifiedIngestorHealth(env,{fetchImpl=globalThis.fetch,
 timeoutMs=120_000}={}){
 const url=normalizeUnifiedIngestorHealthUrl(env?.GEOMACRO_UNIFIED_INGESTOR_HEALTH_URL);
 if(!url)return {ok:true,skipped:true,reason:"HEALTH_URL_NOT_CONFIGURED"};
 try{
  const response=await fetchImpl(url,{method:"GET",redirect:"manual",
   headers:{Accept:"application/json"},signal:AbortSignal.timeout(timeoutMs)});
  if(response.status<200||response.status>=300||response.redirected)
   return {ok:false,error:"INGESTOR_HEALTH_HTTP_UNAVAILABLE",status:response.status};
  const body=await response.json();
  if(body?.ok!==true||body?.service!==EXPECTED_SERVICE)
   return {ok:false,error:"INGESTOR_HEALTH_ACK_INVALID",status:response.status};
  return {ok:true,status:response.status};
 }catch{return {ok:false,error:"INGESTOR_HEALTH_PING_UNAVAILABLE"}}
}
