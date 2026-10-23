// Cursor evidence is an actual successful scheduled probe, never wall-clock time.
import {CONTINENT_COUNTRIES_195} from './continent-country-195-rotation.mjs';
import {parseCanonical195Codes,rollupCountry195Proofs} from './country-195-proof-rollup.mjs';
export function countryProbeArtifactName(runId,continent,attempt=1){
 if(!Number.isSafeInteger(runId)||runId<1||!Number.isSafeInteger(attempt)||attempt<1||
    !Object.hasOwn(CONTINENT_COUNTRIES_195,continent))throw Error('COUNTRY_CURSOR_SCOPE_INVALID');
 return `live-country-195-resume-${runId}-${continent}-${attempt}`;
}
export function previousScheduledCountry(report,continent,registryText,now=new Date()){
 const codes=parseCanonical195Codes(registryText);
 rollupCountry195Proofs([report],codes,{now});
 const iso=report.scheduled_country_iso3;
 if(report.batch_count!==1||report.continent_source_group!==continent||
    !CONTINENT_COUNTRIES_195[continent]?.includes(iso)||
    codes[report.batch_start]!==iso||report.cells.some(c=>c.iso3!==iso))
  throw Error('COUNTRY_CURSOR_CHECKPOINT_SCOPE_INVALID');
 return iso;
}
export async function restoreScheduledCountry({continent,registryText,github,download,now=new Date()}){
 if(!Object.hasOwn(CONTINENT_COUNTRIES_195,continent))throw Error('COUNTRY_CURSOR_SCOPE_INVALID');
 const path=`.github/workflows/continent-country-${continent}-2h.yml`;
 const response=await github(`/actions/workflows/continent-country-${continent}-2h.yml/runs?per_page=100&event=schedule&status=success&branch=main`);
 if(!Array.isArray(response.workflow_runs))throw Error('COUNTRY_CURSOR_HISTORY_INVALID');
 const runs=response.workflow_runs.filter(r=>r.event==='schedule'&&r.conclusion==='success'&&
  r.status==='completed'&&r.head_branch==='main'&&r.path===path&&
  Number.isSafeInteger(r.id)&&r.id>0);
 // Do not silently reset if GitHub returns unexpected history.
 if(response.workflow_runs.length&&!runs.length)throw Error('COUNTRY_CURSOR_HISTORY_INVALID');
 if(!runs.length)return '';
 // Run IDs preserve dispatch order even after an older run is re-run later.
 const run=runs.sort((a,b)=>b.id-a.id)[0];
 const expected=countryProbeArtifactName(run.id,continent,run.run_attempt??1);
 const artifacts=await github(`/actions/runs/${run.id}/artifacts?per_page=100`);
 const artifact=artifacts.artifacts?.find(a=>!a.expired&&
  (a.name===expected||a.name===`live-country-195-resume-${run.id}`));
 if(!artifact)throw Error('COUNTRY_CURSOR_CHECKPOINT_UNAVAILABLE');
 return previousScheduledCountry(await download(run.id,artifact.name),continent,registryText,now);
}
