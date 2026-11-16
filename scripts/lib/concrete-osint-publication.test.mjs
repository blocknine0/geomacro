import test from "node:test";
import assert from "node:assert/strict";
import {concreteOsintPublication} from "./concrete-osint-publication.mjs";

const examples=[
  {category:"geopolitics",title:"Yemen Ministry of Transport introduces Red Sea tanker transit controls",
    event:{headline:"Yemen Ministry introduces new transit controls",change:"Yemen Ministry of Transport introduced Red Sea tanker transit controls."},
    country:"Red Sea Maritime Corridor",market:"freight and marine insurance rates"},
  {category:"macro",title:"Bank of Japan announces policy rate decision for Japan",
    event:{headline:"Bank of Japan announced its policy decision",change:"Bank of Japan announced a change to its policy rate guidance for Japan."},
    country:"Japan",market:"USD/JPY"},
  {category:"rare_earth",title:"Chile Ministry of Mines approves copper processing project",
    event:{headline:"Chile Ministry approves new copper processing project",change:"Chile's Ministry of Mines approved a copper processing project."},
    country:"Chile",market:"COMEX copper benchmark"},
];

test("concrete public findings use transformed actions, explicit locations, price channels and safe posture",()=>{
  for(const example of examples){
    const finding=concreteOsintPublication(example);
    assert.ok(finding,example.category);
    assert.match(finding.title,new RegExp(example.country,"u"));
    assert.match(finding.what_changed,/Unverified feed observation:/u);
    assert.match(finding.why_it_matters,new RegExp(example.market,"u"));
    assert.match(finding.why_it_matters,/Action Posture: REQUIRE_APPROVAL/u);
    assert.notEqual(finding.title.replace(/^Geomacro finds /u,""),example.title);
    assert.ok(!JSON.stringify(finding).includes("https://"));
  }
});

test("ambiguous locations, missing actions, unsupported subjects and copied headlines fail closed",()=>{
  assert.equal(concreteOsintPublication({category:"macro",title:"Central bank reports financial conditions",
    event:{headline:"Central bank reports financial conditions",change:"Central bank reports financial conditions across regions."}}),null);
  assert.equal(concreteOsintPublication({category:"macro",title:"Japan updates its monetary policy",
    event:null}),null);
  assert.equal(concreteOsintPublication({category:"macro",title:"Japan updates its monetary policy",
    event:{headline:"Japan updates its monetary policy",change:"Japan updates its monetary policy in a release."}}),null);
});
