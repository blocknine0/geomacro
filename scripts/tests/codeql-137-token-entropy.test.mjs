import test from "node:test";
import assert from "node:assert/strict";
import {createHash} from "node:crypto";
import {readFileSync} from "node:fs";
import {mintApiKey,hash} from "../../services/commercial-api/src/metering.mjs";
import {parseBucketList} from "../ops/hot50-parity-proof.mjs";

test("stored API-key lookups retain SHA-256 compatibility for 256-bit CSPRNG tokens",()=>{
 const secrets=new Set();
 for(let i=0;i<128;i++){
  const {secret,hash:stored,prefix}=mintApiKey();
  assert.match(secret,/^gm_live_[A-Za-z0-9_-]{43}$/);
  assert.equal(Buffer.from(secret.slice("gm_live_".length),"base64url").length,32);
  assert.equal(prefix,secret.slice(0,16));
  assert.equal(stored,createHash("sha256").update(secret,"utf8").digest("hex"));
  assert.equal(stored,hash(secret));
  assert(!secrets.has(secret));
  secrets.add(secret);
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
});
