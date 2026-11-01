// HTTP adapter: standalone candidate route; intentionally NOT wired into production.
import {executeGate} from "./service.mjs";
import {authenticateD1,createD1Ledger} from "./d1-ledger.mjs";
export function candidateHttpHandler(deps) {
  return async function handle(request,env,now=new Date()) {
    const headers={"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff"};
    const fail=(code,status)=>Response.json({ok:false,error:code,advisory_decision:"PAUSE",execution_authorized:false,chargeable:false},{status,headers});
    if (request.method!=="POST") return fail("METHOD_NOT_ALLOWED",405);
    if ((request.headers.get("content-type")||"").split(";")[0].toLowerCase()!=="application/json") return fail("CONTENT_TYPE_INVALID",415);
    const bearer=request.headers.get("authorization")||"";
    if (!/^Bearer [a-f0-9]{64}$/.test(bearer)) return fail("UNAUTHORIZED",401);
    if (!env?.RC_STAGING_D1?.prepare) return fail("STAGING_D1_NOT_BOUND",503);
    const bytes=new Uint8Array(await request.arrayBuffer());
    if (!bytes.length||bytes.byteLength>65536) return fail("REQUEST_SIZE_INVALID",413);
    let payload;
    try { payload=JSON.parse(new TextDecoder("utf-8",{fatal:true}).decode(bytes)); }
    catch { return fail("JSON_INVALID",400); }
    const ledger=createD1Ledger(env.RC_STAGING_D1);
    const adapters={
      authenticate:()=>authenticateD1(env.RC_STAGING_D1,bearer.slice(7)),
      ledger,approvedPricing:deps.approvedPricing,
      loadTrustedGro:deps.loadTrustedGro,verifyGro:deps.verifyGro,
      evaluate:deps.evaluate,signer:deps.signer
    };
    const output=await executeGate(payload,adapters,now);
    const status=output.ok?200:output.status||503;
    if (!output.ok) delete output.status;
    return Response.json(output,{status,headers});
  };
}
