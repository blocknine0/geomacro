/**
 * Bounded role-collision labels ONLY; never log raw SPKI fingerprints,
 * PEMs, secrets, policy signatures, or any upstream article identifiers.
 * This diagnoses a fail-closed gate; it never authorizes a signature.
 */
const SHA=/^[a-f0-9]{64}$/;
const KEYS=["owner","reviewer","machine","facts","rights","gro"];
export function standingRoleCollisionKind(inputs,{allowOwnerFactsReuse=false}={}){
 if(!inputs||typeof inputs!=="object"||KEYS.some(k=>!SHA.test(inputs[k]??""))||
    !SHA.test(inputs.policyMachine??""))
  return "ROLE_PINS_MISSING_OR_INVALID";
 if(inputs.machine!==inputs.policyMachine)return "MACHINE_POLICY_BINDING_MISMATCH";
 const pairs=[
  ["owner","reviewer","OWNER_AND_REVIEWER_SHARE_KEY"],
  ["owner","machine","OWNER_AND_MACHINE_SHARE_KEY"],
  ["reviewer","machine","REVIEWER_AND_MACHINE_SHARE_KEY"],
  ["machine","facts","MACHINE_AND_FACTS_SHARE_KEY"],
  ["machine","rights","MACHINE_AND_RIGHTS_SHARE_KEY"],
  ["machine","gro","MACHINE_AND_GRO_SHARE_KEY"],
  ["facts","rights","FACTS_AND_RIGHTS_SHARE_KEY"],
  ["facts","gro","FACTS_AND_GRO_SHARE_KEY"],
  ["rights","gro","RIGHTS_AND_GRO_SHARE_KEY"],
  ["owner","facts","OWNER_AND_FACTS_SHARE_KEY"],
  ["owner","rights","OWNER_AND_RIGHTS_SHARE_KEY"],
  ["owner","gro","OWNER_AND_GRO_SHARE_KEY"],
  ["reviewer","facts","REVIEWER_AND_FACTS_SHARE_KEY"],
  ["reviewer","rights","REVIEWER_AND_RIGHTS_SHARE_KEY"],
  ["reviewer","gro","REVIEWER_AND_GRO_SHARE_KEY"]
 ];
 for(const [a,b,label] of pairs){
  if(label==="OWNER_AND_FACTS_SHARE_KEY"&&allowOwnerFactsReuse===true)continue;
  if(inputs[a]===inputs[b])return label;
 }
 return "NO_ROLE_COLLISION_FOUND";
}