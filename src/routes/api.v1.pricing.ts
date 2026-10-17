import {createFileRoute} from "@tanstack/react-router";
import {publicGeomacroPaidPricingManifest} from "../lib/geomacro-paid-pricing-manifest.server";

const headers={
  "Cache-Control":"public, max-age=300, must-revalidate",
  "Content-Type":"application/json; charset=utf-8",
  "X-Content-Type-Options":"nosniff",
  "Access-Control-Allow-Origin":"*",
  "Access-Control-Allow-Methods":"GET, OPTIONS",
};

export const Route=createFileRoute("/api/v1/pricing")({
  server:{handlers:{
    OPTIONS:async()=>new Response(null,{status:204,headers}),
    GET:async({request}:{request:Request})=>{
      const url=new URL(request.url);
      if(url.search||url.hash)
        return Response.json({ok:false,chargeable:false,
          error:"PRICING_CATALOG_QUERY_UNSUPPORTED"},
          {status:400,headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
      return Response.json(publicGeomacroPaidPricingManifest(),{status:200,headers});
    },
  }},
});
