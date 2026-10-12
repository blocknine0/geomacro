import {createServerFn} from "@tanstack/react-start";
import {z} from "zod";
import {readWebsiteLaggedGlobalRisk} from "./global-risk-read.server";
import type {GlobalRisk} from "./global-risk.types";

// WEBSITE ONLY: machine and paid APIs use their separate unlagged qualified
// GRO path. This server function queries an archived real verified GRI snapshot
// at the cutoff; the trusted snapshot time/proof is never falsified.
export const getWebsiteLaggedGlobalRisk=createServerFn({method:"GET"})
 .validator((input:unknown)=>z.object({}).strict().parse(input))
 .handler(async():Promise<{ok:true;data:GlobalRisk}>=>({
   ok:true,data:await readWebsiteLaggedGlobalRisk(),
 }));
