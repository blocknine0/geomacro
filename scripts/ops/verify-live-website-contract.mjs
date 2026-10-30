import {capabilityPricingCatalog} from '../../src/lib/capability-pricing-catalog.ts';
const BASE='https://geomacro.live';
const paths=['/','/intelligence','/risk-indices','/ask-geomacro','/data-api','/institutional','/pricing','/contact','/about','/research','/docs','/roadmap','/ecosystem','/global-risk'];
async function read(path){
 const response=await fetch(BASE+path,{redirect:'error',signal:AbortSignal.timeout(20_000),headers:{Accept:path.startsWith('/api/')?'application/json':'text/html'}});
 if(response.status!==200)throw Error('PUBLIC_ROUTE_UNHEALTHY:'+path+':'+response.status);
 const text=await response.text();if(text.length>1_000_000)throw Error('PUBLIC_ROUTE_TOO_LARGE:'+path);return text;
}
async function main(){
 const pages=new Map();
 // Four concurrent read-only requests; no Ask, quote, payment or publisher calls.
 for(let i=0;i<paths.length;i+=4){
  const batch=paths.slice(i,i+4);const results=await Promise.all(batch.map(async path=>[path,await read(path)]));
  for(const [path,text]of results){if(!/<h1\b/iu.test(text)||!/<title\b/iu.test(text))throw Error('PUBLIC_DOCUMENT_INCOMPLETE:'+path);pages.set(path,text)}
 }
 for(const path of ['/','/intelligence','/pricing']){
  if(!/href="\/"[^>]*>Home<\/a>/u.test(pages.get(path)))throw Error('PUBLIC_HOME_NAV_MISSING:'+path);
 }
 if(!/type="search"/u.test(pages.get('/intelligence'))||!pages.get('/intelligence').includes('Filter by publication time'))throw Error('INTELLIGENCE_FILTERS_UNAVAILABLE');
 const manifest=JSON.parse(await read('/api/v1/pricing'));
 const expected=capabilityPricingCatalog();
 if(manifest.pricing_version!=='geomacro.capability-usdc.v2'||manifest.capability_count!==expected.length||manifest.price_variant_count!==12)throw Error('PUBLIC_PRICE_CATALOG_SCOPE_MISMATCH');
 for(const cap of expected){
  const rows=manifest.capabilities.filter(x=>x.capability===cap.capability);
  if(rows.length!==1||rows[0].variants.length!==cap.variants.length)throw Error('PUBLIC_PRICE_CAPABILITY_MISMATCH');
  for(const price of cap.variants){
   const variants=rows[0].variants.filter(x=>x.variant===price.variant);
   if(variants.length!==1||variants[0].price_usdc!==price.amount_usdc||variants[0].amount_atomic!==price.amount_atomic)throw Error('PUBLIC_PRICE_AMOUNT_MISMATCH');
   for(const path of ['/pricing','/data-api']){
    // Price cards provide semantic markers tied directly to the canonical catalog.
    const marker='data-variant="'+price.variant+'" data-price-usdc="'+price.amount_usdc+'"';
    const section=pages.get(path).split('data-capability="'+cap.capability+'"')[1]?.split('</li>')[0];
    if(!section?.includes(marker))throw Error('PUBLIC_PRICE_PRESENTATION_MISMATCH:'+path+':'+cap.capability+':'+price.variant);
   }
  }
 }
 const build=JSON.parse(await read('/.well-known/geomacro-build.json'));
 const expectedSha=process.env.EXPECTED_SHA;
 if(expectedSha&&(!/^[a-f0-9]{40}$/u.test(expectedSha)||build.canonical_main_sha!==expectedSha))throw Error('PUBLIC_WEBSITE_EXACT_SHA_MISMATCH');
 console.log(JSON.stringify({schema:'geomacro.website-crosscheck.v1',public_documents_verified:paths.length,
  home_navigation_verified:true,intelligence_filters_verified:true,capabilities:expected.length,price_variants:14,
  ui_api_price_parity:true,website_sha:build.canonical_main_sha,exact_sha_checked:Boolean(expectedSha),
  signed_deep_health_checked:false,merchant_settlement_checked:false,payments:0}));
}
main().catch(e=>{console.error(e instanceof Error?e.message:'WEBSITE_CROSSCHECK_FAILED');process.exitCode=2});
