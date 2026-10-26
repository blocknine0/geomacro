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

// CI dependency audit uncovered undici DoS GHSA-4qv8-2p9j-2685 / GHSA-xjj6-f33q-929c.
assert.equal(pkg.overrides?.undici,"6.29.1","Undici must remain patched");
assert.equal(pkg.resolutions?.undici,"6.29.1","Undici resolution must remain patched");
assert.equal(lock.overrides?.undici,"6.29.1","Bun undici override must match");
const undiciCopies=Object.entries(lock.packages??{}).filter(([key])=>key==="undici"||key.endsWith("/undici"));
assert.ok(undiciCopies.length>0,"Missing undici lockfile entry");
for (const [key,entry] of undiciCopies){
 assert.equal(entry[0],"undici@6.29.1","Unpatched undici at "+key);
 assert.equal(entry[3],"sha512-EvRlUt/QqAEvXdQeRMYUfwOQsfzpDztykrG2owGEE/rBOBoYv9uF39ZzsNDh4lTFHhTr2XOZjKkYgueD12ZmGA==","Undici integrity mismatch at "+key);
}
console.log("PASS: "+undiciCopies.length+" undici copies patched");
