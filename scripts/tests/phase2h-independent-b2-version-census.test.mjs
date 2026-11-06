import test from "node:test";
import assert from "node:assert/strict";
import {readFile} from "node:fs/promises";
import {verifyPhase2hB2VersionInventory,safeB2RetentionError} from "../ops/phase2h-independent-b2-version-census.mjs";

test("version inventory is retired before provider access because D1 index is authoritative",async()=>{
 let calls=0;
 const fetchImpl=async()=>{calls+=1;throw Error("must not call B2")};
 await assert.rejects(verifyPhase2hB2VersionInventory({fetchImpl}),/D1_FILE_INDEX_REQUIRED_NO_B2_LIST_API/u);
 assert.equal(calls,0);
});

test("redacted inventory error retains only the fixed no-list reason",()=>{
 assert.equal(safeB2RetentionError(Error("PHASE2H_B2_VERSION_D1_FILE_INDEX_REQUIRED_NO_B2_LIST_API")),
  "PHASE2H_B2_VERSION_D1_FILE_INDEX_REQUIRED_NO_B2_LIST_API");
 assert.match(safeB2RetentionError(Error("private-token")),/^PHASE2H_B2_VERSION_/u);
});

test("no production code calls the B2 object-version or bucket listing APIs",async()=>{
 const source=await readFile(new URL("../ops/phase2h-independent-b2-version-census.mjs",import.meta.url),"utf8");
 assert.doesNotMatch(source,/b2_list_|ListObjectsV2|list-type=2/u);
});
