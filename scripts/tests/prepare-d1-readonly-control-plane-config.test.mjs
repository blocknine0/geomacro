import test from "node:test";
import assert from "node:assert/strict";
import {existingReadOnlyControlPlaneD1Config as make}
  from "../ops/prepare-d1-readonly-control-plane-config.mjs";
const name="geomacro-control-plane",id="01234567-89ab-4cde-8fed-0123456789ab";
const template=JSON.stringify({name,main:"src/index.mjs",
  compatibility_date:"2026-10-03",d1_databases:[{binding:"DB",
    database_name:name,database_id:"REPLACE_WITH_D1_DATABASE_ID"}]});
test("only current preexisting D1 database binds; never creates",()=>{
  const got=make(JSON.stringify([{name,uuid:id},{name:"other",uuid:id}]),template);
  assert.deepEqual(got.d1_databases,[{binding:"DB",database_name:name,database_id:id}]);
  assert.equal(got.name,name);
  assert.equal(Object.hasOwn(got,"vars"),false);
  assert.equal(JSON.stringify(got).includes("CLOUDFLARE_API_TOKEN"),false);
});
test("missing, duplicate, wrong binding or forged ID fail closed",()=>{
  const badLists=[
    [],[{name:"unrelated",uuid:id}],
    [{name,uuid:"INVALID"}],
    [{name,uuid:id},{name,uuid:id}],
    [{name,uuid:id.slice(0,-1)+"z"}],
    [{name,id:"bad"}],
    [{name,uuid:123}],
  ];
  for(const items of badLists)
    assert.throws(()=>make(JSON.stringify(items),template),/D1_READONLY_EXISTING/);
  for(const wrong of [
    {name:"other",main:"src/index.mjs",compatibility_date:"2026-10-03",
      d1_databases:[{binding:"DB",database_name:name,database_id:"REPLACE_WITH_D1_DATABASE_ID"}]},
    {name,main:"src/index.mjs",compatibility_date:"2026-10-03",
      d1_databases:[{binding:"OTHER",database_name:name,database_id:"REPLACE_WITH_D1_DATABASE_ID"}]},
  ])assert.throws(()=>make(JSON.stringify([{name,uuid:id}]),JSON.stringify(wrong)));
});
test("strict read-only workflow calls list, temp config and only SELECT",()=>{
  const {readFileSync}=await import("node:fs");
  for(const path of [".github/workflows/expanded-official-source-observation.yml",
    ".github/workflows/free-three-domain-country-gap-ledger.yml"]){
    const text=readFileSync(path,"utf8");
    assert.match(text,/d1 list --json/u);
    assert.match(text,/prepare-d1-readonly-control-plane-config\.mjs/u);
    assert.match(text,/d1 execute DB/u);
    assert.match(text,/--config "\$readonly_config"/u);
    assert.doesNotMatch(text,/d1 create/u);
    assert.doesNotMatch(text,/d1 migrations apply/u);
  }
});
