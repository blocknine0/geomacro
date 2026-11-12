import test from "node:test";
import assert from "node:assert/strict";
import {assessReviewedAdditiveBindingParity}
 from "../lib/canary-additive-binding-parity.mjs";
const version=bindings=>({resources:{bindings}});
const db={name:"DB",type:"d1"};
const added={name:"GEOMACRO_LICENSE_ED25519_PRIVATE_KEY_PKCS8_B64",type:"secret_text"};
test("unchanged bindings remain accepted with no review",()=>{
 const x=assessReviewedAdditiveBindingParity(version([db]),version([db]));
 assert.equal(x.status,"PASS_BINDING_PARITY");
 assert.deepEqual(x.additions,[]);
});
test("reviewed exact-name secret addition is accepted, never wildcard",()=>{
 const x=assessReviewedAdditiveBindingParity(version([db]),version([db,added]),
  [added.name]);
 assert.deepEqual(x.additions,[added.name]);
});
test("unreviewed addition, changing DB binding, or removal is blocked",()=>{
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([db,added])),/UNREVIEWED_ADDITION/);
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([{...db,type:"kv_namespace"}])),
  /REMOVAL_OR_TYPE_CHANGE/);
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([])),/EMPTY/);
});
test("unknown review names or plaintext vars cannot bypass parity",()=>{
 const unknown={name:"CONTROL_PLANE_TOKEN",type:"secret_text"};
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([db,unknown]),[unknown.name]),
  /ADDITIVE_SECRET_TYPE_OR_SCOPE/);
 const plaintext={...added,type:"plain_text"};
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([db,plaintext]),[added.name]),
  /ADDITIVE_SECRET_TYPE_OR_SCOPE/);
 assert.throws(()=>assessReviewedAdditiveBindingParity(
  version([db]),version([db,added]),[added.name,added.name]),
  /DUPLICATE_REVIEWED_NAME/);
});
