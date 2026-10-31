import test from "node:test";
import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

// Canonical Bun 1.4.2 writes an empty tarball URL for the default public npm
// registry. That is NOT missing integrity metadata: every registry package
// must still carry an immutable sha512 SRI pin. Explicit URLs, if present,
// must be public npm; private mirror origins are never accepted.
test("all external Bun tarball pins use public npm; integrity pins remain required",()=>{
 const lock=readFileSync("bun.lock","utf8");
 assert.equal(lock.includes("europe-west1-npm.pkg.dev"),false);
 assert.equal(lock.includes("lovable-core-prod/sandbox-npm-cache"),false);
 const lines=lock.split("\n");
 const packages=lines.filter(line=>/^\s*"[^"]+": \["[^"]+@[^"]+", "(?:[^"]*)",/u.test(line));
 assert.ok(packages.length>=250,"expected immutable npm registry package records");
 for(const line of packages) {
   const match=line.match(/^\s*"([^"]+)": \["([^"]+)", "([^"]*)",/u);
   assert.ok(match,"unexpected Bun lockfile registry package shape");
   const [,name,versioned,url]=match;
   assert.ok(versioned.includes("@"),name);
   assert.match(line,/"sha512-[A-Za-z0-9+/=]+"/u,name);
   if(url)assert.match(url,/^https:\/\/registry\.npmjs\.org\/.+\.tgz$/u,name);
 }
 const urls=lines.filter(line=>line.includes("https://")&&line.includes(".tgz"));
 for(const line of urls) {
   const match=line.match(/^\s*"([^"]+)": \["([^"]+)", "(https:\/\/[^"]+\.tgz)",/u);
   assert.ok(match,"unrecognized explicit tarball pin");
   assert.ok(match[3].startsWith("https://registry.npmjs.org/"),match[1]);
   assert.match(line,/"sha512-[A-Za-z0-9+/=]+"/u,match[1]);
 }
});
