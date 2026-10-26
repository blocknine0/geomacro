/** Audit the NEW owner-export file-only lane. Existing channel/Bot governance
 * stays governed independently by audit-telegram-governance.mjs.
 */
import {readFileSync} from "node:fs";
const TARGETS=[
 "scripts/lib/telegram-export-derived-json.mjs",
 "scripts/ops/telegram-export-ingest.mjs",
 "workers/control-plane/src/telegram-export-derived-json.mjs",
];
const BANNED=[
 /\b(?:from|require\s*\()\s*["'](?:telethon|telegram|gramjs|tdlib|mtproto)[/'"]/iu,
 /\b(?:fetch|axios|got|request)\s*\(\s*["'\x60]https?:\/\/(?:api\.telegram\.org|t\.me)/iu,
 /\b(?:https?:\/\/(?:api\.telegram\.org|t\.me)\/)/iu,
 /(?:new\s+TelegramClient|(?:import|require)\s*\(\s*["']telegram)/iu,
];
export function validateOwnerTelegramExportFileOnly(files,adr,policy){
 const src=TARGETS.map(p=>files[p]);
 if(src.some(x=>typeof x!=="string"||x.length<150))throw Error("TELEGRAM_EXPORT_AUDIT_FILE_MISSING");
 if(typeof adr!=="string"||!adr.includes("OWNER_DECLARED_TELEGRAM_DERIVED_ONLY")||
    !adr.includes("owner")||!adr.includes("sign off"))
   throw Error("TELEGRAM_EXPORT_AUDIT_ADR_MISSING");
 if(typeof policy!=="string"||
    !policy.includes('TELEGRAM_OWNER_DECLARED_DERIVED_RIGHTS_STATE = "OWNER_DECLARED_TELEGRAM_DERIVED_ONLY"')||
    !policy.includes("verified: false")||!policy.includes("raw_redistribution_allowed: false"))
   throw Error("TELEGRAM_EXPORT_AUDIT_RIGHTS_INVALID");
 for(const text of src)for(const pattern of BANNED)
   if(pattern.test(text))throw Error("TELEGRAM_EXPORT_AUDIT_FORBIDDEN_TELEGRAM_NETWORK");
 if(!src[0].includes("containsVerbatimSpan")||
    !src[1].includes("GEOMACRO_TELEGRAM_EXPORT_PREFIX")||
    !src[2].includes("commercial_rights_verified:false"))
   throw Error("TELEGRAM_EXPORT_AUDIT_SAFE_BOUNDARY_MISSING");
 return {schema:"geomacro.owner-telegram-export-file-only-audit.v1",
   pass:true,raw_source_delivered:false,verified_license_asserted:false};
}
export function auditOwnerTelegramExportFilesFromDisk(){
 const files=Object.fromEntries(TARGETS.map(p=>[p,readFileSync(p,"utf8")]));
 return validateOwnerTelegramExportFileOnly(files,
   readFileSync("docs/adr/ADR-TELEGRAM-DERIVED-COMMERCIAL-USE.md","utf8"),
   readFileSync("scripts/commercial-source-policy.mjs","utf8"));
}
