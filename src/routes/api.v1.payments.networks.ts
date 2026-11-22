import {createFileRoute} from "@tanstack/react-router";
import {runSignedRpcReadiness} from "../lib/no-card-rpc-readiness.server";
import {publicGeomacroUsdcRailDiscovery}
  from "../lib/geomacro-multichain-usdc.server";
import {NO_CARD_X402_MAINNET_FACILITATORS}
  from "../lib/no-card-x402-payment-adapter.server";

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
      const discovery=publicGeomacroUsdcRailDiscovery();
      return Response.json({...discovery,
        facilitator_policy:{primary:"free_keyless",coinbase_cdp:{optional:true,required:false}},
        networks:discovery.networks.map(rail=>{
          const paymentRails=NO_CARD_X402_MAINNET_FACILITATORS.find(
            candidate=>candidate.network===rail.caip2,
          );
          return paymentRails?{...rail,
            checkout:{primary_facilitators:paymentRails.primary_facilitators,
              optional_facilitators:paymentRails.optional_facilitators,
              pricing:paymentRails.pricing,
              recipient:paymentRails.recipient},
          }:rail;
        }),
      },{status:200,headers});
    },
  }},
});
