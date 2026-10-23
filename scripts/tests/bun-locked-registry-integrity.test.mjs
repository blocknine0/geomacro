import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("all external Bun tarball pins use public npm; integrity pins remain required",()=>{
 const lock=readFileSync("bun.lock","utf8");
 assert.equal(lock.includes("europe-west1-npm.pkg.dev"),false);
 assert.equal(lock.includes("lovable-core-prod/sandbox-npm-cache"),false);
 const matches=[...lock.matchAll(/"([^"\\n]+)": \["([^"\\n]+)", "(https:\/\/[^"\\n]+\.tgz)", ([^\n]+)$/gm)];
 assert.ok(matches.length>=30,"expected pinned registry tarballs");
 for(const [,name,versioned,url,rest] of matches){
  assert.ok(url.startsWith("https://registry.npmjs.org/"),name);
  assert.ok(url.endsWith(".tgz"),name);
  assert.match(rest,/sha512-[A-Za-z0-9+/=]+/u,name);
  assert.ok(versioned.includes("@"),name);
 }
});
