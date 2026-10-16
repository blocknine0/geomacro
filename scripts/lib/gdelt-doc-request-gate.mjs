// One bounded in-process DOC request at a time across concurrent callers.
// This is not a fleet-wide quota guarantee or permission to bypass denial.
export function gdeltRetryAfterMs(value,now=Date.now()){
  const seconds=/^\d{1,8}$/.test(String(value??"").trim())?Number(String(value).trim()):NaN;
  const until=Number.isFinite(seconds)?now+seconds*1000:Date.parse(value??"");
  return !Number.isFinite(until)||until<=now?15*60_000:Math.max(15*60_000,Math.min(31*86400_000,until-now));
}
function pause(ms,signal){
  return new Promise((resolve,reject)=>{
    if(signal?.aborted)return reject(Error("ON_DEMAND_PROVIDER_COOLDOWN"));
    const abort=()=>{clearTimeout(timer);signal?.removeEventListener("abort",abort);reject(Error("ON_DEMAND_PROVIDER_COOLDOWN"));};
    const timer=setTimeout(()=>{signal?.removeEventListener("abort",abort);resolve();},ms);
    signal?.addEventListener("abort",abort,{once:true});
  });
}
export function createGdeltDocRequestGate({clock=Date.now,wait=pause}={}){
  let active=false,nextAt=0,blockedUntil=0;
  return async(url,init={},fetchImpl=fetch)=>{
    const target=new URL(String(url));
    if(target.origin!=="https://api.gdeltproject.org"||target.pathname!=="/api/v2/doc/doc"||target.username||target.password||target.hash)
      throw Error("GDELT_DOC_SCOPE_INVALID");
    if(active||clock()<blockedUntil||init.signal?.aborted)throw Error("ON_DEMAND_PROVIDER_COOLDOWN");
    active=true;
    try{
      if(nextAt>clock())await wait(nextAt-clock(),init.signal);
      if(init.signal?.aborted||clock()<blockedUntil)throw Error("ON_DEMAND_PROVIDER_COOLDOWN");
      nextAt=clock()+5500;
      const response=await fetchImpl(url,{...init,redirect:"error"});
      if(response.status===429)blockedUntil=clock()+gdeltRetryAfterMs(response.headers.get("retry-after"),clock());
      if(response.status===401||response.status===403)blockedUntil=clock()+60*60_000;
      return response;
    }finally{active=false;}
  };
}
export const fetchGdeltDocWithBudget=createGdeltDocRequestGate();
