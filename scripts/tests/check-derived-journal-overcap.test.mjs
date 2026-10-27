import test from "node:test";
import assert from "node:assert/strict";
import {inspectDerivedJournalCount} from "../ops/check-derived-journal-overcap.mjs";
const raw=n=>[{success:true,results:[{journal_rows:n}]}];
test("a canonical 600-row journal never triggers speculative D1 cleanup",()=>{
 assert.deepEqual(inspectDerivedJournalCount(raw(600)),{row_count:600,over_capacity:false});
 assert.deepEqual(inspectDerivedJournalCount(raw(0)),{row_count:0,over_capacity:false});
 assert.deepEqual(inspectDerivedJournalCount(raw(601)),{row_count:601,over_capacity:true});
});
test("no malformed D1 response can authorize a maintenance sweep",()=>{
 for(const v of [[],[{}],[{success:false,results:[{journal_rows:601}]}],
  [{success:true,results:[]}],[{success:true,results:[{journal_rows:"601"}]}],
  [{success:true,results:[{journal_rows:-1}]}]])
 assert.throws(()=>inspectDerivedJournalCount(v),/UNVERIFIED/);
});
