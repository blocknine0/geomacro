import { mkdtempSync,writeFileSync,chmodSync,symlinkSync,
  rmSync,readFileSync,existsSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { afterEach,describe,expect,it,vi } from "vitest";
import {
  acceptReviewedLiveGRO,assertPrivateReviewPaths,parsePrivateReviewedRequest,
} from "../../scripts/ops/accept-private-live-on-demand-gro.ts";

const dirs:string[]=[];
afterEach(()=>{
  vi.unstubAllEnvs();
  for(const dir of dirs)rmSync(dir,{force:true,recursive:true});
  dirs.length=0;
});
function privateInput() {
  const dir=mkdtempSync(join(tmpdir(),"geomacro-private-acceptance-"));
  dirs.push(dir);
  chmodSync(dir,0o700);
  const input=join(dir,"reviewed.json");
  const output=join(dir,"signed-out.json");
  const request={
    schema:"geomacro.private-on-demand-gro-review-bundle.v1",
    category:"macro",country_iso3:"USA",country_name:"United States",
    events:[{id:"synthetic-facts-that-are-not-real"}],
    review_bundle:{rows:[{id:"synthetic"}],eventPackages:[{id:"synthetic"}]},
  };
  writeFileSync(input,JSON.stringify(request),{mode:0o600});
  chmodSync(input,0o600);
  vi.stubEnv("GEOMACRO_PRIVATE_REVIEW_DIR",dir);
  return {dir,input,output,request};
}
describe("manual-only live private signed GRO first acceptance",()=>{
  it("requires a governed private directory outside repo, rejects group access",()=>{
    const f=privateInput();
    expect(assertPrivateReviewPaths(f.input,f.output))
      .toEqual({input:f.input,output:f.output});
    chmodSync(f.dir,0o755);
    expect(()=>assertPrivateReviewPaths(f.input,f.output))
      .toThrow("ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED");
  });
  it("refuses symlink input and any destination outside protected directory",()=>{
    const f=privateInput();
    const link=join(f.dir,"alias.json");
    symlinkSync(f.input,link);
    expect(()=>assertPrivateReviewPaths(link,f.output))
      .toThrow("ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED");
    expect(()=>assertPrivateReviewPaths(f.input,
      join(tmpdir(),"unexpected.json")))
      .toThrow("ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED");
    expect(()=>assertPrivateReviewPaths(f.input,f.input))
      .toThrow("ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED");
    chmodSync(f.input,0o644);
    expect(()=>assertPrivateReviewPaths(f.input,f.output))
      .toThrow("ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED");
  });
  it("requires private bundle schema and matching event counts",()=>{
    const f=privateInput();
    expect(parsePrivateReviewedRequest(readFileSync(f.input,"utf8")))
      .toMatchObject({category:"macro",country_iso3:"USA"});
    for(const changed of [
      {...f.request,schema:"unsigned"},
      {...f.request,category:"unknown"},
      {...f.request,country_iso3:"ZZ"},
      {...f.request,events:[]},
      {...f.request,review_bundle:{rows:[],eventPackages:[]}},
      {...f.request,review_bundle:{rows:[],eventPackages:[{}]}},
    ])expect(()=>parsePrivateReviewedRequest(JSON.stringify(changed)))
      .toThrow("ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED");
    expect(()=>parsePrivateReviewedRequest("{{")).toThrow(
      "ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED");
  });
  it("never writes a GRO when production reviewer/signing secrets are absent",async()=>{
    const f=privateInput();
    for(const key of [
      "RISK_OBJECT_SIGNING_PRIVATE_KEY_PKCS8_B64",
      "RISK_OBJECT_SIGNING_PUBLIC_KEY_SPKI_B64",
      "RISK_OBJECT_SIGNING_KEY_ID",
      "GEOMACRO_INDEPENDENT_REVIEW_PUBLIC_KEY_PEM",
    ])vi.stubEnv(key,"");
    await expect(acceptReviewedLiveGRO(f.input,f.output))
      .rejects.toThrow("ON_DEMAND_LIVE_GRO_ACCEPTANCE_FAILED");
    expect(existsSync(f.output)).toBe(false);
  });
  it("does not read Supabase, make payment, persist to B2/D1 or log private contents",()=>{
    const code=readFileSync("scripts/ops/accept-private-live-on-demand-gro.ts","utf8");
    for(const forbidden of ["settleCoinbaseX402","requireRiskSupabase",
      "writeB2","putObject","D1.prepare","GEOMACRO_COMMERCE_LEDGER_TOKEN",
      "console.log(serialized)","console.log(reviewed)"]){
      expect(code).not.toContain(forbidden);
    }
    expect(code).toContain("constants.O_EXCL");
    expect(code).toContain("constants.O_NOFOLLOW");
    expect(code).toContain("scoreAndSignQualifiedOnDemandCountry");
    expect(code).toContain("createReviewedRightsOnDemandQualifier");
    expect(code).toContain("loadRiskObjectVerificationKeysFromEnv");
  });
});
