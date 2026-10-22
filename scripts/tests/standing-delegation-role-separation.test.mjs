import test from "node:test";
import assert from "node:assert/strict";
import {standingRoleCollisionKind} from "../lib/standing-delegation-role-separation.mjs";
const pin=c=>c.repeat(64);
const base={owner:pin("a"),reviewer:pin("b"),machine:pin("c"),facts:pin("d"),
 rights:pin("e"),gro:pin("f"),policyMachine:pin("c")};
test("valid distinct authority pins are not labeled as colliding",()=>{
 assert.equal(standingRoleCollisionKind(base),"NO_ROLE_COLLISION_FOUND");
});
test("classification is exact, safe, and never returns key material",()=>{
 const combinations=[
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
 for(const [a,b,code] of combinations){
  const fields={...base,[b]:base[a]};
  if(b==="machine")fields.policyMachine=base[a];
  assert.equal(standingRoleCollisionKind(fields),code);
  assert.doesNotMatch(standingRoleCollisionKind(fields),/[a-f0-9]{64}/);
 }
});
test("invalid or substituted pins fail closed without leaking values",()=>{
 assert.equal(standingRoleCollisionKind({...base,facts:"bad"}),"ROLE_PINS_MISSING_OR_INVALID");
 assert.equal(standingRoleCollisionKind({...base,policyMachine:pin("0")}),
   "MACHINE_POLICY_BINDING_MISMATCH");
 assert.equal(standingRoleCollisionKind(null),"ROLE_PINS_MISSING_OR_INVALID");
});

test("derived-only owner/Facts reuse is specifically allowed, all other collisions denied",()=>{
 const overlap={...base,facts:base.owner};
 assert.equal(standingRoleCollisionKind(overlap),"OWNER_AND_FACTS_SHARE_KEY");
 assert.equal(standingRoleCollisionKind(overlap,{allowOwnerFactsReuse:true}),
  "NO_ROLE_COLLISION_FOUND");
 const secondary={...overlap,rights:base.reviewer};
 assert.equal(standingRoleCollisionKind(secondary,{allowOwnerFactsReuse:true}),
  "REVIEWER_AND_RIGHTS_SHARE_KEY");
 const stillForbidden={...overlap,rights:base.machine};
 assert.equal(standingRoleCollisionKind(stillForbidden,{allowOwnerFactsReuse:true}),
  "MACHINE_AND_RIGHTS_SHARE_KEY");
});
