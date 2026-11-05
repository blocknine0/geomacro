#!/usr/bin/env bun
/**
 * One-off replay of the retained seven-day D1 snapshot window.
 * Requires the owner control-plane token and the existing Risk Supabase
 * acceptance secret in the deployed Worker. Never changes commercial mode.
 */
const base=String(process.env.GEOMACRO_CONTROL_PLANE_URL??"").replace(/\/$/,"");
const token=String(process.env.CONTROL_PLANE_TOKEN??"");
if(!/^https:\/\/[a-z0-9.-]+(?::\d+)?$/i.test(base)||token.length<32){
  throw new Error("Set GEOMACRO_CONTROL_PLANE_URL and CONTROL_PLANE_TOKEN");
}
const response=await fetch(base+"/v1/internal/risk-gate/7d-rollup",{
  method:"POST",
  headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
  body:JSON.stringify({mode:"BACKFILL"}),
});
const receipt=await response.json();
if(receipt?.commercial_activation!==false||receipt?.no_funds!==true)
  throw new Error("Rollup response did not confirm no-funds trial mode");
console.log(JSON.stringify(receipt,null,2));
if(!response.ok||receipt.ok!==true)process.exitCode=1;
