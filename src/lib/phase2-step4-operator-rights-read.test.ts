import { describe,expect,it,vi } from "vitest";
import { classifyQuotaStatus,privateRightsCheckOnce } from "../../scripts/ops/phase2-step4-operator-rights-read";
import type { B2CommercialSourceRight } from "./b2-live.server";

const expectedSha="f1c168c8c91917db0bda8d041d771c6840cfbc50ea7de4f047ed081a8ad995c0";
const expectedAt="2026-10-13T22:04:53.102Z";
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
const receipt=(rows:B2CommercialSourceRight[]|null=[row],overrides:Record<string,unknown>={})=>rows===null
  ?null:{rows,compressed_sha256:expectedSha,generated_at:expectedAt,
    fresh_quota_reserved_get:true,...overrides};
const opts=()=>({onceAuthorized:true,prerequisites:()=>pre(),
  getQuota:fetchMock(),expectedCompressedSha256:expectedSha,
  expectedGeneratedAt:expectedAt});

describe("operator-only exact B2 receipt and authenticated D1 single-read proof",()=>{
  it("never reads without explicit operator authorization, credentials or expected receipt",async()=>{
    const read=vi.fn().mockResolvedValue(receipt()),get=fetchMock();
    const noAck=await privateRightsCheckOnce({
      ...opts(),onceAuthorized:false,getQuota:get,rightsReader:read,
    });
    expect(noAck.category).toBe("EXPLICIT_ONE_READ_AUTHORIZATION_REQUIRED");
    const noB2=await privateRightsCheckOnce({
      ...opts(),prerequisites:()=>pre(false),getQuota:get,rightsReader:read,
    });
    expect(noB2.category).toBe("SERVER_B2_READ_CREDENTIALS_MISSING");
    const noReceipt=await privateRightsCheckOnce({
      ...opts(),expectedCompressedSha256:"",getQuota:get,rightsReader:read,
    });
    expect(noReceipt.category).toBe("EXPECTED_B2_RECEIPT_METADATA_REQUIRED");
    expect(read).not.toHaveBeenCalled();expect(get).not.toHaveBeenCalled();
  });
  it("rejects 401, 403, 429, quota exhausted and malformed status BEFORE S3 GET",async()=>{
    const read=vi.fn().mockResolvedValue(receipt());
    expect(classifyQuotaStatus(401,null)).toBe("D1_AUTH_DENIED");
    expect(classifyQuotaStatus(403,null)).toBe("D1_AUTH_DENIED");
    expect(classifyQuotaStatus(429,null)).toBe("D1_QUOTA_EXHAUSTED");
    expect(classifyQuotaStatus(200,{ok:true})).toBe("D1_RESPONSE_INVALID");
    for(const [http,body] of [
      [401,null],[403,null],[429,null],[200,{...quota,used:{GET:25,total:3}}],
      [200,{...quota,used:{GET:2,total:80}}],[200,{ok:true}],
    ] as const){
      const result=await privateRightsCheckOnce({
        ...opts(),getQuota:fetchMock(http,body),rightsReader:read,
      });
      expect(result.status).toBe("BLOCKED");
      expect(result.fresh_d1_reservation_and_b2_get_verified).toBe(false);
      expect(result.raw_rights_logged).toBe(false);
    }
    expect(read).not.toHaveBeenCalled();
  });
  it("tests synthetic exact-receipt qualification without exposing inventory or token",async()=>{
    const read=vi.fn().mockResolvedValue(receipt());
    const report=await privateRightsCheckOnce({...opts(),rightsReader:read});
    expect(read).toHaveBeenCalledExactlyOnceWith({freshQuotaReservedGet:true});
    expect(report.status).toBe("RIGHTS_CERTIFIED");
    expect(report.category).toBe("UNIQUE_CERTIFIED_WDI_ROW_EXACT_RECEIPT_FRESH_D1_RESERVED_GET");
    expect(report.quota_auth_status).toBe(200);
    expect(report.fresh_d1_reservation_and_b2_get_verified).toBe(true);
    expect(report.exact_b2_receipt_matched).toBe(true);
    expect(report.quota_reservation_bypassed).toBe(false);
    expect(report.signed_s3_read_attempts_max).toBe(1);
    expect(JSON.stringify(report)).not.toContain("world_bank_indicators");
    expect(JSON.stringify(report)).not.toContain(expectedSha);
  });
  it("fails closed for stale/non-fresh read, different receipt, unavailable or uncertified WDI",async()=>{
    const candidates=[
      [receipt(null),"RIGHTS_B2_GET_OR_GZIP_SCHEMA_FRESHNESS_UNVERIFIED"],
      [receipt([row],{fresh_quota_reserved_get:false}),"FRESH_QUOTA_RESERVED_B2_GET_NOT_PROVEN"],
      [receipt([row],{compressed_sha256:"b".repeat(64)}),"RIGHTS_RECEIPT_CHECKSUM_MISMATCH"],
      [receipt([row],{generated_at:"2026-10-12T22:04:53.102Z"}),"RIGHTS_RECEIPT_GENERATION_MISMATCH"],
      [receipt([row,row]),"WDI_EXACT_SOURCE_NOT_CERTIFIED"],
      [receipt([{...row,certification_state:"REVIEW"}]),"WDI_RIGHTS_CONTRACT_MISMATCH"],
    ] as const;
    for(const [r,reason] of candidates){
      const read=vi.fn().mockResolvedValue(r);
      const report=await privateRightsCheckOnce({...opts(),rightsReader:read});
      expect(report.status).toBe("BLOCKED");
      expect(report.category).toBe(reason);
      expect(read).toHaveBeenCalledTimes(1);
    }
  });
});
