import { describe,expect,it,vi } from "vitest";
import { classifyQuotaStatus,privateRightsCheckOnce } from "../../scripts/ops/phase2-step4-operator-rights-read";
import type { B2CommercialSourceRight } from "./b2-live.server";

const pre=(credentials_configured=true,control_plane_token_configured=true)=>({
  schema:"geomacro.b2-rights-runtime-preflight.v1" as const,
  status:credentials_configured
    ?control_plane_token_configured
      ?"PREREQUISITES_PRESENT_QUOTA_RESERVED_READ_REQUIRED" as const
      :"CONTROL_PLANE_TOKEN_MISSING" as const
    :"B2_READ_CREDENTIALS_MISSING" as const,
  credentials_configured,control_plane_token_configured,signed_b2_get_attempted:false as const,
});
const quota={ok:true,schema:"geomacro.b2-account-quota-status.v1",
  used:{GET:2,total:3},limits:{GET:25,total:80}};
const fetchMock=(http=200,data:unknown=quota)=>vi.fn().mockResolvedValue({
  status:http,json:async()=>data,
}) as unknown as typeof fetch;
const row:B2CommercialSourceRight={
  source_id:"world_bank_indicators",category:"macro",
  certification_state:"CERTIFIED",commercial_usage_status:"DERIVED_ONLY",
  enabled_for_ingestion:true,enabled_for_commercial_signals:true,
  raw_redistribution_allowed:false,attribution_required:true,licence_name:"CC BY 4.0",
};
describe("operator-only rights read preserves exactly one quota-governed B2 attempt",()=>{
  it("never permits read without explicit authorization or available credentials",async()=>{
    const read=vi.fn().mockResolvedValue([row]),get=fetchMock();
    const noAck=await privateRightsCheckOnce({
      prerequisites:()=>pre(),getQuota:get,rightsReader:read,
    });
    expect(noAck.category).toBe("EXPLICIT_ONE_READ_AUTHORIZATION_REQUIRED");
    const noB2=await privateRightsCheckOnce({
      onceAuthorized:true,prerequisites:()=>pre(false),getQuota:get,rightsReader:read,
    });
    expect(noB2.category).toBe("SERVER_B2_READ_CREDENTIALS_MISSING");
    expect(read).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled();
  });
  it("rejects 401, 403, 429, quota exhausted and malformed receipts before any rights GET",async()=>{
    const read=vi.fn().mockResolvedValue([row]);
    expect(classifyQuotaStatus(401,null)).toBe("D1_AUTH_DENIED");
    expect(classifyQuotaStatus(403,null)).toBe("D1_AUTH_DENIED");
    expect(classifyQuotaStatus(429,null)).toBe("D1_UNAVAILABLE");
    expect(classifyQuotaStatus(200,{ok:true})).toBe("D1_RESPONSE_INVALID");
    for(const [http,body] of [
      [401,null],[403,null],[200,{...quota,used:{GET:25,total:3}}],
      [200,{...quota,used:{GET:2,total:80}}],[200,{ok:true}],
    ] as const){
      const r=await privateRightsCheckOnce({
        onceAuthorized:true,prerequisites:()=>pre(),getQuota:fetchMock(http,body),rightsReader:read,
      });
      expect(r.status).toBe("BLOCKED");
      expect(r.raw_rights_logged).toBe(false);
    }
    expect(read).not.toHaveBeenCalled();
  });
  it("reports one authorized certified WDI read, no raw source or token in response",async()=>{
    const read=vi.fn().mockResolvedValue([row]);
    const r=await privateRightsCheckOnce({
      onceAuthorized:true,prerequisites:()=>pre(),
      getQuota:fetchMock(),rightsReader:read,
    });
    expect(read).toHaveBeenCalledTimes(1);
    expect(r.status).toBe("RIGHTS_CERTIFIED");
    expect(r.category).toBe("UNIQUE_CERTIFIED_WDI_ROW_AFTER_GOVERNED_READ");
    expect(r.quota_reservation_bypassed).toBe(false);
    expect(r.signed_s3_read_attempts_max).toBe(1);
    expect(JSON.stringify(r)).not.toContain("world_bank_indicators");
  });
  it("never promotes duplicate, stale/unavailable or uncertified rights",async()=>{
    for(const rights of [null,[row,row],[{...row,certification_state:"REVIEW"}]]){
      const reader=vi.fn().mockResolvedValue(rights);
      const r=await privateRightsCheckOnce({
        onceAuthorized:true,prerequisites:()=>pre(),getQuota:fetchMock(),
        rightsReader:reader,
      });
      expect(r.status).toBe("BLOCKED");
      expect(reader).toHaveBeenCalledTimes(1);
    }
  });
});
