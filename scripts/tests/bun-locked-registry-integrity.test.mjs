import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

test("all external Bun tarball pins use public npm; integrity pins remain required",()=>{
 const lock=readFileSync("bun.lock","utf8");
 assert.equal(lock.includes("europe-west1-npm.pkg.dev"),false);
 assert.equal(lock.includes("lovable-core-prod/sandbox-npm-cache"),false);
 const lines=lock.split("\n").filter(line=>line.includes("https://")&&line.includes(".tgz"));
 assert.ok(lines.length>=30,"expected pinned registry tarballs");
 for(const line of lines){
  const match=line.match(/^\s*"([^"]+)": \["([^"]+)", "(https:\/\/[^"]+\.tgz)",/u);
  assert.ok(match,"unexpected Bun lockfile tarball shape");
  const [,name,versioned,url]=match;
  assert.ok(url.startsWith("https://registry.npmjs.org/"),name);
  assert.ok(versioned.includes("@"),name);
  assert.match(line,/"sha512-[A-Za-z0-9+/=]+"/u,name);
 }
});
