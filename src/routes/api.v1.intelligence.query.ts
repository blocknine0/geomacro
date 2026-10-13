import { createFileRoute } from "@tanstack/react-router";
import { mainnetIntelligenceHandlers } from "../lib/mainnet-intelligence-endpoint.server";
import { unifiedThreeDomainSourceObservation } from "../lib/unified-three-domain-source-observation.server";

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
