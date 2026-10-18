import {fetchWithoutRedirectUsing} from "./fetch-without-redirect";
/** An uncharged canonical API proxy to the independently serving D1 Worker.
 * The fixed upstream origin is not buyer-controlled; no secrets, wallet,
 * source URL parameters or purchased data cross this boundary. */
export const THREE_DOMAIN_CONTINUITY_WORKER =
  "https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/three-domain-continuity";
const HEADERS={"Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Origin":"*","Referrer-Policy":"no-referrer"};
export async function publicThreeDomainContinuityResponse(
  request:Request,fetchImpl:typeof fetch=fetch,
):Promise<Response>{
  const q=new URL(request.url).searchParams;
  if(q.size!==1||q.getAll("view").length!==1||q.get("view")!=="continuous")
    return Response.json({ok:false,chargeable:false,
      error:"CONTINUITY_QUERY_INVALID"},{status:400,headers:HEADERS});
  try{
    const response=await fetchWithoutRedirectUsing(fetchImpl,THREE_DOMAIN_CONTINUITY_WORKER,{
      method:"GET",redirect:"error",cache:"no-store",
      headers:{Accept:"application/json"},signal:AbortSignal.timeout(8_000),
    });
    if(!response.ok||Number(response.headers.get("content-length")??0)>256_000)
      throw Error("CONTINUITY_WORKER_UNAVAILABLE");
    const body=await response.text();
    if(body.length>256_000)throw Error("CONTINUITY_WORKER_TOO_LARGE");
    const data=JSON.parse(body) as Record<string,unknown>;
    const categories=data.categories as Record<string,unknown>|undefined;
    if(data.ok!==true||
       data.schema!=="geomacro.three-domain-evidence-continuity.v1"||
       data.three_domains_returned!==true||
       data.chargeable!==false||data.x402_payment_required!==false||
       data.commercial_rights_verified!==false||
       data.signed_gro_verified!==false||
       data.upstream_new_event_guaranteed!==false||
       !categories||typeof categories!=="object"||Array.isArray(categories)||
       JSON.stringify(Object.keys(categories).sort())!==
         JSON.stringify(["geopolitics","macro","rare_earth"].sort())||
       /https?:\/\/|www\./iu.test(body))
      throw Error("CONTINUITY_WORKER_CONTRACT_INVALID");
    return Response.json(data,{headers:HEADERS});
  }catch{
    return Response.json({ok:false,chargeable:false,
      error:"CONTINUITY_WORKER_UNAVAILABLE"},{status:503,headers:HEADERS});
  }
}
