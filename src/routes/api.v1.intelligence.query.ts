import { createFileRoute } from "@tanstack/react-router";
import { mainnetIntelligenceHandlers } from "../lib/mainnet-intelligence-endpoint.server";
import { unifiedThreeDomainSourceObservation } from "../lib/unified-three-domain-source-observation.server";
import {automatedFindsResponse} from "../lib/automated-finds-reader.server";
import {publicFindCardsResponse} from "../lib/public-find-card-feed.server";
import {derivedNewsStructuralResponse} from "../lib/derived-news-structural-response.server";
import {publicThreeDomainContinuityResponse} from "../lib/three-domain-evidence-continuity-client";
import {geomacroThreeDomainDeliveryContract} from "../lib/three-domain-delivery-contract";

export const Route = createFileRoute("/api/v1/intelligence/query")({
  server: {
    handlers: {
      // One canonical endpoint for the three source-monitoring categories.
      // GET ?view=source-status is OBSERVATIONAL and never authorizes a charge.
      // Other GET discovery + POST x402 behavior remain byte-for-byte the
      // existing mainnet handlers.
      ...mainnetIntelligenceHandlers,
      GET: async ({request}:{request:Request}) => {
        const url=new URL(request.url);
        if(url.searchParams.get("view")==="delivery-contract"){
          if(url.searchParams.getAll("view").length!==1 ||
             [...url.searchParams.keys()].some(key=>key!=="view")){
            return Response.json({ok:false,chargeable:false,
              error:"DOMAIN_DELIVERY_CONTRACT_QUERY_INVALID"},{status:400,
              headers:{"Cache-Control":"no-store","X-Content-Type-Options":"nosniff"}});
          }
          return Response.json(geomacroThreeDomainDeliveryContract(),{
            headers:{"Cache-Control":"public, max-age=300, must-revalidate",
              "X-Content-Type-Options":"nosniff"}});
        }
        if(url.searchParams.get("view")==="finds")return automatedFindsResponse(request);
        if(["structural-72h","country-coverage-195x3"].includes(
          url.searchParams.get("view")??""))
          return derivedNewsStructuralResponse(request);
        if(url.searchParams.get("view")==="continuous")
          return publicThreeDomainContinuityResponse(request);
        // Auto Ingest's original-dated rolling 72h D1 data is available on
        // the same canonical machine API as explicit no-charge structured
        // research cards. This is NOT an x402 capability quote or verified GRO.
        if(url.searchParams.get("view")==="auto-ingest-72h"){
          if(url.searchParams.getAll("view").length!==1 ||
             url.searchParams.getAll("domain").length>1 ||
             [...url.searchParams.keys()].some(k=>!["view","domain"].includes(k)))
            return Response.json({ok:false,chargeable:false,
              error:"AUTO_INGEST_72H_QUERY_INVALID"},{status:400});
          url.searchParams.delete("view");
          return publicFindCardsResponse(new Request(url.toString()));
        }
        if(url.searchParams.get("view")!=="source-status")
          return mainnetIntelligenceHandlers.GET({request});
        if([...url.searchParams.keys()].some(key=>key!=="view") ||
           url.searchParams.getAll("view").length!==1){
          return Response.json({ok:false,chargeable:false,
            error:"UNIFIED_SOURCE_STATUS_QUERY_INVALID"},{
            status:400,headers:{"Cache-Control":"no-store",
              "X-Content-Type-Options":"nosniff"},
          });
        }
        const status=await unifiedThreeDomainSourceObservation();
        return Response.json(status,{
          status:200,headers:{"Cache-Control":"no-store",
            "X-Content-Type-Options":"nosniff"},
        });
      },
    },
  },
});
