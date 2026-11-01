import test from "node:test";
import assert from "node:assert/strict";
import {isCriticalMineralsSubject} from "./critical-minerals-subject-evidence.mjs";
const signal=(title,what_changed="A source reported a dated development in the affected industry.")=>({title:"Geomacro finds "+title,what_changed});
test("reject generic energy, refinery attack and fuel-price observations as minerals",()=>{
 for(const title of [
  "Turkey urged peace as refinery strikes raised fuel price worries",
  "Russia announced drone attack hit major oil refinery",
  "Saudi Arabia warned that LNG tanker was attacked",
  "Iran said energy security was affected by oil production outage",
  "Officials announced generic industrial supply chain cooperation"
 ])assert.equal(isCriticalMineralsSubject(signal(title)),false,title);
});
test("accept mineral-specific investment, exports, mining, processing and context",()=>{
 for(const title of [
  "Canada announced new lithium processing capacity",
  "China approved rare earth magnet export licenses",
  "Chile reported copper mining output",
  "Australia approved critical minerals development funding",
  "European Commission announced gallium supply chain initiative",
  "Rubio said G20 talks focused on critical minerals and supply chains",
  "Agency announced battery-grade graphite refinery capacity",
  "Minister announced mineral exploration permits"
 ])assert.equal(isCriticalMineralsSubject(signal(title)),true,title);
});
test("never promote a generic context without material evidence",()=>{
 assert.equal(isCriticalMineralsSubject({title:"Geomacro finds government announced new refining project",what_changed:"The government announced an energy refining investment."}),false);
 assert.equal(isCriticalMineralsSubject({title:"Geomacro finds government announced new refinery",what_changed:"The government announced a nickel smelter project."}),true);
 assert.equal(isCriticalMineralsSubject(null),false);
});
