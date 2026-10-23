import {createFileRoute} from "@tanstack/react-router";
import {geomacroKeylessX402BuyerCatalog} from "../lib/keyless-x402-buyer-catalog";

/** Predge-style keyless buyer discovery; read-only and zero-funds. */
export const Route=createFileRoute("/api/v1/commerce/catalog")({
 server:{
  handlers:{
   GET:async()=>Response.json(geomacroKeylessX402BuyerCatalog(),{
    status:200,headers:{
     "Cache-Control":"public, max-age=60, must-revalidate",
     "X-Content-Type-Options":"nosniff",
     "Access-Control-Allow-Origin":"*",
    }
   })
  }
 }
});
