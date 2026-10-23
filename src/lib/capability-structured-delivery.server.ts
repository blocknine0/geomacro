import {geomacroPricedStructuredOutput} from "./capability-structured-output-contract";

const record=(value:unknown):value is Record<string,unknown> =>
  value!==null&&typeof value==="object"&&!Array.isArray(value);

function present(value:unknown,allowEmptyArray:boolean):boolean {
  if(value===null||value===undefined)return false;
  if(typeof value==="string")return value.trim().length>0;
  if(typeof value==="number")return Number.isFinite(value);
  if(Array.isArray(value))return allowEmptyArray||value.length>0;
  if(record(value))return Object.keys(value).length>0;
  return typeof value==="boolean";
}

function hasPath(value:unknown,parts:readonly string[],allowEmptyArray:boolean):boolean {
  if(parts.length===0)return present(value,allowEmptyArray);
  if(!record(value))return false;
  const [part,...rest]=parts;
  const wildcard=part.endsWith("[*]");
  const key=wildcard?part.slice(0,-3):part;
  if(!Object.hasOwn(value,key))return false;
  const next=value[key];
  if(!wildcard)return hasPath(next,rest,allowEmptyArray);
  // Every delivered subject must satisfy its contract, not merely one row.
  return Array.isArray(next)&&next.length>0&&
    next.every(row=>hasPath(row,rest,allowEmptyArray));
}

/** Enforce the published fields of the exact approved price on the actual
 * sanitized customer bytes before quoting. This checks completeness only;
 * existing source-rights, native-date, buyer-plan and signature gates still
 * independently establish eligibility. Conditional fields are never invented.
 */
export function assertPricedStructuredDelivery(
  payload:Record<string,unknown>,capability:string,variant:string,
):void {
  const contract=geomacroPricedStructuredOutput(capability,variant);
  if(!record(payload)||payload.execution_authorized!==false)
    throw Error("CAPABILITY_STRUCTURED_DELIVERY_BOUNDARY_INVALID");
  for(const field of contract.customer_receives){
    // Absence of changes is meaningful; absence of requested coverage is not.
    const allowEmptyArray=field==="answer.what_changed"||
      field==="gri_context.change_attribution"||field.endsWith(".object.attribution");
    if(!hasPath(payload,field.split("."),allowEmptyArray))
      throw Error("CAPABILITY_STRUCTURED_DELIVERY_REQUIRED_FIELD_MISSING:"+field);
  }
}
