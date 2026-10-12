/** Website-only 60 minute publication embargo.
 * Machine x402 endpoints and independent commercial proofs MUST NOT import
 * this module: they require the freshest verified source evidence available.
 *
 * Never backdate a source, risk score, signed proof, or generated timestamp:
 * defer release of the original unchanged trusted artifact instead.
 */
export const WEBSITE_RELEASE_DELAY_MS=60*60*1000;

export function websitePublicCutoff(now=Date.now()):number{
 if(!Number.isFinite(now)||now<WEBSITE_RELEASE_DELAY_MS)
  throw new Error("WEBSITE_RELEASE_CLOCK_INVALID");
 return now-WEBSITE_RELEASE_DELAY_MS;
}

export type TimedWebsiteEvidence={
 published_at?:string|null;
 created_at?:string|null;
};

export function websiteEvidencePastEmbargo(
 entry:TimedWebsiteEvidence,now=Date.now(),
):boolean{
 const cutoff=websitePublicCutoff(now);
 // Original-time is essential: ingest time, B2 restore and client render
 // time cannot substitute for a missing original publication clock.
 const original=Date.parse(String(entry?.published_at??""));
 const recorded=Date.parse(String(entry?.created_at??""));
 return Number.isFinite(original)&&Number.isFinite(recorded) &&
   original<=cutoff&&recorded<=cutoff;
}

export function websiteLaggedEvidenceRows<T extends TimedWebsiteEvidence>(
 rows:readonly T[],now=Date.now(),
):T[]{
 const cutoff=websitePublicCutoff(now);
 return rows.filter(entry=>{
  const original=Date.parse(String(entry?.published_at??""));
  const recorded=Date.parse(String(entry?.created_at??""));
  return Number.isFinite(original)&&Number.isFinite(recorded)&&
    original<=cutoff&&recorded<=cutoff;
 });
}

export type TimedVerifiedSnapshot={
 snapshotAsOf:string;
 verificationStatus:string|null;
 auditPersisted:true;
 recentEvents?:Array<TimedWebsiteEvidence>;
 domainIndices?:Record<string,{readingAsOf:string}|null>;
};

export function websiteVerifiedSnapshotPastEmbargo(
 value:TimedVerifiedSnapshot,now=Date.now(),
):boolean{
 const cutoff=websitePublicCutoff(now);
 const asOf=Date.parse(String(value?.snapshotAsOf??""));
 if(value?.verificationStatus!=="verified"||value.auditPersisted!==true||
   !Number.isFinite(asOf)||asOf>cutoff)return false;
 // The snapshot itself must be at least 60 minutes old. An edge B2
 // restore time cannot make a fresh score eligible by backdating the
 // displayed label. Reject future evidence embedded in old packages.
 for(const row of value.recentEvents??[]){
  const published=Date.parse(String(row.published_at??""));
  if(Number.isFinite(published)&&published>cutoff)return false;
 }
 for(const domain of Object.values(value.domainIndices??{})){
  if(!domain)continue;
  const recorded=Date.parse(domain.readingAsOf);
  if(!Number.isFinite(recorded)||recorded>cutoff)return false;
 }
 return true;
}
