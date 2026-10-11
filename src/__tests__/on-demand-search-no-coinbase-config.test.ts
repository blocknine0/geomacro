import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks=vi.hoisted(()=>({
  coinbaseConfig:vi.fn(),
  discover:vi.fn(),
  articlePages:vi.fn(),
  allowRequest:vi.fn(),
  rights:vi.fn(),
  peerScore:vi.fn(),
  settle:vi.fn(),
  telegram:vi.fn(),
}));
vi.mock("../lib/coinbase-x402.server",async(importOriginal)=>{
  const original=await importOriginal<typeof import("../lib/coinbase-x402.server")>();
  return {...original,getCoinbaseX402Config:mocks.coinbaseConfig,
    settleCoinbaseX402:mocks.settle};
});
vi.mock("../lib/public-demo-rate-limit.server",()=>({
  allowPublicDemoRequest:mocks.allowRequest,
}));
vi.mock("../lib/on-demand-global-discovery.server",async(importOriginal)=>{
  const original=await importOriginal<typeof import("../lib/on-demand-global-discovery.server")>();
  return {...original,
    discoverOnDemandForPrivateQualification:mocks.discover,
    verifyOnDemandOriginalArticlePages:mocks.articlePages,
  };
});
vi.mock("../lib/on-demand-private-macro-rights.server",async(importOriginal)=>{
  const original=await importOriginal<typeof import("../lib/on-demand-private-macro-rights.server")>();
  return {...original,checkPrivateOnDemandMacroRights:mocks.rights};
});
vi.mock("../lib/on-demand-private-macro-peer-score.server",async(importOriginal)=>{
  const original=await importOriginal<typeof import("../lib/on-demand-private-macro-peer-score.server")>();
  return {...original,scorePrivateOnDemandMacroPeers:mocks.peerScore};
});

vi.mock("../lib/on-demand-telegram-fallback.server",()=>({
  lookupTelegramFallback:mocks.telegram,
}));

import { mainnetIntelligenceHandlers } from "../lib/mainnet-intelligence-endpoint.server";

function post(fulfillment_mode:"live_on_demand"|"published_only",payment=false) {
  return mainnetIntelligenceHandlers.POST({
    request:new Request("https://geomacro.live/api/v1/intelligence/query",{
      method:"POST",
      headers:{
        "Content-Type":"application/json",
        ...(payment?{"payment-signature":"invalid-payment-proof"}:{}),
      },
      body:JSON.stringify({
        fulfillment_mode,
        question:"What are the geopolitical, macro and lithium supply risks in China?",
        subjects:[{type:"country",country_iso3:"CHN"}],
        topics:["conflict_geopolitics","macro_risk","critical_minerals"],
      }),
    }),
  });
}

beforeEach(()=>{
  vi.clearAllMocks();
  // Coinbase being misconfigured must not abort an inherently no-charge search.
  mocks.coinbaseConfig.mockImplementation(()=>{throw Error("Coinbase secrets not configured");});
  mocks.allowRequest.mockReturnValue(true);
  mocks.discover.mockResolvedValue({
    discovery:{
      status:"DISCOVERY_DEGRADED",searched_in_parallel:true,
      categories:["geopolitics","macro","rare_earth"],country_iso3:"CHN",
      checked_at:"2026-10-11T12:00:00Z",network_attempts:3,
      reached_source_families:0,source_probes:[],
    },
    private_candidates:[],
    private_original_review_candidates:[],
    duplicate_original_headline_count:0,
    private_macro_changes:[],
  });
  mocks.rights.mockResolvedValue({
    status:"NO_ANNUAL_EVIDENCE",checked_driver_count:0,
    rights_verified_driver_count:0,
    signed_intelligence_verified:false,payment_eligible:false,
    required_data_attribution:null,
  });
  mocks.peerScore.mockResolvedValue({
    status:"NO_CERTIFIED_MACRO_RIGHTS",
    peer_normalized_dimension_count:0,
  });
  mocks.articlePages.mockResolvedValue({attempted:0,verified:0,verified_candidates:[]});
  mocks.telegram.mockResolvedValue({attempted:true,status:"UNVERIFIED_LEADS",searched_channel_count:1,unverified_lead_count:2,verified_intelligence_created:false,chargeable:false});
});

describe("production no-charge on-demand search without Coinbase configuration",()=>{
  it("reaches all three domain discovery without invoking Coinbase, settlement or raw storage",async()=>{
    const response=await post("live_on_demand");
    const body=await response.json();
    expect(response.status).toBe(422);
    expect(body.error.code).toBe("ON_DEMAND_VERIFICATION_PENDING");
    expect(body.on_demand.categories).toEqual(["geopolitics","macro","rare_earth"]);
    expect(body.on_demand.country_iso3).toBe("CHN");
    expect(body.chargeable).toBe(false);
    expect(body.payment_required_now).toBe(false);
    expect(body.on_demand.signed_derived_intelligence_created).toBe(false);
    expect(body.on_demand.raw_upstream_delivered).toBe(false);
    expect(body.on_demand.telegram_fallback).toMatchObject({status:"UNVERIFIED_LEADS",chargeable:false,unverified_lead_count:2});
    expect(mocks.telegram).toHaveBeenCalledWith({country_iso3:"CHN",categories:["geopolitics","macro","rare_earth"],originalArticleEvidenceSufficient:false});
    expect(mocks.discover).toHaveBeenCalledOnce();
    expect(mocks.coinbaseConfig).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(response.headers.has("payment-required")).toBe(false);
  });
  it("does not treat unverified original article candidates as sufficient evidence",async()=>{
    mocks.discover.mockResolvedValueOnce({
      discovery:{
        status:"DISCOVERY_OBSERVED_NOT_YET_VERIFIED",searched_in_parallel:true,
        categories:["geopolitics","macro","rare_earth"],country_iso3:"CHN",
        checked_at:"2026-10-12T02:00:00Z",network_attempts:3,
        reached_source_families:2,source_probes:[],
      },
      private_candidates:[],
      // Finding a dated original article is not independent qualification.
      private_original_review_candidates:[{article_identity_sha256:"a".repeat(64)}],
      duplicate_original_headline_count:0,
      private_macro_changes:[],
    });
    mocks.articlePages.mockResolvedValueOnce({attempted:1,verified:1,verified_candidates:[]});
    const response=await post("live_on_demand");
    const body=await response.json();
    expect(response.status).toBe(422);
    expect(body.chargeable).toBe(false);
    expect(body.payment_required_now).toBe(false);
    expect(mocks.telegram).toHaveBeenCalledWith({
      country_iso3:"CHN",
      categories:["geopolitics","macro","rare_earth"],
      originalArticleEvidenceSufficient:false,
    });
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("ignores a forged payment header on search-only requests",async()=>{
    const response=await post("live_on_demand",true);
    expect(response.status).toBe(422);
    expect((await response.json()).payment_required_now).toBe(false);
    expect(mocks.coinbaseConfig).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
    expect(response.headers.has("payment-response")).toBe(false);
  });
  it("preserves fail-closed Coinbase configuration for paid published-only requests",async()=>{
    const response=await post("published_only");
    expect(response.status).toBe(503);
    const body=await response.json();
    expect(body.error.code).toBe("COINBASE_X402_CONFIGURATION_INVALID");
    expect(mocks.coinbaseConfig).toHaveBeenCalledOnce();
    expect(mocks.discover).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
  it("keeps global free-tier rate enforcement before any provider call",async()=>{
    mocks.allowRequest.mockReturnValue(false);
    const response=await post("live_on_demand");
    expect(response.status).toBe(429);
    expect(mocks.discover).not.toHaveBeenCalled();
    expect(mocks.telegram).not.toHaveBeenCalled();
    expect(mocks.coinbaseConfig).not.toHaveBeenCalled();
    expect(mocks.settle).not.toHaveBeenCalled();
  });
});
