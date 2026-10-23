import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";
import { verifyDerivedStory } from "../../workers/control-plane/src/website-derived-intelligence.mjs";

const model = readFileSync("src/lib/stateless-intelligence-model.ts","utf8");
const worker = readFileSync("workers/control-plane/src/website-derived-intelligence.mjs","utf8");

describe("website derived-only topic contract alignment",()=>{
  it("keeps every source classifier topic admitted by D1 without permitting unknown topics",()=>{
    const block=model.slice(model.indexOf("const TOPICS:"),model.indexOf("function tagValue("));
    const topics=[...block.matchAll(/\bname:\s*"([^"]+)"/gu)].map(x=>x[1]);
    expect(topics.length).toBeGreaterThan(10);
    const values=/const TOPICS = new Set\(\[([\s\S]*?)\]\);/u.exec(worker)?.[1]??"";
    const admitted=new Set([...values.matchAll(/"([^"]+)"/gu)].map(x=>x[1]));
    for(const topic of topics)expect(admitted.has(topic)).toBe(true);
    expect(admitted.has("banking and capital regulation")).toBe(true);
  });
  it("admits only original-dated derived Basel Macro cards, never raw/payable claims",()=>{
    const sample={
      id:"macro-aabb1122",category:"macro",
      title:"Geomacro finds official banking policy on prudential regulation",
      topic:"banking and capital regulation",
      why_it_matters:"Official prudential regulation can affect bank credit, but implementation and impacts require independent confirmation.",
      what_changed:"A first-party official institution published a prudential banking regulation development.",
      geography:null,development_type:"policy update",
      published_at:"2026-10-05T02:00:00.000Z",date_precision:"exact",
      observed_release_count:1,sources_credited:[],
      status:"official_release_observed_unscored",
      same_event_corrob_verified:false,severity:null,
    };
    const now=Date.parse("2026-10-13T00:00:00.000Z");
    expect(verifyDerivedStory(sample,now)).toBe(true);
    expect(verifyDerivedStory({...sample,source_url:"https://upstream.example"},now)).toBe(false);
    expect(verifyDerivedStory({...sample,severity:75},now)).toBe(false);
    expect(verifyDerivedStory({...sample,topic:"unknown policy"},now)).toBe(false);
    expect(verifyDerivedStory({...sample,published_at:"2026-10-13T00:00:00.001Z"},now)).toBe(false);
    expect(verifyDerivedStory({...sample,what_changed:"Raw https://www.other.example/article"},now)).toBe(false);
  });
});
