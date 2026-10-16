import {describe,it,expect,vi} from "vitest";
import {readFileSync} from "node:fs";
import {
  CREDENTIALED_SOURCE_ACCOUNTS,
  probeConfiguredCredentialedSources,
} from "../../global-intelligence/scripts/probe-credentialed-sources.mjs";

const when=()=>new Date("2026-10-11T09:00:00.000Z");
const allCredentials=Object.fromEntries(
  CREDENTIALED_SOURCE_ACCOUNTS.map(x=>[x.env,"private-token-do-not-emit"])
);
const validProbe=vi.fn(async id=>{
  const row=CREDENTIALED_SOURCE_ACCOUNTS.find(s=>s.id===id);
  return {source_id:id,category:row?.category};
});

describe("#1827 independently activate configured credentialed sources",()=>{
  it("uses one bounded 30s BEA/UCDP read while other providers keep 15s",()=>{
    const adapter=readFileSync("global-intelligence/adapters/credentialed-sources.mjs","utf8");
    expect(adapter).toContain('sourceId==="bea"?30000:sourceId==="ucdp_ged"?30000:15000');
    expect(adapter).toContain("method=GetDataSetList&ResultFormat=JSON");
    expect(adapter).toContain('const raw = await getJson(url, {headers: config.headers?.(key) || {},timeoutMs,maxBytes:256*1024,redirect:"error"})');
  });
  it("does not block healthy sources when a different provider key is missing",async()=>{
    const env={...allCredentials};
    delete env.BEA_API_KEY;
    const probe=vi.fn(async id=>{
      const source=CREDENTIALED_SOURCE_ACCOUNTS.find(s=>s.id===id)!;
      return {source_id:id,category:source.category};
    });
    const receipt=await probeConfiguredCredentialedSources({env,probe,now:when});
    expect(probe).toHaveBeenCalledTimes(7);
    expect(probe).not.toHaveBeenCalledWith("bea");
    expect(receipt.status).toBe("CONFIGURED_SOURCES_WORKING_PARTIAL");
    expect(receipt.working).toBe(7);
    expect(receipt.configured_failed).toBe(0);
    expect(receipt.results.find((r:any)=>r.source_id==="bea").status).toBe("CREDENTIAL_NOT_CONFIGURED");
    expect(receipt.per_domain.GEOPOLITICS.working).toBe(3);
    expect(receipt.per_domain.CRITICAL_MINERALS.working).toBe(1);
    expect(receipt.b2_requests+receipt.d1_writes+receipt.supabase_writes).toBe(0);
    expect(receipt.commercial_eligible).toBe(false);
  });
  it("records every configured upstream failure and never exposes a secret URL, key or body",async()=>{
    const receipt=await probeConfiguredCredentialedSources({
      env:allCredentials,now:when,
      probe:async id=>{
        if(id==="opensanctions")throw Error("https://api.example?q=private-token-do-not-emit");
        return validProbe(id);
      },
    });
    expect(receipt.status).toBe("CONFIGURED_SOURCES_DEGRADED");
    expect(receipt.working).toBe(7);
    expect(receipt.configured_failed).toBe(1);
    expect(JSON.stringify(receipt)).not.toContain("private-token-do-not-emit");
    expect(JSON.stringify(receipt)).not.toContain("api.example");
    expect(receipt.results.find((r:any)=>r.source_id==="opensanctions").status)
      .toBe("CONFIGURED_BUT_PROBE_FAILED");
    expect(receipt.results.find((r:any)=>r.source_id==="opensanctions").reason)
      .toBe("UPSTREAM_UNKNOWN_FAILURE");
  });
  it("classifies BEA upstream HTTP errors without copying token-bearing URL or body",async()=>{
    const report=await probeConfiguredCredentialedSources({
      env:allCredentials,now:when,
      probe:async id=>{
        if(id==="bea")throw Error("HTTP 403 for https://apps.bea.gov/api/data?UserID=private-token-do-not-emit: credentials rejected");
        return validProbe(id);
      },
    });
    const failure=report.results.find((r:any)=>r.source_id==="bea");
    expect(failure.status).toBe("CONFIGURED_BUT_PROBE_FAILED");
    expect(failure.reason).toBe("HTTP_403");
    expect(JSON.stringify(report)).not.toContain("private-token-do-not-emit");
  });
  it("distinguishes bounded-body, redirect and connection failures without leaking error content",async()=>{
    for(const [failure,reason] of [
      [Error('HTTP_BODY_LIMIT'),'RESPONSE_SIZE_LIMIT'],
      [new TypeError('fetch failed: private-token-do-not-emit',{cause:Error('unexpected redirect')}),'REDIRECT_REFUSED'],
      [new TypeError('fetch failed: private-token-do-not-emit',{cause:Object.assign(Error('private-token-do-not-emit'),{code:'ECONNRESET'})}),'UPSTREAM_CONNECTION_FAILURE'],
    ] as const){
      const r=await probeConfiguredCredentialedSources({env:allCredentials,now:when,probe:async()=>{throw failure;}});
      expect(r.results.every((x:any)=>x.reason===reason)).toBe(true);
      expect(JSON.stringify(r)).not.toContain('private-token-do-not-emit');
    }
  });
  it("does not attempt network when no credentials exist or a result has wrong domain",async()=>{
    const probe=vi.fn();
    const empty=await probeConfiguredCredentialedSources({env:{},probe,now:when});
    expect(probe).not.toHaveBeenCalled();
    expect(empty.status).toBe("NO_CREDENTIALS_CONFIGURED");
    expect(empty.missing_credentials).toBe(8);
    const wrong=await probeConfiguredCredentialedSources({env:allCredentials,
      probe:async id=>({source_id:id,category:"INVALID"}),now:when});
    expect(wrong.configured_failed).toBe(8);
    expect(wrong.working).toBe(0);
  });
});
