import {describe,expect,it} from "vitest";
import {readFileSync} from "node:fs";
import {originalSourceIsCurrent} from "../../workers/shared/current-source-clock.mjs";

describe("outside-in signed Edge deploy acceptance must prove current originals",()=>{
 const products=["intelligence","global-risk","risk-indices"] as const;
 for(const name of products){
  it(name+" rejects obsolete October snapshots and old POP Worker 200",()=>{
   const workflow=readFileSync(".github/workflows/deploy-"+name+"-edge.yml","utf8");
   const worker=readFileSync("workers/"+name+"-edge/src/index.mjs","utf8");
   expect(workflow).toContain("originalSourceIsCurrent");
   expect(workflow).toContain("x-geomacro-native-clock-contract");
   expect(workflow).toContain("x-geomacro-source-as-of");
   expect(workflow).toContain("live-60m-v1");
   expect(workflow).toContain("stale-if-error");
   expect(worker.match(/"x-geomacro-native-clock-contract": "live-60m-v1"/g)).toHaveLength(3);
   expect(worker).toContain("liveEdgeCacheControl");
  });
 }
 it("source-native Oct 8 Intelligence, GRI and Indices cannot pass Oct 17 acceptance",()=>{
  const now=Date.parse("2026-10-17T14:32:29.000Z");
  expect(originalSourceIsCurrent("2026-10-08T22:09:36.639+00:00",now)).toBe(false);
  expect(originalSourceIsCurrent("2026-10-08T05:53:05.373+00:00",now)).toBe(false);
  expect(originalSourceIsCurrent("2026-10-17T14:00:00.000Z",now)).toBe(true);
 });
});
