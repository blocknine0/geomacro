// Fail closed on every root and nested vulnerable Zod release.
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
const version="4.6.6";
const integrity="sha512-4UmzQUF5fxvfcYHlbjBmejU+w+hbDnWFx4aS8kBx7nPBHcO2SqPbpAG8snbdg+Xse4pRefR98hgjFgIMCI/UhA==";
const pkg=JSON.parse(readFileSync(new URL("../../package.json",import.meta.url),"utf8"));
const lockText=readFileSync(new URL("../../bun.lock",import.meta.url),"utf8");
const lock=JSON.parse(lockText.replace(/,(\s*[}\]])/g,"$1"));
assert.equal(pkg.dependencies?.zod,version);
assert.equal(pkg.overrides?.zod,version);
assert.equal(pkg.resolutions?.zod,version);
assert.equal(lock.workspaces?.[""]?.dependencies?.zod,version);
assert.equal(lock.overrides?.zod,version);
const copies=Object.entries(lock.packages??{}).filter(([key])=>key==="zod"||key.endsWith("/zod"));
assert.ok(copies.length>0);
for(const [key,entry] of copies){
 assert.equal(entry[0],"zod@"+version,"Unpatched "+key);
 assert.equal(entry[3],integrity,"Bad tarball integrity "+key);
}
console.log("PASS: "+copies.length+" Zod copies patched and pinned");
