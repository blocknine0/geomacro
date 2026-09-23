export async function probeSource({sourceId,category,url,validate=()=>true,headers={}}){
 const started=Date.now();
 try{
  const res=await fetch(url,{headers:{accept:"application/json,text/html",...headers},redirect:"follow"});
  const body=await res.text();
  if(!res.ok) return {source_id:sourceId,category,status:"FAIL",checked_at:new Date().toISOString(),latency_ms:Date.now()-started,error:`HTTP ${res.status}`};
  if(!validate(body,res)) return {source_id:sourceId,category,status:"DEGRADED",checked_at:new Date().toISOString(),latency_ms:Date.now()-started,error:"response validation failed"};
  return {source_id:sourceId,category,status:"PASS",checked_at:new Date().toISOString(),latency_ms:Date.now()-started,coverage:{}};
 }catch(error){
  return {source_id:sourceId,category,status:"FAIL",checked_at:new Date().toISOString(),latency_ms:Date.now()-started,error:String(error.message||error)};
 }
}