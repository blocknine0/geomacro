import { reconcileMineralEvidence } from "../engine/minerals-reconciliation.mjs";
import assert from "node:assert/strict";

const result=reconcileMineralEvidence({
  production:[
    {raw:{country_iso3:"COD",mineral:"cobalt",year:2024,evidence_type:"PRODUCTION",value:180,unit:"tonnes",source_id:"usgs"}},
    {raw:{country_iso3:"COD",mineral:"cobalt",year:2024,evidence_type:"PRODUCTION",value:175,unit:"tonnes",source_id:"bgs"}}
  ],
  trade:[
    {raw:{country_iso3:"COD",mineral:"cobalt",year:2024,evidence_type:"TRADE_EXPORT",value:200,unit:"usd",source_id:"comtrade"}}
  ],
  historical:[
    {raw:{country_iso3:"COD",mineral:"cobalt",year:2024,evidence_type:"PRODUCTION",value:176,unit:"tonnes",source_id:"geomacro_historical_rare_earths",published_at:"2025-01-01T00:00:00Z"}}
  ],
  now:new Date("2026-09-23T00:00:00Z")
});

assert.equal(result.length,1);
assert.equal(result[0].status,"PRODUCTION_AND_TRADE");
assert.equal(result[0].production_agreement.status,"CROSS_SOURCE_SUPPORTED");
assert.equal(result[0].trade_is_not_production,true);
assert.ok(result[0].conflicts.length>=1);
assert.equal(result[0].independent_sources.length,4);
console.log(JSON.stringify({status:"PASS",groups:result.length,conflicts:result[0].conflicts},null,2));
