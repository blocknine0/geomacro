import {publicFindCardsResponse} from "../../../../src/lib/public-find-card-feed.server";
import {fetchWithoutRedirect} from '../../../../src/lib/fetch-without-redirect';
import {consumeD1CentralSecurityBudget} from '../../../../src/lib/d1-central-security-budget.server';
import {automatedFindsResponse} from '../../../../src/lib/automated-finds-reader.server';
export default {async fetch(){
  const results:Record<string,unknown>={};
  try {await fetch('https://fixed.example.test/',{redirect:'error'});results.old_mode_rejected=false;}
  catch {results.old_mode_rejected=true;}
  process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN='local-fixture-only-'.repeat(4);
  results.security=await consumeD1CentralSecurityBudget('api_write','a'.repeat(64));
  const finds=await automatedFindsResponse(new Request('https://website.test/api/v1/intelligence/query?view=finds'));
  results.finds_status=finds.status;
  results.finds_batches=(await finds.json() as any).batches?.length;
  const cards=await publicFindCardsResponse(new Request("https://website.test/api/v1/finds?domain=macro"));
  results.cards_status=cards.status;
  results.cards_count=(await cards.json() as any).cards?.length;
  let rejected=0;
  for(const status of [300,301,302,303,304,305,306,307,308]){
    try {await fetchWithoutRedirect('https://fixed.example.test/redirect/'+status,{headers:{Authorization:'Bearer local-fixture-only'}});}
    catch(e){if((e as Error).message==='UPSTREAM_REDIRECT_REJECTED')rejected++;else throw e;}
  }
  results.redirects_rejected=rejected;
  results.upstream=await (await fetchWithoutRedirect('https://fixed.example.test/counts')).json();
  return Response.json(results);
}};
