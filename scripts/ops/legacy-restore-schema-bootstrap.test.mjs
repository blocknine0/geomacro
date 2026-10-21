import {test} from "node:test";
import assert from "node:assert/strict";
import {archiveDefinesSchema,privateMissingSchema,safeSchemaList} from "./legacy-restore-schema-bootstrap.mjs";
test("PG17 default public is retained when absent in TOC",()=>{
 assert.equal(archiveDefinesSchema("7; 1259 222 TABLE public live_structured_events postgres","public"),false);
 assert.equal(privateMissingSchema('pg_restore: error: ERROR:  schema "public" does not exist',"7; 1259 222 TABLE public test postgres"),"public");
});
test("never duplicate a schema already defined in old original archive",()=>{
 const toc="7; 2615 2200 SCHEMA - auth postgres\n8; 1259 222 TABLE auth users postgres";
 assert.equal(archiveDefinesSchema(toc,"auth"),true);
 assert.equal(privateMissingSchema('pg_restore: ERROR: schema "auth" does not exist',toc),null);
});
test("allow only already inspected first-party infrastructure names",()=>{
 assert.equal(privateMissingSchema('pg_restore: ERROR: schema "realtime" does not exist',""),"realtime");
 assert.equal(privateMissingSchema('pg_restore: ERROR: schema "private_customer" does not exist',""),null);
 assert.equal(privateMissingSchema('pg_restore: ERROR: schema "realtime" does not exist',"",["realtime"]),null);
 assert.throws(()=>safeSchemaList(["private_customer"]));
});
test("do not interpret later errors; no SQL identifier is output to customer",()=>{
 assert.equal(privateMissingSchema('ERROR: function private_salary() does not exist\nERROR: schema "auth" does not exist',""),null);
});
