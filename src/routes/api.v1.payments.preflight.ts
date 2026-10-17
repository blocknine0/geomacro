import {createFileRoute} from "@tanstack/react-router";
import {quoteGeomacroUsdcCapabilityPreflight}
  from "../lib/geomacro-multichain-usdc.server";

const headers={
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"POST, OPTIONS",
  "Access-Control-Allow-Headers":"Content-Type",
};
export const Route=createFileRoute("/api/v1/payments/preflight")({
  server:{handlers:{
    OPTIONS:async()=>new Response(null,{status:204,headers}),
    POST:async({request}:{request:Request})=>{
      if(new URL(request.url).search)return Response.json({
        ok:false,chargeable:false,error:"USDC_PREFLIGHT_QUERY_INVALID",
      },{status:400,headers});
      if(!(request.headers.get("content-type")??"")
          .toLowerCase().startsWith("application/json"))
        return Response.json({ok:false,chargeable:false,
          error:"JSON_CONTENT_TYPE_REQUIRED"},{status:415,headers});
      if(Number(request.headers.get("content-length")??"0")>4096)
        return Response.json({ok:false,chargeable:false,
          error:"USDC_PREFLIGHT_BODY_TOO_LARGE"},{status:413,headers});
      try{
        const bytes=await request.text();
        if(new TextEncoder().encode(bytes).length>4096)
          return Response.json({ok:false,chargeable:false,
            error:"USDC_PREFLIGHT_BODY_TOO_LARGE"},{status:413,headers});
        const quote=quoteGeomacroUsdcCapabilityPreflight(JSON.parse(bytes));
        return Response.json(quote,{status:200,headers});
      }catch{
        return Response.json({ok:false,chargeable:false,
          error:"USDC_PREFLIGHT_INVALID_OR_UNAPPROVED"},{status:400,headers});
      }
    },
  }},
});
