import {fetchWithoutRedirect} from "./fetch-without-redirect";
const ROOT="https://geomacro-control-plane.daspallab202391.workers.dev/v1/public/automated-finds";
const aliases:Record<string,string>={geopolitics:"geopolitics","macro-fx":"macro","critical-minerals":"rare_earth"};
/** Worker verifies signatures against its separately provisioned public-key
 * registry on every read. App hosting needs neither B2 nor signer secrets. */
export async function automatedFindsResponse(request:Request,category?:string){
  const query=new URL(request.url).searchParams;
  if([...query.keys()].some(k=>k!=="view")||query.getAll("view").length!==1||query.get("view")!=="finds"||
     (category!==undefined&&!Object.hasOwn(aliases,category)))
    return Response.json({ok:false,error:"AUTOMATED_FINDS_QUERY_INVALID",chargeable:false},{status:400});
  try{
    const endpoint=category?ROOT+"?category="+aliases[category]:ROOT;
    const reply=await fetchWithoutRedirect(endpoint,{redirect:"error",cache:"no-store",headers:{Accept:"application/json"},signal:AbortSignal.timeout(8_000)});
    if(!reply.ok||Number(reply.headers.get("content-length")??0)>300_000)throw Error("UNAVAILABLE");
    const raw=await reply.text();if(raw.length>300_000)throw Error("OVERSIZE");
    const doc=JSON.parse(raw);
    if(doc.ok!==true||doc.schema!=="geomacro.automated-finds-feed.v1"||doc.independent_reviewed!==false||
       doc.scored!==false||doc.chargeable!==false||doc.supabase_dependency!==false||
       typeof doc.full_b2_readback_verified!=="boolean"||doc.exact_gzip_restore_verified!==doc.full_b2_readback_verified||
       !Array.isArray(doc.batches)||doc.batches.length!==(category?1:3)||
       (category&&doc.batches[0]?.payload?.category!==aliases[category]))throw Error("INVALID");
    return Response.json(doc,{headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff","Access-Control-Allow-Origin":"*"}});
  }catch{return Response.json({ok:false,error:"AUTOMATED_FINDS_CURRENT_SIGNED_BATCH_UNAVAILABLE",chargeable:false},
    {status:503,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});}
}
