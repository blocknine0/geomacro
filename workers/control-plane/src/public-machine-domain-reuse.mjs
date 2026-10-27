/**
 * Public-only category projection from one already validated source-neutral
 * machine bundle. Category views keep global count/availability diagnostics
 * identical to the existing source-neutral endpoint.
 * This never handles an authenticated, private, Predge, paid or no-cache read.
 */
const categories=["geopolitics","macro","rare_earth"];
const domainSet=new Set(categories);
const fail=()=>Response.json({ok:false,error:"PUBLIC_MACHINE_DOMAIN_BUNDLE_UNAVAILABLE",
  chargeable:false,items:[]},{status:503,headers:{"Cache-Control":"no-store",
  "X-Content-Type-Options":"nosniff"}});

export async function projectPublicMachineDomainResponse(source,domain){
 if(!domainSet.has(domain))return fail();
 // On D1 503/429, never convert an upstream error into a synthetic 200.
 if(!source||source.status!==200)return source??fail();
 let payload;
 try{
   if(Number(source.headers.get("content-length")||0)>850_000)return fail();
   const raw=await source.clone().text();
   if(raw.length>850_000)return fail();
   payload=JSON.parse(raw);
 }catch{return fail()}
 if(!payload||payload.ok!==true||
    payload.schema!=="geomacro.derived-news-structural-feed.v1"||
    payload.projection!=="source_neutral"||
    payload.raw_upstream_delivered!==false||
    payload.commercial_rights_verified!==false||
    payload.partner_resale_or_commercial_redistribution_authorized!==false||
    payload.chargeable!==false||payload.scored!==false||
    payload.signed!==false||!Array.isArray(payload.items)||
    payload.items.length>600||
    categories.some(c=>!Number.isSafeInteger(payload.counts?.[c])||
      payload.counts[c]<0||!payload.availability_by_category?.[c])||
    payload.items.some(item=>!domainSet.has(item?.category)||
      item.schema!=="geomacro.derived-news-structural.v1"||
      item.raw_upstream_delivered!==false||item.chargeable!==false||
      item.payable!==false||item.commercial_derived_rights_verified!==false))
   return fail();
 for(const c of categories){
   if(payload.counts[c]!==payload.items.filter(item=>item.category===c).length)
     return fail();
 }
 // Derive just the category's items. Global counts and source checks are
 // intentionally unchanged, matching the existing per-domain contract.
 const headers=new Headers(source.headers);
 for(const k of ["content-length","content-encoding","etag"])headers.delete(k);
 return Response.json({...payload,items:payload.items.filter(item=>item.category===domain)},
   {status:200,headers});
}
