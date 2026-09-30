#!/usr/bin/env node
import { readFileSync } from "node:fs";
const archive = readFileSync(".github/workflows/fragment-b2-archive-canary.yml", "utf8");
const cleanup = readFileSync(".github/workflows/fragment-b2-verified-cleanup.yml", "utf8");
const offload = readFileSync("scripts/ops/b2-fragment-archive-offload.mjs", "utf8");
const restore = readFileSync("scripts/ops/b2-fragment-restore.mjs", "utf8");
const must = (ok, message) => { if (!ok) throw new Error(message); };
must(archive.includes('B2_FRAGMENT_DELETE_SOURCE: "0"'), "archive canary must disable source deletion");
must(cleanup.includes('B2_FRAGMENT_ARCHIVE_LIMIT: "1"'), "cleanup canary must remain single-fragment");
must(cleanup.includes('VERIFIED_RESTORE_PASSED'), "cleanup must require restore acknowledgement");
must(offload.includes('handled < itemCount'), "cleanup must retain fully-handled gate");
must(offload.includes('storage.remove([sourcePath])'), "cleanup must use Storage API removal");
must(!offload.includes('delete from storage.objects'), "direct storage.objects SQL delete is forbidden");
must(restore.includes('B2_FRAGMENT_RESTORE_B2_HASH_INVALID'), "restore must verify B2 hash");
must(restore.includes('B2_FRAGMENT_RESTORE_POST_HASH_INVALID'), "restore must verify post-restore hash");
console.log(JSON.stringify({ ok: true, invariant: "fail-closed-fragment-b2-recovery" }));
