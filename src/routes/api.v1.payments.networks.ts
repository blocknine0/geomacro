import {createFileRoute} from "@tanstack/react-router";
import {runSignedRpcReadiness} from "../lib/no-card-rpc-readiness.server";
import {publicGeomacroUsdcRailDiscovery}
  from "../lib/geomacro-multichain-usdc.server";

const headers={
  "Cache-Control":"no-store","X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
};
export const Route=createFileRoute("/api/v1/payments/networks")({
  server:{handlers:{
    OPTIONS:async()=>new Response(null,{status:204,headers}),
    POST:async({request}:{request:Request})=>runSignedRpcReadiness(request),
    GET:async({request}:{request:Request})=>{
      const url=new URL(request.url);
      if(url.search||url.hash)
        return Response.json({ok:false,chargeable:false,
          error:"NETWORK_DISCOVERY_QUERY_INVALID"},{status:400,headers});
      return Response.json(publicGeomacroUsdcRailDiscovery(),{status:200,headers});
    },
  }},
});
