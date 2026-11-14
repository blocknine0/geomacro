import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {join} from "node:path";
import {fileURLToPath} from "node:url";
import {validateSourceRightsManifest} from "../lib/risk-stream-source-rights-manifest.mjs";
import {buildHot50StandardFeasibility} from "../ops/hot50-standard-feasibility.mjs";
import {buildSourceRegistrationPlan,runSourceRegistration}
 from "../ops/register-risk-stream-source.mjs";

const ROOT=fileURLToPath(new URL("../..",import.meta.url));
const now=Date.parse("2026-11-14T12:00:00.000Z");
const readJson=path=>JSON.parse(readFileSync(join(ROOT,path),"utf8"));
const evidence={licence_url:"https://rights.example.invalid/licence",
 terms_url:"https://rights.example.invalid/terms",
 reviewed_at:"2026-11-13T12:00:00.000Z",reviewer:"owner-review",
 notes:"Owner reviewed exact dataset terms and derived-use scope."};
function approved(source_id,{role="GOVERNMENT_WIRE",category="GEOPOLITICS",
 domain="publisher-a.example",parent="publisher-a",expires="2027-11-13"}={}){
 return {source_id,publisher_root_domain:domain,parent_media_entity:parent,
  source_role:role,categories:[category],status:"APPROVED",
  rights_evidence:{...evidence},rights_expire_at:expires};
}
function validManifest(entries=[
 approved("gov_wire_source"),
 approved("independent_region",{role:"INDEPENDENT_REGIONAL",domain:"publisher-b.example",
  parent:"publisher-b"})
]){
 return {schema:"geomacro.risk-stream-source-rights-reviewed.v1",entries};
}
function syntheticScope(){
 return {crosswalk:{schema:"geomacro.hot50.source-lane-crosswalk.v1",country_count:50,
  categories:["geopolitics","macro","rare_earth"],
  countries:Array.from({length:50},(_,i)=>({country_iso3:String.fromCharCode(
   65+Math.floor(i/26),65+i%26,65)}))},
  priority:{schema:"geomacro.hot50-three-category-official-gap-priority.v1",
   pinned_existing:{},new_official_candidates:[{id:"candidate_not_rights_approved"}]}};
}

test("valid owner-reviewed role pair passes manifest validation",()=>{
 const result=validateSourceRightsManifest(validManifest(),now);
 assert.equal(result.approvedEntries.length,2);
 assert.equal(result.pendingEntries.length,0);
});

test("shipped manifest contains only pending examples",()=>{
 const manifest=readJson("config/risk-stream-source-rights-reviewed.v1.json");
 const result=validateSourceRightsManifest(manifest,now);
 assert.equal(result.approvedEntries.length,0);
 assert.equal(result.pendingEntries.length,3);
 assert.ok(result.pendingEntries.every(x=>x.rights_evidence.notes.includes("EXAMPLE - NOT REVIEWED")));
});

test("expired rights evidence cannot be approved",()=>{
 const manifest=validManifest([approved("gov_wire_source",{expires:"2026-11-13"})]);
 assert.throws(()=>validateSourceRightsManifest(manifest,now),
  /APPROVED_RIGHTS_EXPIRED_OR_INVALID/u);
});

test("same parent media entity cannot qualify as an independent role pair",()=>{
 const manifest=validManifest([
  approved("gov_wire_source",{parent:"shared-parent"}),
  approved("independent_region",{role:"INDEPENDENT_REGIONAL",domain:"publisher-b.example",
   parent:"shared-parent"})
 ]);
 assert.throws(()=>validateSourceRightsManifest(manifest,now),
  /ROLE_PAIR_NOT_INDEPENDENT_GEOPOLITICS/u);
});

test("feasibility lists the missing role and does not count discovery candidates",()=>{
 const scope=syntheticScope();
 const report=buildHot50StandardFeasibility({...scope,
  manifest:validManifest([approved("gov_wire_source")]),now});
 assert.equal(report.cell_count,150);
 assert.equal(report.discovery_only_priority_candidate_count,1);
 const geo=report.infeasible_cells.filter(x=>x.category==="GEOPOLITICS");
 assert.equal(geo.length,50);
 assert.ok(geo.every(x=>x.missing_roles.includes("INDEPENDENT_REGIONAL")));
 assert.equal(report.approved_source_count,1);
});

test("invalid source IDs and source categories are rejected",()=>{
 assert.throws(()=>validateSourceRightsManifest(validManifest([
  approved("Invalid uppercase")]),now),/SOURCE_ID_INVALID/u);
 const wrongRole=approved("wrong_role_source",{role:"MARKET_PRICE",category:"GEOPOLITICS"});
 assert.throws(()=>validateSourceRightsManifest(validManifest([wrongRole]),now),
  /CATEGORIES_INVALID/u);
});

test("dry-run and apply never write PENDING entries",()=>{
 const manifest=readJson("config/risk-stream-source-rights-reviewed.v1.json");
 let calls=0;
 const runWrangler=()=>{calls++;throw Error("wrangler must not be called for PENDING-only manifest")};
 const plan=buildSourceRegistrationPlan(manifest,now);
 assert.equal(plan.approvedEntries.length,0);
 assert.equal(plan.statements.length,0);
 assert.equal(runSourceRegistration({manifest,runWrangler,now}).mode,"dry-run");
 assert.throws(()=>runSourceRegistration({manifest,apply:true,
  env:{CONFIRM:"APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION",D1_DATABASE_ID:"12345678-1234-1234-1234-123456789abc"},
  runWrangler,now}),/NO_APPROVED_SOURCES/u);
 assert.equal(calls,0);
});

test("approved apply upserts approved rows and verifies every readback column",()=>{
 const pending=readJson("config/risk-stream-source-rights-reviewed.v1.json").entries;
 const manifest=validManifest([...validManifest().entries,pending[0]]);
 const commands=[];
 const runWrangler=args=>{
  const sql=args.at(-1);commands.push(sql);
  if(sql.startsWith("SELECT ")){
   const results=manifest.entries.filter(x=>x.status==="APPROVED").map(x=>({
    source_id:x.source_id,publisher_root_domain:x.publisher_root_domain,
    parent_media_entity:x.parent_media_entity,source_role:x.source_role,
    commercial_rights_approved:1,enabled:1,reviewed_at:x.rights_evidence.reviewed_at,
    rights_expire_at:x.rights_expire_at}));
   return JSON.stringify([{results}]);
  }
  return JSON.stringify([{results:[]}]);
 };
 const result=runSourceRegistration({manifest,apply:true,
  env:{CONFIRM:"APPLY_RISK_STREAM_SOURCE_REGISTRY_PRODUCTION",
   D1_DATABASE_ID:"12345678-1234-1234-1234-123456789abc"},runWrangler,
  root:ROOT,now});
 assert.deepEqual(result,{mode:"apply",written:2,readback_verified:true,pending_ignored:1});
 assert.equal(commands.length,3);
 assert.ok(commands.slice(0,2).every(sql=>sql.includes("commercial_rights_approved,enabled")));
 assert.ok(commands.every(sql=>!sql.includes("example_gov_wire")));
});
