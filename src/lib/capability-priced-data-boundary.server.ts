import {resolveGeomacroCapabilityPrice} from "./capability-pricing-catalog";

const isRecord=(value:unknown):value is Record<string,unknown> =>
  value!==null&&typeof value==="object"&&!Array.isArray(value);

/**
 * Server-side anti-upsell guard for the already qualified, sanitized x402
 * response. A price is a maximum DATA entitlement, not permission to return
 * every module in the shared adaptive response envelope.
 *
 * This is additive to proof, signature, source-rights, and immutable quote
 * gates; it neither grants access nor creates a paid product.
 */
export function assertLockedCapabilityDataBoundary(
  payload:Record<string,unknown>,capability:string,variant:string,
):void {
  resolveGeomacroCapabilityPrice(capability,variant);
  if(!isRecord(payload)||payload.execution_authorized!==false)
    throw Error("CAPABILITY_PRICE_DATA_BOUNDARY_INVALID");

  const populated=(key:string):boolean=>{
    const value=payload[key];
    if(value===null||value===undefined)return false;
    if(Array.isArray(value))return value.length>0;
    return true;
  };
  // A cheaper intelligence answer or signed object can never include the
  // separately priced Risk Gate decision as an incidental extra.
  if(capability!=="risk_gate_bundle"&&populated("risk_gate"))
    throw Error("CAPABILITY_PRICE_RISK_GATE_UPSELL_FORBIDDEN");

  if(!capability.startsWith("structural_"))return;

  if(populated("signed_risk_objects")||populated("gri_context"))
    throw Error("CAPABILITY_PRICE_SIGNED_UPSELL_FORBIDDEN");

  const states=payload.current_state;
  if(states!==undefined&&states!==null){
    if(!Array.isArray(states)||states.some(state=>!isRecord(state)||
      (state.risk!==null&&state.risk!==undefined)))
      throw Error("CAPABILITY_PRICE_STRUCTURAL_RISK_UPSELL_FORBIDDEN");
  }

  const rows=payload.structural;
  const expectedType=capability.includes("_corridor_")?"corridor":"country";
  if(!Array.isArray(rows)||rows.length!==1||!isRecord(rows[0])||
      !isRecord(rows[0].subject)||rows[0].subject.type!==expectedType||
      !isRecord(rows[0].intelligence))
    throw Error("CAPABILITY_PRICE_STRUCTURAL_SUBJECT_SCOPE_INVALID");

  const modules=Object.values(rows[0].intelligence);
  const digest=capability.endsWith("_digest");
  if(modules.length===0||(digest&&modules.length!==1))
    throw Error("CAPABILITY_PRICE_STRUCTURAL_DIMENSIONS_INVALID");

  const maxRows=digest?3:12;
  for(const module of modules){
    if(!isRecord(module))throw Error("CAPABILITY_PRICE_STRUCTURAL_MODULE_INVALID");
    if(module.observations!==undefined&&
      (!Array.isArray(module.observations)||module.observations.length>maxRows))
      throw Error("CAPABILITY_PRICE_STRUCTURAL_DETAIL_LIMIT_EXCEEDED");
  }
}
