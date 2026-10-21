import {test} from "node:test";
import assert from "node:assert/strict";
import {classifyLegacyStorageResponse,isRetryableOriginalStorageCategory,retryDelayMs} from "./legacy-storage-transport-policy.mjs";
test("retry only transient errors; missing objects and bad credentials must block deletion",()=>{
 for(const status of [408,425,429,500,502,503,504,520,522,524])
   assert.equal(classifyLegacyStorageResponse(status),"SOURCE_TRANSIENT_HTTP");
 for(const status of [401,403]) assert.equal(classifyLegacyStorageResponse(status),"SOURCE_AUTHORIZATION_DENIED");
 for(const status of [404,410]) assert.equal(classifyLegacyStorageResponse(status),"SOURCE_OBJECT_MISSING");
 for(const category of ["SOURCE_AUTHORIZATION_DENIED","SOURCE_OBJECT_MISSING","SOURCE_LENGTH_MISMATCH","SOURCE_UNEXPECTED_HTTP"])
   assert.equal(isRetryableOriginalStorageCategory(category),false);
 assert.equal(isRetryableOriginalStorageCategory("SOURCE_NETWORK_OR_TIMEOUT"),true);
});
test("bounded exponential backoff respects numerical Retry-After",()=>{
 assert.equal(retryDelayMs(0,""),1000);
 assert.equal(retryDelayMs(1,"9"),9000);
 assert.equal(retryDelayMs(5,"999"),16000);
 assert.equal(retryDelayMs(4,"20"),20000);
 assert.throws(()=>retryDelayMs(40,""));
});
