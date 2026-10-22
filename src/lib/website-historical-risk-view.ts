import type {GlobalRisk} from './global-risk.types';
import {validateGlobalRiskContinuity} from './global-risk-continuity';
import {GRI_CURRENT_READING_WINDOW_HOURS} from './gri-current-contract';
import {websiteVerifiedSnapshotPastEmbargo} from './website-publication-delay';

/** Website-only view metadata. The authenticated archive and its original
 * hashes, scores, series and clocks remain immutable. A reading that was
 * current when archived must age to last_verified when shown later. This
 * helper never supplies current-product qualification or a paid artifact. */
export function websiteHistoricalRiskView(risk:GlobalRisk,now=Date.now()):GlobalRisk|null{
 if(!Number.isFinite(now)||!risk||!websiteVerifiedSnapshotPastEmbargo(risk,now))return null;
 const snapshot=Date.parse(risk.snapshotAsOf);
 if(!Number.isFinite(snapshot)||now-snapshot>30*86400_000)return null;
 const checked=validateGlobalRiskContinuity(risk,now);
 if(checked.ok)return risk;
 if(!checked.code.endsWith('_STATUS_TIME_MISMATCH')||!risk.domainIndices)return null;
 const staleAfter=GRI_CURRENT_READING_WINDOW_HOURS*3600_000;
 const domainIndices=Object.fromEntries(Object.entries(risk.domainIndices).map(([key,reading])=>{
   if(reading&&reading.readingStatus==='current'&&
      Number.isFinite(Date.parse(reading.readingAsOf))&&
      now-Date.parse(reading.readingAsOf)>staleAfter)
     return [key,{...reading,readingStatus:'last_verified' as const}];
   return [key,reading];
 })) as GlobalRisk['domainIndices'];
 const projected={...risk,domainIndices};
 return validateGlobalRiskContinuity(projected,now).ok?projected:null;
}


/** Choose by the signed source clock, never archive priority or fetch time.
 * Invalid/embargoed candidates cannot displace an eligible verified reading.
 */
export function newestWebsiteRiskSnapshot(
 candidates: readonly (GlobalRisk | null | undefined)[], now=Date.now(),
):GlobalRisk|null {
 let newest:GlobalRisk|null=null;
 for(const candidate of candidates){
  if(!candidate)continue;
  const view=websiteHistoricalRiskView(candidate,now);
  if(view&&(!newest||Date.parse(view.snapshotAsOf)>Date.parse(newest.snapshotAsOf)))newest=view;
 }
 return newest;
}
