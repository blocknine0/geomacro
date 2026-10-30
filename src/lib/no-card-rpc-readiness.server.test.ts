import {describe,it,expect,vi} from "vitest";
import {
  rpcAuditSignature,isAuthorizedRpcAudit,runSignedRpcReadiness
} from "./no-card-rpc-readiness.server";

const token="x".repeat(48);
const now=Date.parse("2026-10-31T00:00:00Z");
const env={
  GEOMACRO_COMMERCE_LEDGER_TOKEN:token,
  GEOMACRO_NO_CARD_RPC_BASE:"https://base-primary.example/rpc?key=opaque-base",
  GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES:JSON.stringify(["https://base-ankr.example/rpc"]),
  GEOMACRO_NO_CARD_RPC_BASE_BACKUP_2:"https://base-drpc.example/rpc",
  GEOMACRO_NO_CARD_RPC_POLYGON:"https://polygon-primary.example/rpc",
  GEOMACRO_NO_CARD_RPC_POLYGON_ALTERNATES:JSON.stringify(["https://polygon-ankr.example/rpc"]),
  GEOMACRO_NO_CARD_RPC_POLYGON_BACKUP_2:"https://polygon-drpc.example/rpc",
};
const request=(timestamp=now,signature=rpcAuditSignature(token,timestamp))=>
  new Request("https://geomacro.live/api/v1/payments/networks",{
    method:"POST",headers:{
      "x-geomacro-rpc-audit-time":String(timestamp),
      "x-geomacro-rpc-audit-hmac":signature,
    },
  });
const rpcFetch=(async (url:unknown,options?:RequestInit)=>{
  if(String(url)==="https://www.cloudflare.com/cdn-cgi/trace")
    return new Response("",{status:200});
  const data=JSON.parse(String(options?.body));
  const chain=String(url).includes("polygon")?"0x89":"0x2105";
  const latest="0x12ab";
  const result=data.method==="eth_chainId"?chain:
    data.method==="eth_blockNumber"?latest:
    data.method==="eth_getBlockByNumber"?{number:latest,hash:"0x"+"a".repeat(64)}:
    data.method==="eth_getTransactionReceipt"?null:undefined;
  return new Response(JSON.stringify({jsonrpc:"2.0",id:1,result}),{
    status:200,headers:{"Content-Type":"application/json"},
  });
}) as typeof fetch;

describe("signed private live six-RPC no-funds readiness",()=>{
  it("rejects missing, invalid and expired HMAC before any private RPC call",async()=>{
    const fetcher=vi.fn(rpcFetch);
    expect(isAuthorizedRpcAudit(request(),env,now)).toBe(true);
    expect(isAuthorizedRpcAudit(request(now-31000),env,now)).toBe(false);
    const bad=request(now,"0".repeat(64));
    const response=await runSignedRpcReadiness(bad,env,fetcher,now);
    expect(response.status).toBe(404);
    expect(fetcher).not.toHaveBeenCalled();
  });
  it("verifies 3 Base + 3 Polygon provider slots from separately saved dRPC secrets",async()=>{
    const fetcher=vi.fn(rpcFetch);
    const response=await runSignedRpcReadiness(request(),env,fetcher,now);
    const receipt=await response.json() as {ok:boolean;checks:{network:string;slot:string;status:string}[]};
    expect(response.status).toBe(200);
    expect(receipt.ok).toBe(true);
    expect(receipt.checks).toHaveLength(6);
    expect(receipt.checks.map(r=>r.network+":"+r.slot)).toEqual([
      "base:primary","base:backup_1","base:backup_2",
      "polygon:primary","polygon:backup_1","polygon:backup_2",
    ]);
    expect(fetcher).toHaveBeenCalledTimes(25);
    expect(JSON.stringify(receipt)).not.toContain("opaque-base");
    expect(JSON.stringify(receipt)).not.toContain(token);
  });
  it("accepts one raw Ankr HTTPS URL per existing _ALTERNATES secret",async()=>{
    const raw={...env,
      GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES:"https://base-ankr.example/rpc",
      GEOMACRO_NO_CARD_RPC_POLYGON_ALTERNATES:"https://polygon-ankr.example/rpc",
    };
    const response=await runSignedRpcReadiness(request(),raw,rpcFetch,now);
    expect(response.status).toBe(200);
    const body=await response.json() as {checks:{status:string}[]};
    expect(body.checks.every(x=>x.status==="PASS")).toBe(true);
  });
  it("reports non-sensitive reason when legacy backup string is invalid JSON",async()=>{
    const bad={...env,GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES:"not-a-url"};
    const response=await runSignedRpcReadiness(request(),bad,rpcFetch,now);
    expect(response.status).toBe(503);
    const body=await response.json() as {checks:{status:string}[]};
    expect(body.checks.slice(0,3).every(x=>x.status==="ALTERNATES_INVALID")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("not-a-url");
  });
  it("never mislabels a Polygon RPC answering Base chain ID",async()=>{
    const badFetcher=(async(u:unknown,options?:RequestInit)=>{
      const reply=await rpcFetch(u,options);
      const data=JSON.parse(String(options?.body));
      if(String(u).includes("base-ankr")&&data.method==="eth_chainId")
        return new Response(JSON.stringify({jsonrpc:"2.0",id:1,result:"0x89"}));
      return reply;
    }) as typeof fetch;
    const response=await runSignedRpcReadiness(request(),env,badFetcher,now);
    expect(response.status).toBe(503);
    const body=await response.json() as {checks:{status:string}[]};
    expect(body.checks[1].status).toBe("RPC_WRONG_CHAIN");
  });
  it.each([
    [401,"RPC_AUTH_REJECTED"],
    [403,"RPC_ACCESS_DENIED"],
    [404,"RPC_ENDPOINT_NOT_FOUND"],
    [429,"RPC_RATE_LIMITED"],
    [503,"RPC_PROVIDER_5XX"],
  ] as const)("reports sanitized provider HTTP %i error as %s",async(status,expected)=>{
    const fetcher=(async(u:unknown,options?:RequestInit)=>{
      if(String(u).includes("base-primary"))return new Response(null,{status});
      return rpcFetch(u,options);
    }) as typeof fetch;
    const response=await runSignedRpcReadiness(request(),env,fetcher,now);
    expect(response.status).toBe(503);
    const body=await response.json() as {checks:{status:string}[]};
    expect(body.checks[0].status).toBe(expected);
    expect(JSON.stringify(body)).not.toContain("opaque-base");
  });
  it("reports an independent outbound HTTPS baseline and sanitized provider families",async()=>{
    const response=await runSignedRpcReadiness(request(),env,rpcFetch,now);
    const body=await response.json() as {egress_check:string;checks:{provider_family:string}[]};
    expect(body.egress_check).toBe("EGRESS_PASS");
    expect(body.checks.every(c=>c.provider_family==="OTHER")).toBe(true);
  });
  it("reports all-provider DNS failures without outputting the failed URLs",async()=>{
    const fetcher=(async(u:unknown,options?:RequestInit)=>{
      if(String(u)==="https://www.cloudflare.com/cdn-cgi/trace")
        return new Response("",{status:200});
      const failure=new TypeError("https://private-key.example");
      Object.assign(failure,{cause:{code:"ENOTFOUND"}});
      throw failure;
    }) as typeof fetch;
    const response=await runSignedRpcReadiness(request(),env,fetcher,now);
    expect(response.status).toBe(503);
    const body=await response.json() as {egress_check:string;checks:{status:string}[]};
    expect(body.egress_check).toBe("EGRESS_PASS");
    expect(body.checks.every(c=>c.status==="RPC_DNS_UNRESOLVED")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("private-key.example");
  });
  it("distinguishes blocked runtime egress from provider rejection without leaking URL",async()=>{
    const fetcher=(async(u:unknown,options?:RequestInit)=>{
      if(String(u).includes("base-primary"))throw new TypeError("secret-in-fetch-error");
      return rpcFetch(u,options);
    }) as typeof fetch;
    const response=await runSignedRpcReadiness(request(),env,fetcher,now);
    expect(response.status).toBe(503);
    const body=await response.json() as {checks:{status:string}[]};
    expect(body.checks[0].status).toBe("RPC_FETCH_FAILED");
    expect(JSON.stringify(body)).not.toContain("secret-in-fetch-error");
  });
  it("reports a bounded provider timeout separately",async()=>{
    const fetcher=(async(u:unknown,options?:RequestInit)=>{
      if(String(u).includes("base-primary")){
        const error=new Error("private error body");error.name="TimeoutError";throw error;
      }
      return rpcFetch(u,options);
    }) as typeof fetch;
    const response=await runSignedRpcReadiness(request(),env,fetcher,now);
    const body=await response.json() as {checks:{status:string}[]};
    expect(body.checks[0].status).toBe("RPC_TIMEOUT");
    expect(JSON.stringify(body)).not.toContain("private error body");
  });
  it("does not expose endpoint URLs on missing/unsafe backup configuration",async()=>{
    const bad={...env,GEOMACRO_NO_CARD_RPC_POLYGON_BACKUP_2:"http://localhost:8545"};
    const response=await runSignedRpcReadiness(request(),bad,rpcFetch,now);
    const body=await response.json() as {checks:{status:string}[]};
    expect(response.status).toBe(503);
    expect(body.checks.slice(-3).every(c=>c.status==="INVALID_URL")).toBe(true);
    expect(JSON.stringify(body)).not.toContain("localhost");
  });
});
