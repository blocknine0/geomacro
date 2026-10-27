#!/usr/bin/env node
/**
 * Manual protected-main disaster recovery: one exact private R2 ciphertext
 * object -> original 25h clock and AES-GCM -> canonical D1 write/readback.
 * No raw originals, public feed, payment, signing or PREDGE interaction.
 */
import {createHmac} from "node:crypto";
import {readEncryptedOsintFromPrivateR2}
 from "../lib/private-osint-r2-encrypted-escrow.mjs";
import {persistPrivateOsintBatch}
 from "../lib/private-osint-15m-durable-publisher.mjs";
import {planPrivateOsintEncryptedReplay,canDeletePrivateOsintSpoolArtifacts}
 from "../lib/private-osint-encrypted-spool.mjs";
import {buildPrivateSourceSharedReadManifest}
 from "../lib/private-osint-shared-read-contract.mjs";

if(process.env.GITHUB_REPOSITORY!=="blocknine0/geomacro"||
 process.env.GITHUB_REF!=="refs/heads/main"||
 process.env.GITHUB_EVENT_NAME!=="workflow_dispatch"||
 process.env.GEOMACRO_OSINT_R2_RESTORE_ADMISSION!=="CRITICAL_TRUE")
 throw Error("PRIVATE_OSINT_R2_RESTORE_PROTECTED_MAIN_ADMISSION_REQUIRED");
const root=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN;
if(typeof root!=="string"||root.length<32)
 throw Error("PRIVATE_OSINT_R2_RESTORE_TOKEN_MISSING");
const key=process.env.GEOMACRO_OSINT_R2_RESTORE_OBJECT_KEY;
const restored=await readEncryptedOsintFromPrivateR2({objectKey:key,root});
const planned=planPrivateOsintEncryptedReplay([restored.decoded]);
const privateToken=createHmac("sha256",
 createHmac("sha256",root).update("geomacro-control-plane-v1").digest("hex"))
 .update("geomacro-private-osint-15m-v1").digest("hex");
const receipt=await persistPrivateOsintBatch({
 result:{schema:"geomacro.private-osint-15m-batch.v1",items:planned.items,checks:[]},
 privateToken,
 controlPlaneRoot:"https://geomacro-control-plane.daspallab202391.workers.dev",
 now:Date.now(),sourceHealthSnapshotSlots:3,
});
const digest=buildPrivateSourceSharedReadManifest(planned.items,Date.now());
if(receipt.shared_source_read_content_sha256!==digest.content_sha256||
 receipt.shared_source_read_item_count!==planned.items.length||
 !canDeletePrivateOsintSpoolArtifacts(receipt,planned))
 throw Error("PRIVATE_OSINT_R2_CANONICAL_D1_READBACK_NOT_VERIFIED");
console.log(JSON.stringify({
 schema:"geomacro.private-osint-r2-to-d1-restore-receipt.v1",
 protected_origin:"AUTHENTICATED_R2_CIPHERTEXT",
 original_object_sha256:restored.encrypted_sha256,
 exact_source_neutral_sha256:digest.content_sha256,
 eligible_observations:planned.items.length,
 expired_observations_excluded:planned.expired,
 persisted_and_verified_in_d1:receipt.news_rows_verified_in_d1,
 d1_capacity_excluded:receipt.excluded_by_d1_capacity,
 independent_private_d1_readback_verified:true,
 original_page_independently_verified:false,
 public_news_published:false,commercial_rights_authorized:false,
 source_original_clock_extended:false,
 private_r2_evidence_not_deleted:true,
 predge_untouched:true,
}));
