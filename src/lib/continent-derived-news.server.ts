import {websiteCandidateFromCountryOriginal,type PrivateOriginalCandidate,type PrivatePageDatedOriginal} from './on-demand-global-discovery.server';
import {deriveStatelessSignals,type StatelessIntelligenceSignal} from './stateless-intelligence-model';
/** Only actual country-bound page originals enter the existing unscored deriver.
 * Pending (<15m) derived rows remain private to this runner until eligibility.
 */
export function deriveCountryWebsiteNews(country:string,candidates:readonly PrivateOriginalCandidate[],
 pages:readonly PrivatePageDatedOriginal[],now=new Date()):StatelessIntelligenceSignal[]{
 const accepted=pages.flatMap(page=>{
  if(!candidates.some(c=>c.country_iso3===country&&c.domain===page.domain&&
   c.publisher_family===page.publisher_family&&c.article_identity_sha256===page.article_identity_sha256&&
   c.article_url===page.article_url&&c.article_title===page.article_title))return [];
  const source=websiteCandidateFromCountryOriginal(page,country,now);
  return source?[source]:[];
 });
 return deriveStatelessSignals(accepted,now.getTime(),{websiteDelay:false,maxSignals:20})
  .filter(s=>s.status==='official_release_observed_unscored');
}
