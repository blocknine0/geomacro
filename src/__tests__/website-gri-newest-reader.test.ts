import { beforeEach, describe, expect, it, vi } from "vitest";
import { fixture, shiftedFixture, AS_OF, HOUR } from "./fixtures/verified-global-risk";
const mocks=vi.hoisted(()=>({archive:vi.fn(),edge:vi.fn(),database:vi.fn(),directB2:vi.fn()}));
vi.mock("../lib/fetch-without-redirect",()=>({fetchWithoutRedirect:mocks.archive}));
vi.mock("../lib/global-risk-edge.server",()=>({readGlobalRiskEdge:mocks.edge}));
vi.mock("../lib/supabase-app.server",()=>({getAppSupabase:mocks.database}));
vi.mock("../lib/b2-live.server",()=>({readB2PublicRisk:mocks.directB2}));
import { readWebsiteLaggedGlobalRisk } from "../lib/global-risk-read.server";
const NOW=AS_OF+4*HOUR;
function archiveResponse(data=fixture(),extra:Record<string,unknown>={}){
 return new Response(JSON.stringify({ok:true,schema:"geomacro.website-lagged-global-risk.v1",
  website_only:true,minimum_delay_minutes:60,verification_status:"verified",
  prior_b2_readback_verified_at_write:true,source_identity_disclosed:false,
  raw_upstream_disclosed:false,chargeable:false,paid_delivery_authorized:false,data,...extra,
 }),{status:200,headers:{"Content-Type":"application/json"}});
}
beforeEach(()=>{vi.resetAllMocks();});
describe("website GRI archive and edge reader",()=>{
 it("reads both bounded authorities and replaces an old successful archive with the newer eligible package",async()=>{
  const newer=shiftedFixture(2);mocks.archive.mockResolvedValue(archiveResponse());mocks.edge.mockResolvedValue(newer);
  const result=await readWebsiteLaggedGlobalRisk(NOW);
  expect(mocks.archive).toHaveBeenCalledOnce();expect(mocks.edge).toHaveBeenCalledOnce();
  expect(result.snapshotAsOf).toBe(newer.snapshotAsOf);expect(result.proofHash).toBe(newer.proofHash);
  expect(mocks.database).not.toHaveBeenCalled();expect(mocks.directB2).not.toHaveBeenCalled();
 });
 it("keeps an eligible archive when the edge is within the public embargo",async()=>{
  mocks.archive.mockResolvedValue(archiveResponse());mocks.edge.mockResolvedValue(shiftedFixture(3.5));
  expect((await readWebsiteLaggedGlobalRisk(NOW)).snapshotAsOf).toBe(fixture().snapshotAsOf);
 });
 it("recovers through the edge after archive transport failure, without a direct private-store retry",async()=>{
  const newer=shiftedFixture(2);mocks.archive.mockRejectedValue(Error("archive timeout"));mocks.edge.mockResolvedValue(newer);
  expect((await readWebsiteLaggedGlobalRisk(NOW)).snapshotAsOf).toBe(newer.snapshotAsOf);
  expect(mocks.directB2).not.toHaveBeenCalled();expect(mocks.database).not.toHaveBeenCalled();
 });
 it("rejects an archive with a forged privacy receipt and an unavailable edge",async()=>{
  mocks.archive.mockResolvedValue(archiveResponse(fixture(),{raw_upstream_disclosed:true}));mocks.edge.mockResolvedValue(null);
  await expect(readWebsiteLaggedGlobalRisk(NOW)).rejects.toThrow("WEBSITE_GRI_ONE_HOUR_VERIFIED_SNAPSHOT_UNAVAILABLE");
 });
});
