import {test} from "node:test";
import assert from "node:assert/strict";
import {selectGovernedB2WriterCredentials as select} from "../lib/governed-source-b2-writer-credentials.mjs";
test("dedicated scoped writer is preferred atomically when both existing credentials are paired",()=>{
 const a=select({B2_KEY_ID:"legacy-id",B2_APPLICATION_KEY:"legacy-secret",
  B2_ARCHIVE_WRITE_KEY_ID:"write-id",B2_ARCHIVE_WRITE_APPLICATION_KEY:"write-secret"});
 assert.equal(a.role,"DEDICATED_ARCHIVE_WRITER");
 assert.equal(a.accessKey,"write-id");
 assert.equal(a.secretKey,"write-secret");
 assert.equal(a.credential_validation_requires_real_put,true);
 assert.equal(a.authenticated,false);
 assert.equal(a.authorized_bucket,"geomacro-private-archive");
});
test("legacy pair remains supported if no dedicated key is configured",()=>{
 const a=select({B2_KEY_ID:"existing-id",B2_APPLICATION_KEY:"existing-secret"});
 assert.equal(a.role,"LEGACY_ARCHIVE_WRITER");
 assert.equal(a.accessKey,"existing-id");
});
test("partial dedicated OR legacy pair fails before any network rather than using another key",()=>{
 for(const env of [
  {B2_ARCHIVE_WRITE_KEY_ID:"a",B2_KEY_ID:"b",B2_APPLICATION_KEY:"c"},
  {B2_ARCHIVE_WRITE_APPLICATION_KEY:"s",B2_KEY_ID:"b",B2_APPLICATION_KEY:"c"},
  {B2_ARCHIVE_WRITE_KEY_ID:"a",B2_ARCHIVE_WRITE_APPLICATION_KEY:"s",B2_KEY_ID:"b"},
  {B2_KEY_ID:"b"},
  {},
 ])assert.throws(()=>select(env),/GOVERNED_B2_.*_INCOMPLETE|GOVERNED_B2_WRITE_CREDENTIALS_MISSING/);
});
test("selection is pure and its printed role can never disclose actual B2 secret",()=>{
 const env={B2_ARCHIVE_WRITE_KEY_ID:"MY_PRIVATE_ID",
  B2_ARCHIVE_WRITE_APPLICATION_KEY:"MY_PRIVATE_SECRET"};
 const a=select(env);
 const safe=JSON.stringify({role:a.role,authenticated:a.authenticated,
  credential_validation_requires_real_put:a.credential_validation_requires_real_put});
 assert.equal(safe.includes("MY_PRIVATE"),false);
 assert.equal(a.role,"DEDICATED_ARCHIVE_WRITER");
});
