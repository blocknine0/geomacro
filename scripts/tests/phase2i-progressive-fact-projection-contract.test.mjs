import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const source=readFileSync(new URL("../ops/phase2i-source-only-raw-tick.ts",import.meta.url),"utf8");

test("only exact D1-readback-confirmed native items are projected to progressive facts",()=>{
 const stage=source.indexOf("if(stage.selected_count>0&&stage.d1_readback_verified!==true)");
 const projection=source.indexOf("projectProgressiveFacts(indexed.candidates,verifiedIds)");
 const verified=source.indexOf("const verifiedIds=new Set(stage.verified_record_ids??[])");
 assert.ok(stage>=0&&verified>stage&&projection>verified);
 assert.match(source,/verifiedIds\.has\(createHash\("sha256"\)/u);
 assert.match(source,/privateOsintCountryMention\(c\.title,COUNTRIES_195\)/u);
});

test("progressive projection sends metadata digests only and preserves unverified rights",()=>{
 const block=source.slice(source.indexOf("async function projectProgressiveFacts"),
  source.indexOf("const root=String(env.GEOMACRO_COMMERCE_LEDGER_TOKEN"));
 assert.match(block,/event_fingerprint:fingerprint/u);
 assert.match(block,/rights_verified:false,commercial_eligible:false/u);
 assert.match(block,/source_text_sent:false/u);
 assert.doesNotMatch(block,/title:\s*c\.title|summary:\s*c\.title|body:\s*c\./u);
});
