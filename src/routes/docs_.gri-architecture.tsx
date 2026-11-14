/** Permanently retired by owner on 2026-11-14. */
import {createFileRoute,notFound} from "@tanstack/react-router";
export const Route=createFileRoute("/docs_/gri-architecture")({beforeLoad:()=>{throw notFound();}});
