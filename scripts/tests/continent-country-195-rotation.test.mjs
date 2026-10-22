import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync,writeFileSync,mkdtempSync,rmSync} from "node:fs";
import {tmpdir} from "node:os";
import {join} from "node:path";
import {spawnSync} from "node:child_process";
import {
 CONTINENT_COUNTRIES_195,CONTINENTS_195,SWEEP_EPOCH_MS,SWEEP_SLOT_MS,
 planTwoHourContinentCountrySweep,assertContinentCanonical195
} from "../lib/continent-country-195-rotation.mjs";

const registry=readFileSync("src/lib/canonical-country-registry-195.ts","utf8");
const regions=[
 ["africa","Africa",3,54],["asia","Asia",13,47],
 ["europe","Europe",23,45],["north_america","North America",33,23],
 ["south_america","South America",43,12],["oceania","Oceania",53,14],
];
test("all 195 countries including 2 observers partitioned across exactly 6 unique inhabited continents",()=>{
 assert.equal(CONTINENTS_195.length,6);
 assert.equal(assertContinentCanonical195(registry),true);
 const all=regions.flatMap(([region])=>CONTINENT_COUNTRIES_195[region]);
 assert.equal(all.length,195);
 assert.equal(new Set(all).size,195);
 assert.equal(CONTINENT_COUNTRIES_195.asia.includes("PSE"),true);
 assert.equal(CONTINENT_COUNTRIES_195.europe.includes("VAT"),true);
 assert.equal(CONTINENT_COUNTRIES_195.asia.includes("TUR"),true);
 assert.equal(CONTINENT_COUNTRIES_195.europe.includes("RUS"),true);
 assert.equal(CONTINENT_COUNTRIES_195.north_america.includes("MEX"),true);
 for(const [region,,minutes,count] of regions){
  const x=CONTINENT_COUNTRIES_195[region];
  assert.equal(x.length,count);
  assert.equal(new Set(x).size,count);
  assert.ok(minutes>0&&minutes<60);
 }
 const modified=registry.replace("AFG|AF|Afghanistan","FAK|AF|Fake");
 assert.throws(()=>assertContinentCanonical195(modified),/REGISTRY_PARTITION_MISMATCH/);
});
test("2h slot probes ONE continent ISO3 per scheduled tick, full region sweep with zero cross-duplication",()=>{
 for(const [continent,,minute,count] of regions){
  const group=CONTINENT_COUNTRIES_195[continent],seen=[];
  for(let n=0;n<count;n++){
   const time=new Date(SWEEP_EPOCH_MS+n*SWEEP_SLOT_MS+minute*60_000);
   const p=planTwoHourContinentCountrySweep({continent,
     registryText:registry,eventName:"schedule",now:time});
   assert.equal(p.continent_country_count,count);
   assert.equal(p.continent_country_index,n);
   assert.equal(p.country_iso3,group[n]);
   assert.equal(p.batch_count,1);
   assert.equal(p.all_categories,3);
   assert.equal(p.sweep_duration_hours,count*2);
   assert.equal(p.provider_quota_global_headroom_unverified,true);
   assert.equal(p.original_checks_per_country_cap,4);
   assert.equal(p.discovery_requests_per_country_cap,12);
   seen.push(p.country_iso3);
  }
  assert.equal(new Set(seen).size,count);
  const cycle=planTwoHourContinentCountrySweep({continent,
   registryText:registry,eventName:"schedule",
   now:new Date(SWEEP_EPOCH_MS+count*SWEEP_SLOT_MS+minute*60_000)});
  assert.equal(cycle.country_iso3,group[0]);
 }
});
test("UTC slot stays stable across minute delays, without advancing missing scheduled runs",()=>{
 const a=planTwoHourContinentCountrySweep({continent:"asia",registryText:registry,
   now:new Date("2026-10-22T02:13:00Z")});
 const b=planTwoHourContinentCountrySweep({continent:"asia",registryText:registry,
   now:new Date("2026-10-22T03:59:59Z")});
 assert.equal(a.country_iso3,b.country_iso3);
 assert.equal(a.country_iso3,CONTINENT_COUNTRIES_195.asia[1]);
 assert.notEqual(planTwoHourContinentCountrySweep({continent:"asia",registryText:registry,
   now:new Date("2026-10-22T04:13:00Z")}).country_iso3,a.country_iso3);
});
test("manual can target ONLY country in requested continent, never another country or 3-country blast",()=>{
 const a=planTwoHourContinentCountrySweep({
  continent:"africa",registryText:registry,eventName:"workflow_dispatch",
  requestedIso3:"ZAF",now:new Date("2026-10-22T11:00:00Z")});
 assert.equal(a.country_iso3,"ZAF");
 assert.equal(a.batch_count,1);
 assert.equal(a.trigger,"MANUAL_PINNED_ISO3");
 for(const bad of ["IND","VAT","TWN","ZZZ","ZAF;DROP","zaf",""]) {
   if(bad==="")continue;
   assert.throws(()=>planTwoHourContinentCountrySweep({
    continent:"africa",registryText:registry,eventName:"workflow_dispatch",
    requestedIso3:bad}),/MANUAL_ISO3_NOT_IN_THIS_CONTINENT/);
 }
 assert.throws(()=>planTwoHourContinentCountrySweep({
  continent:"africa",registryText:registry,eventName:"schedule",
  requestedIso3:"ZAF"}),/SCHEDULE_CANNOT_OVERRIDE_COUNTRY/);
 for(const invalid of ["antarctica","asia;africa",""]){
  assert.throws(()=>planTwoHourContinentCountrySweep({
    continent:invalid,registryText:registry}),/CONTINENT_UNRECOGNIZED/);
 }
 assert.throws(()=>planTwoHourContinentCountrySweep({
  continent:"africa",registryText:registry,eventName:"push"}),/PROTECTED_EVENT_ONLY/);
 assert.throws(()=>planTwoHourContinentCountrySweep({
  continent:"africa",registryText:registry,now:new Date("2026-10-21T23:59:59Z")}),
   /UTC_SLOT_CLOCK_INVALID/);
});
test("all six actual Github workflows have distinct 2h cron and ONE shared no-funds source job",()=>{
 const shared=readFileSync(".github/workflows/continent-country-original-probe-reusable.yml","utf8");
 assert.match(shared,/workflow_call:/);
 assert.match(shared,/GEOMACRO_COUNTRY_BATCH_COUNT: "1"/);
 assert.match(shared,/GEOMACRO_EXPECTED_COUNTRY_ISO3/);
 assert.match(shared,/scripts\/ops\/verify-live-195-country-batch.ts/);
 assert.match(shared,/retention-days: 14/);
 assert.doesNotMatch(shared,/RISK_OBJECT_SIGNING_PRIVATE|COINBASE_.*PRIVATE|SUPABASE_SERVICE_ROLE/);
 const minutes=new Set();
 for(const [slug,label,minute] of regions){
  const yaml=readFileSync(`.github/workflows/continent-country-${slug}-2h.yml`,"utf8");
  assert.ok(yaml.includes(`cron: '${minute} */2 * * *'`));
  assert.ok(yaml.includes(`continent: '${slug}'`));
  assert.ok(yaml.includes("continent-country-original-probe-reusable.yml"));
  assert.ok(yaml.includes("workflow_dispatch:"));
  assert.equal(minutes.has(minute),false);
  minutes.add(minute);
 }
 const old=readFileSync(".github/workflows/live-on-demand-source-acceptance.yml","utf8");
 assert.match(old,/cron: "23 8 \* \* \*"/); // global API, not country scan
 assert.match(old,/name: Select deterministic manual country batch/);
 assert.match(old,/github.event_name == 'workflow_dispatch'/);
});
test("planner CLI emits source-free exact ISO3 and one-index GitHub outputs",()=>{
 const root=mkdtempSync(join(tmpdir(),"geomacro-continent-"));
 try{
  const output=join(root,"outputs");
  const proc=spawnSync(process.execPath,["scripts/ops/plan-continent-country-195-rotation.mjs"],{
   encoding:"utf8",env:{...process.env,
    GITHUB_OUTPUT:output,GITHUB_REF:"refs/heads/main",
    GITHUB_REPOSITORY:"blocknine0/geomacro",
    GITHUB_EVENT_NAME:"workflow_dispatch",
    GEOMACRO_CONTINENT:"oceania",GEOMACRO_REQUESTED_COUNTRY:"NZL"}
  });
  assert.equal(proc.status,0,proc.stderr);
  const data=readFileSync(output,"utf8");
  assert.match(data,/expected_country=NZL/);
  assert.match(data,/batch_count=1/);
  assert.match(data,/continent=oceania/);
  assert.doesNotMatch(proc.stdout,/https?:\/\/|article|signature_base64|secret/i);
 }finally{rmSync(root,{force:true,recursive:true});}
});
