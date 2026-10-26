import test from "node:test";
import assert from "node:assert/strict";
import {parseOwnerExportList,assertExportFileIsPrivate,decodeXmlTextOnce}
 from "./telegram-export-ingest.mjs";

test("owner can upload actual Telegram Desktop result.json, or SHA256 named exports",()=>{
 const key="a".repeat(64)+".json";
 const xml="<ListBucketResult xmlns=\"http://s3.amazonaws.com/doc/2006-03-01/\">"+
   "<Contents><Key>telegram/owner-exports/result.json</Key><Size>735</Size></Contents>"+
   "<Contents><Key>telegram/owner-exports/"+key+"</Key><Size>2048</Size></Contents>"+
   "<Contents><Key>telegram/owner-exports/@privatechat.json</Key><Size>2048</Size></Contents>"+
   "<Contents><Key>telegram/leads/x.json</Key><Size>2048</Size></Contents>"+
   "<IsTruncated>false</IsTruncated></ListBucketResult>";
 const items=parseOwnerExportList(xml);
 assert.equal(items.length,2);
 assert(items[0].key.endsWith("/result.json"));
 assert(items[1].key.endsWith("/"+key));
});
test("truncated B2 list fails closed without silently omitting source files",()=>{
 assert.throws(()=>parseOwnerExportList("<ListBucketResult><IsTruncated>true</IsTruncated></ListBucketResult>"),
 /TELEGRAM_EXPORT_PRODUCTION_FAIL_CLOSED/);
});
test("refuse any supplied input path resolving inside public repo",()=>{
 const p=process.cwd()+"/private-export.json";
 assert.throws(()=>assertExportFileIsPrivate(p),/TELEGRAM_EXPORT_INPUT_MUST_BE_PRIVATE/);
 assert.throws(()=>assertExportFileIsPrivate("./private-export.json"),/TELEGRAM_EXPORT_INPUT_MUST_BE_PRIVATE/);
});

test("B2 XML entities are decoded exactly once, never double-unescaped",()=>{
 assert.equal(decodeXmlTextOnce("&amp;lt; &lt; &amp;amp; &amp;gt;"),"&lt; < &amp; &gt;");
});
