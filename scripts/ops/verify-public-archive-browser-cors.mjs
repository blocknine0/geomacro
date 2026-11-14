#!/usr/bin/env node
/** Assert that the just deployed public archive is actually browser-readable.
 * Read-only: no provider DB, storage billing, originals, reviewer or payments.
 */
import {readFileSync} from "node:fs";
import {verifyPublicArchiveBrowserCors} from "../lib/verify-public-archive-browser-cors.mjs";

const root="workers/public-finds-archive/assets";
const index=JSON.parse(readFileSync(root+"/index.json","utf8"));
const receipt=await verifyPublicArchiveBrowserCors({index,assetRoot:root});
console.log(JSON.stringify(receipt));
