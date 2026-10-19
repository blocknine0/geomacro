/**
 * One verified private B2 object for the canonical scoring stage AND its
 * source-companion. The two independent logical SHA-256 digests survive
 * packing, but only one signed PUT + one independent full-body GET is needed.
 * Never exposes this bundle through public D1, website, x402 or Actions.
 */
import {gzipSync, gunzipSync} from "node:zlib";
import {createHash} from "node:crypto";
import {validatePrivateStageBundle} from "./restricted-private-scored-stage.mjs";
import {validatePrivateGriCompanionBundle} from "./private-gri-original-publisher-companion.mjs";

export const PRIVATE_COMBINED_ARCHIVE_SCHEMA =
  "geomacro.private-stage-companion-b2-bundle.v1";
export const PRIVATE_COMBINED_ARCHIVE_PREFIX =
  "geomacro-evidence/v1/private/restricted-current-scoring-bundles/";
const sha256=bytes=>createHash("sha256").update(bytes).digest("hex");
const invariant=(test,code)=>{if(!test)throw Error(code)};
const MAX_MEMBER_BYTES=80*1024;
const MAX_ARCHIVE_BYTES=2*MAX_MEMBER_BYTES+2048;

function exactMembers(stage,companion,{now=new Date()}={}) {
  validatePrivateStageBundle(stage,{now});
  validatePrivateGriCompanionBundle(companion,stage,{now});
  const stageBytes=Buffer.from(JSON.stringify(stage),"utf8");
  const companionBytes=Buffer.from(JSON.stringify(companion),"utf8");
  invariant(stageBytes.length>0 && stageBytes.length<=MAX_MEMBER_BYTES &&
    companionBytes.length>0 && companionBytes.length<=MAX_MEMBER_BYTES,
    "PRIVATE_B2_BUNDLE_MEMBER_OVERSIZE");
  return {
    stageBytes,companionBytes,
    stageSha256:sha256(stageBytes),
    companionSha256:sha256(companionBytes),
    stageLegacyCompressedSha256:sha256(gzipSync(stageBytes,{level:9})),
    companionLegacyCompressedSha256:sha256(gzipSync(companionBytes,{level:9})),
  };
}

export function encodePrivateStageCompanionB2Bundle(stage,companion,{now=new Date()}={}) {
  const members=exactMembers(stage,companion,{now});
  // Canonical member serialization is separately hashed. A different object
  // or changed source headline cannot survive exact gzip JSON readback.
  const payload={
    schema:PRIVATE_COMBINED_ARCHIVE_SCHEMA,
    stage_sha256:members.stageSha256,
    source_companion_sha256:members.companionSha256,
    stage,source_companion:companion,
  };
  const raw=Buffer.from(JSON.stringify(payload),"utf8");
  invariant(raw.length>0&&raw.length<=MAX_ARCHIVE_BYTES,
    "PRIVATE_B2_BUNDLE_ARCHIVE_OVERSIZE");
  const bytes=gzipSync(raw,{level:9});
  const digest=sha256(bytes);
  return Object.freeze({
    key:PRIVATE_COMBINED_ARCHIVE_PREFIX+digest+".json.gz",
    digest,bytes,
    stageSha256:members.stageSha256,
    companionSha256:members.companionSha256,
    stageLegacyCompressedSha256:members.stageLegacyCompressedSha256,
    companionLegacyCompressedSha256:members.companionLegacyCompressedSha256,
    stageBytes:members.stageBytes,companionBytes:members.companionBytes,
  });
}

export function verifyPrivateStageCompanionB2Bundle(readback,expected,{now=new Date()}={}) {
  invariant(Buffer.isBuffer(readback) && expected?.bytes instanceof Buffer &&
    readback.length===expected.bytes.length &&
    sha256(readback)===expected.digest,
    "PRIVATE_B2_BUNDLE_FULL_READBACK_HASH_INVALID");
  let payload;
  try {
    const unpacked=gunzipSync(readback,{maxOutputLength:MAX_ARCHIVE_BYTES+1});
    invariant(unpacked.length<=MAX_ARCHIVE_BYTES,
      "PRIVATE_B2_BUNDLE_RESTORE_OVERSIZE");
    payload=JSON.parse(unpacked.toString("utf8"));
    invariant(JSON.stringify(payload)===unpacked.toString("utf8"),
      "PRIVATE_B2_BUNDLE_NONCANONICAL_JSON");
  }catch{
    throw Error("PRIVATE_B2_BUNDLE_RESTORE_INVALID");
  }
  invariant(payload && typeof payload==="object"&&!Array.isArray(payload) &&
    Object.keys(payload).sort().join("|")===
      ["schema","source_companion","source_companion_sha256","stage","stage_sha256"].sort().join("|") &&
    payload.schema===PRIVATE_COMBINED_ARCHIVE_SCHEMA,
    "PRIVATE_B2_BUNDLE_CONTRACT_INVALID");
  const members=exactMembers(payload.stage,payload.source_companion,{now});
  invariant(members.stageSha256===payload.stage_sha256 &&
    members.companionSha256===payload.source_companion_sha256 &&
    members.stageSha256===expected.stageSha256 &&
    members.companionSha256===expected.companionSha256 &&
    members.stageBytes.equals(expected.stageBytes) &&
    members.companionBytes.equals(expected.companionBytes) &&
    members.stageLegacyCompressedSha256===expected.stageLegacyCompressedSha256 &&
    members.companionLegacyCompressedSha256===expected.companionLegacyCompressedSha256,
    "PRIVATE_B2_BUNDLE_MEMBER_RESTORE_MISMATCH");
  return true;
}
