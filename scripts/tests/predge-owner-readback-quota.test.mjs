import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";
import {publishPredgePilotCheckV2} from "../../workers/control-plane/src/predge-pilot-check-v2.mjs";

const now=Date.parse("2026-11-03T00:00:00Z");
const admin="c".repeat(64);
const url="https://example.test/v1/internal/predge-pilot-news-context-publish";

test("owner-only readback denies unauthenticated requests before any D1 access",async()=>{
  let reads=0;
  const env={CONTROL_PLANE_TOKEN:admin,DB:{prepare(){reads++;throw Error("D1 denied");}}};
  const response=await publishPredgePilotCheckV2(new Request(url),env,now);
  assert.equal(response.status,401);
  assert.equal(reads,0);
});

test("owner-only readback fails closed on missing active key registry",async()=>{
  let reads=0;
  const env={CONTROL_PLANE_TOKEN:admin,DB:{prepare(){reads++;throw Error("D1 denied");}}};
  const response=await publishPredgePilotCheckV2(new Request(url,{
    headers:{authorization:"Bearer "+admin}}),env,now);
  assert.equal(response.status,503);
  assert.equal(reads,0);
});

test("publication reads owner endpoint without consuming partner quota",()=>{
  const source=readFileSync("scripts/ops/publish-predge-pilot-check-v2.mjs","utf8");
  assert.match(source,/partner_check_quota_consumed:false/);
  assert.match(source,/\/v1\/internal\/predge-pilot-news-context-publish/);
  assert.doesNotMatch(source,/const get=await fetch\(BASE\+"\/v1\/pilot\/check"/);
});
