import test from "node:test";
import assert from "node:assert/strict";

import {readFileSync} from "node:fs";
import {mintApiKey,hash,settleVerifiedSuccess} from "../../services/commercial-api/src/metering.mjs";
import {parseBucketList} from "../ops/hot50-parity-proof.mjs";

test("stored API-key lookups retain SHA-256 compatibility for 256-bit CSPRNG tokens",()=>{
 const secrets=new Set();
 for(let i=0;i<128;i++){
  const {secret,hash:stored,prefix}=mintApiKey();
  assert.match(secret,/^gm_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(secret.slice("gm_live_".length),"base64url").length,32);
  assert.equal(prefix,secret.slice(0,16));
  assert.match(stored,/^[a-f0-9]{64}$/);


  assert(!secrets.has(secret));
  secrets.add(secret);
 }
});

test("canonical protocol commitment remains SHA-256 compatible with historical receipts",()=>{
 assert.equal(hash("geomacro-protocol-test-vector"),
  "3c20dc4664813a92179d99c6009952eccc66c70910ecb0d79c298c8b0d1cf2ee");
});

test("low-entropy or malformed keys fail before database/financial I/O",async()=>{
 const pool={connect(){throw Error("DATABASE_MUST_NOT_BE_TOUCHED")}};
 for(const apiKey of ["password123", "gm_live_"+"a".repeat(42), "", null]){
  await assert.rejects(settleVerifiedSuccess(pool,{
   apiKey,requestId:"00000000-0000-4000-8000-000000000000",subject:"USA",
   requestedTier:"basic",availableTiers:["basic"],riskByTier:{}
  }),error=>error.code==="INVALID_REQUEST");
 }
});

test("credit API authenticates only full server-minted token-shaped credentials",()=>{
 const src=readFileSync(new URL("../../services/commercial-api/src/risk-api.mjs",import.meta.url),"utf8");
 assert.match(src,/\^gm_live_\[A-Za-z0-9_-\]\{43\}\$/);
 // This contract is vital to treating API keys as high-entropy tokens, not
 // human-provided passwords, and retaining existing exact digest lookups.
 assert.match(src,/const keyHash=hash\(apiKey\)/);
});

test("CodeQL #138 URL key decoding cannot recursively unescape nested entities",()=>{
 const prefix="geomacro-evidence/v1/spool/";
 const base="geomacro-evidence%2Fv1%2Fspool%2F";
 const xml=key=>Buffer.from(`<ListBucketResult><EncodingType>url</EncodingType><KeyCount>1</KeyCount><IsTruncated>false</IsTruncated><Contents><Key>${key}</Key></Contents></ListBucketResult>`);
 assert.equal(parseBucketList(xml(base+"x%26amp%3By"),prefix).keys[0],prefix+"x&amp;y");
 assert.equal(parseBucketList(xml(base+"x%252Fy"),prefix).keys[0],prefix+"x%2Fy");
 assert.throws(()=>parseBucketList(xml(base+"x&amp;y"),prefix),/B2_LIST_KEY_ENTITY_INVALID/);
 assert.throws(()=>parseBucketList(xml(base+"bad%ZZ"),prefix),/B2_LIST_KEY_PERCENT_ENCODING_INVALID/);
 const next=Buffer.from(`<ListBucketResult><EncodingType>url</EncodingType><KeyCount>0</KeyCount><IsTruncated>true</IsTruncated><NextContinuationToken>a&amp;lt;b</NextContinuationToken></ListBucketResult>`);
 assert.equal(parseBucketList(next,prefix).cursor,"a&lt;b");
});
