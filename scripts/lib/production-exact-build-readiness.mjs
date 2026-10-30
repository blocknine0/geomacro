/**
 * Wait for the exact canonical SHA before *any* signed RPC diagnostics.
 * Prevents false negative / wasted private RPC calls while Lovable production
 * propagates a newly merged GitHub main revision. Build marker only, no secrets.
 */
export async function awaitExactGeomacroBuild({
  origin="https://geomacro.live",
  expectedSha,
  fetcher=fetch,
  sleep=ms=>new Promise(resolve=>setTimeout(resolve,ms)),
  now=()=>Date.now(),
  maxWaitMs=110000,
  intervalMs=12000,
}={}){
  if(!/^[a-f0-9]{40}$/u.test(String(expectedSha??"")))
    throw Error("EXPECTED_SHA_INVALID");
  if(!(maxWaitMs>=0&&maxWaitMs<=120000&&intervalMs>=1))
    throw Error("BUILD_WAIT_POLICY_INVALID");
  const deadline=now()+maxWaitMs;
  let lastCode="BUILD_UNAVAILABLE";
  for(;;){
    try{
      const r=await fetcher(new URL("/.well-known/geomacro-build.json",origin),{
        redirect:"error",cache:"no-store",
        headers:{"Cache-Control":"no-store"},
        signal:AbortSignal.timeout(6000),
      });
      if(r.status===200&&Number(r.headers.get("content-length")||"0")<=16384){
        const raw=await r.text();
        if(raw.length<=16384){
          const b=JSON.parse(raw);
          if(b?.canonical_repository==="blocknine0/geomacro" &&
             b?.canonical_main_sha===expectedSha)return true;
          lastCode="EXACT_SHA_NOT_PUBLISHED";
        }
      }
    }catch{lastCode="BUILD_UNAVAILABLE";}
    const remaining=deadline-now();
    if(remaining<=0)throw Error(lastCode);
    await sleep(Math.min(intervalMs,remaining));
  }
}
