/** Retry only a valid previous read-only revision during edge propagation.
 * Transport failures, malformed markers and unsafe modes remain hard failures. */
export async function waitForCandidateMarker(read,expected,{pause=()=>new Promise(resolve=>setTimeout(resolve,5000)),allowInitial404=false}={}){
 if(!/^[a-f0-9]{40}$/u.test(expected??''))throw Error('CANDIDATE_EXPECTED_SHA_REQUIRED');
 for(let attempt=0;attempt<7;attempt++){
  const marker=await read();
  const j=marker?.json;
  // A never-before-deployed workers.dev script can return transient 404
  // while its edge route propagates. Retry only on explicit opt-in and
  // NEVER treat absent fence/header/marker as an accepted candidate.
  if(allowInitial404===true&&marker?.res?.status===404&&j===null){
    if(attempt===6)throw Error("CANDIDATE_FIRST_EDGE_ROUTE_UNAVAILABLE");
    await pause();continue;
  }
  if(marker?.res?.status!==200||j?.schema_version!=='geomacro.deployment-build.v1'||
   !/^[a-f0-9]{40}$/u.test(j?.canonical_main_sha??'')||j.production_activation_performed!==false||
   j.candidate_mode!=='read-only-no-funds')throw Error('CANDIDATE_MARKER_UNSAFE_OR_INVALID');
  if(j.canonical_main_sha===expected)return marker;
  if(attempt===6)throw Error('CANDIDATE_EXACT_SHA_MISMATCH');
  await pause();
 }
}
