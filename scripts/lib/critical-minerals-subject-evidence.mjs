/**
 * Subject-evidence boundary for Critical Minerals. Oil refineries, fuel
 * prices, energy diplomacy and generic "supply chains" are NOT mineral
 * developments without an explicit mineral/material/mining-battery context.
 * Applied to the same source-neutral derived headline and change summary
 * before publication and to old historical cards at display time. No sources.
 */
const MATERIAL=/\b(?:critical[ -]minerals?|strategic[ -]minerals?|rare[ -]earth(?:s| elements?)?|lithium|cobalt|nickel|graphite|gallium|germanium|neodymium|dysprosium|terbium|praseodymium|samarium|scandium|tungsten|antimony|tantalum|manganese|bauxite|alumina|copper|uranium|potash|phosphate(?:s)?|vanadium|chromium|molybdenum)\b/iu;
const MINERAL_PROCESS=/\b(?:mineral processing|mineral exploration|mineral extraction|mineral resources?|mineral deposits?|mine(?:s|d|ral)?|mining|ore deposits?|ore reserves?|ore processing|battery metals?|battery grade|battery materials?|cathode materials?|permanent magnets?|magnet manufacturing|smelter(?:s)?|metallurg(?:y|ical))\b/iu;
const OIL_ONLY=/\b(?:oil|crude|petroleum|diesel|petrol|gasoline|fuel|natural gas|lng|oilfield|oil refinery|energy price|refinery strikes?|refinery fire)\b/iu;
const MINERAL_WEAK=/\b(?:supply chain|industrial enterprise|security|energy|refining|refinery|refineries|processing|trade|manufactur|strategic|resources?)\b/iu;
/** Only explicitly evidenced subjects, not a broad cross-domain keyword. */
export function isCriticalMineralsSubject(signal){
 if(!signal||typeof signal!=="object")return false;
 const title=String(signal.title??"").replace(/^Geomacro finds\s+/iu,"");
 const changed=String(signal.what_changed??"");
 const subject=(title+" "+changed).slice(0,1200);
 if(!subject.trim())return false;
 if(MATERIAL.test(subject)||MINERAL_PROCESS.test(subject))return true;
 // "Refining" without the mineral being refined does not qualify.
 if(OIL_ONLY.test(subject)||MINERAL_WEAK.test(subject))return false;
 return false;
}
