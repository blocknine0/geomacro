/** Retired 2026-11-14 by the owner. No public GRI page or data fetch. */
import {createFileRoute,notFound} from "@tanstack/react-router";
export const Route=createFileRoute("/risk-indices")({
 beforeLoad:()=>{throw notFound();},
});
