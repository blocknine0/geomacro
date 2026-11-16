import test from "node:test";
import assert from "node:assert/strict";
import {concreteOsintPublication} from "./concrete-osint-publication.mjs";

const examples=[
  {category:"geopolitics",title:"Yemen Ministry of Transport introduces Red Sea tanker transit controls",
    event:{headline:"Yemen Ministry introduces new transit controls",change:"Yemen Ministry of Transport introduced Red Sea tanker transit controls."},
    country:"Red Sea Maritime Corridor",iso3:"YEM",market:"freight and marine insurance rates"},
  {category:"macro",title:"Bank of Japan announces policy rate decision for Japan",
    event:{headline:"Bank of Japan announced its policy decision",change:"Bank of Japan announced a change to its policy rate guidance for Japan."},
    country:"Japan",iso3:"JPN",market:"USD/JPY"},
  {category:"rare_earth",title:"Chile Ministry of Mines approves copper processing project",
    event:{headline:"Chile Ministry approves new copper processing project",change:"Chile's Ministry of Mines approved a copper processing project."},
    country:"Chile",iso3:"CHL",market:"COMEX copper benchmark"},
];

test("concrete public findings use transformed actions, explicit locations, price channels and safe posture",()=>{
  for(const example of examples){
    const finding=concreteOsintPublication(example);
    assert.ok(finding,example.category);
    assert.match(finding.title,new RegExp(example.country,"u"));
    assert.match(finding.title,/^GeoMacro (Geopolitics|Macro\/FX|Critical Minerals) Brief · .+ — .+$/u);
    assert.match(finding.what_changed,/^WHAT CHANGED: GeoMacro's dated transformation records/u);
    assert.match(finding.why_it_matters,new RegExp(example.market,"u"));
    assert.match(finding.why_it_matters,/Risk: .* → Downstream effect: .* → Price impact channel: .*Action Posture: (CONTINUE|REDUCE_LIMIT|REQUIRE_APPROVAL|PAUSE)/u);
    assert.notEqual(finding.title,example.title);
    assert.doesNotMatch(JSON.stringify(finding),new RegExp(example.event.change.replace(/[.*+?^${}()|[\]\\]/gu,"\\$&"),"u"));
    assert.equal(finding.country_iso3,example.iso3);
    assert.ok(!JSON.stringify(finding).includes("https://"));
  }
});

test("ambiguous locations, missing actions, unsupported subjects and copied headlines fail closed",()=>{
  assert.equal(concreteOsintPublication({category:"macro",title:"Central bank reports financial conditions",
    event:{headline:"Central bank reports financial conditions",change:"Central bank reports financial conditions across regions."}}),null);
  assert.equal(concreteOsintPublication({category:"macro",title:"Japan updates its monetary policy",
    event:null,country_iso3:"JPN"}).event_direction,"uncertain");
  assert.equal(concreteOsintPublication({category:"macro",title:"Japan updates its policy status",
    event:null,country_iso3:"JPN"}),null);
});
