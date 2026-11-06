import test from "node:test";
import assert from "node:assert/strict";
import {listOwnerExports,assertExportFileIsPrivate} from "./telegram-export-ingest.mjs";

test("Telegram owner exports do not call B2 listing APIs",async()=>{
 let calls=0;
 await assert.rejects(listOwnerExports({fetchImpl:async()=>{calls+=1}}),
  /TELEGRAM_EXPORT_D1_INDEX_REQUIRED_NO_B2_LIST_API/u);
 assert.equal(calls,0);
});

test("refuse any supplied input path resolving inside public repo",()=>{
 const p=process.cwd()+"/private-export.json";
 assert.throws(()=>assertExportFileIsPrivate(p),/TELEGRAM_EXPORT_INPUT_MUST_BE_PRIVATE/u);
 assert.throws(()=>assertExportFileIsPrivate("./private-export.json"),/TELEGRAM_EXPORT_INPUT_MUST_BE_PRIVATE/u);
});
