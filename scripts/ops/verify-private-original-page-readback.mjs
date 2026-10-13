#!/usr/bin/env node
// #2044: owner-only, bounded actual first-party original article re-read.
// Original source URLs appear ONLY on protected stdin; stdout is sanitized.
import {readFileSync} from "node:fs";
import {verifyGeomacroOriginalPages} from "../lib/geomacro-original-page-readback.mjs";
try {
  if(process.argv.length!==2)
    throw Error("GEOMACRO_PRIVATE_ORIGINAL_INPUT_REQUIRED");
  const bytes=readFileSync(0);
  if(bytes.byteLength<10||bytes.byteLength>24*1024)
    throw Error("GEOMACRO_PRIVATE_ORIGINAL_INPUT_INVALID");
  const data=JSON.parse(bytes.toString("utf8"));
  if(data?.schema!=="geomacro.private-original-page-readback-input.v1" ||
     !Array.isArray(data.originals))
    throw Error("GEOMACRO_PRIVATE_ORIGINAL_INPUT_INVALID");
  const result=await verifyGeomacroOriginalPages({originals:data.originals});
  process.stdout.write(JSON.stringify(result)+"\n");
  if(!result.original_pages_authenticity_and_clock_verified)
    process.exitCode=2;
} catch {
  // Fail with fixed code only, never print private URL/source/HTML/error text.
  process.stderr.write(JSON.stringify({
    schema:"geomacro.private-two-original-page-readback.v1",
    error:"GEOMACRO_PRIVATE_ORIGINAL_READBACK_REJECTED",
    commercial_eligible:false,payment_authorized:false,
    raw_source_exposed:false,
  })+"\n");
  process.exitCode=2;
}
