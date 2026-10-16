import {createFileRoute} from "@tanstack/react-router";
import {publicFindCardsResponse} from "../lib/public-find-card-feed.server";

/** Free versioned derived-only cards, separate from x402 and signed GRO. */
export const Route=createFileRoute("/api/v1/finds")({
 server:{handlers:{GET:({request}:{request:Request})=>
   publicFindCardsResponse(request)}},
});
