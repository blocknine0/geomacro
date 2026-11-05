/** Append-only D1 audit receipt, HMAC-signed and readback-verified before response. */
const encoder=new TextEncoder();
const canonical=value=>{
 if(value===null||typeof value==="string"||typeof value==="boolean")return JSON.stringify(value);
 if(typeof value==="number"){if(!Number.isFinite(value))throw Error("AUDIT_NONFINITE");return JSON.stringify(value);}
 if(Array.isArray(value))return "["+value.map(canonical).join(",")+"]";
 if(value&&typeof value==="object")return "{"+Object.keys(value).sort().map(k=>JSON.stringify(k)+":"+canonical(value[k])).join(",")+"}";
 throw Error("AUDIT_NON_JSON");
};
const sha=async value=>Array.from(new Uint8Array(await crypto.subtle.digest("SHA-256",encoder.encode(value))),x=>x.toString(16).padStart(2,"0")).join("");
export async function persistRiskGateAuditReceipt(db,{client_id,request_id,request_hash,
 subject_type,subject_id,decision,policy_id=null,policy_version=null,evaluated_at,response,env}){
 if(!db?.prepare||typeof request_hash!=="string"||!/^[a-f0-9]{64}$/.test(request_hash)||
    !["country","corridor"].includes(subject_type)||typeof subject_id!=="string"||
    typeof decision!=="string"||response?.execution_authorized!==false)
  throw Error("RISK_GATE_AUDIT_INPUT_INVALID");
 const secret=String(env?.RISK_GATE_OBSERVATION_HMAC_KEY??"");
 if(encoder.encode(secret).length<32)throw Error("RISK_GATE_AUDIT_SIGNING_KEY_UNAVAILABLE");
 const signature_key_id=String(env?.RISK_GATE_OBSERVATION_HMAC_KEY_ID??"obs-hmac-v2");
 if(!/^[A-Za-z0-9._:-]{1,96}$/.test(signature_key_id))throw Error("RISK_GATE_AUDIT_SIGNING_KEY_ID_INVALID");
 const response_hash=await sha(canonical(response));
 const receipt_id=await sha(canonical({client_id,request_id,request_hash}));
 const record={receipt_id,client_id,request_id,request_hash,subject_type,subject_id,
  decision,policy_id,policy_version,evaluated_at,response_hash,execution_authorized:0};
 const audit_receipt_hash=await sha(canonical(record));
 const signature_message=canonical({schema:"geomacro.risk-gate-audit-receipt.v1",
  audit_receipt_hash,response_hash,signature_key_id,signature_scheme:"HMAC-SHA256"});
 const key=await crypto.subtle.importKey("raw",encoder.encode(secret),
  {name:"HMAC",hash:"SHA-256"},false,["sign"]);
 const signed=await crypto.subtle.sign("HMAC",key,encoder.encode(signature_message));
 const audit_receipt_signature="hmac_sha256:"+Array.from(new Uint8Array(signed),x=>x.toString(16).padStart(2,"0")).join("");
 await db.prepare("INSERT OR IGNORE INTO risk_gate_audit_receipts "+
  "(receipt_id,client_id,request_id,request_hash,subject_type,subject_id,decision,policy_id,policy_version,evaluated_at,response_hash,execution_authorized,audit_receipt_hash,created_at,signature_key_id,signature_scheme,audit_receipt_signature) "+
  "VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)")
  .bind(receipt_id,client_id,request_id,request_hash,subject_type,subject_id,decision,
   policy_id,policy_version,evaluated_at,response_hash,0,audit_receipt_hash,evaluated_at,
   signature_key_id,"HMAC-SHA256",audit_receipt_signature).run();
 const stored=await db.prepare("SELECT receipt_id,client_id,request_id,request_hash,subject_type,subject_id,decision,policy_id,policy_version,evaluated_at,response_hash,execution_authorized,audit_receipt_hash,signature_key_id,signature_scheme,audit_receipt_signature "+
  "FROM risk_gate_audit_receipts WHERE receipt_id=?").bind(receipt_id).first();
 if(!stored||stored.receipt_id!==receipt_id||stored.client_id!==client_id||stored.request_id!==request_id||
   stored.request_hash!==request_hash||stored.subject_type!==subject_type||stored.subject_id!==subject_id||
   stored.decision!==decision||stored.policy_id!==policy_id||stored.policy_version!==policy_version||
   stored.evaluated_at!==evaluated_at||stored.response_hash!==response_hash||
   Number(stored.execution_authorized)!==0||stored.audit_receipt_hash!==audit_receipt_hash||
   stored.signature_key_id!==signature_key_id||stored.signature_scheme!=="HMAC-SHA256"||
   stored.audit_receipt_signature!==audit_receipt_signature||await sha(canonical(record))!==stored.audit_receipt_hash)
  throw Error("RISK_GATE_AUDIT_READBACK_FAILED");
 return {receipt_id,audit_receipt_hash,response_hash,audit_receipt_signature,
  signature_key_id,signature_scheme:"HMAC-SHA256",
  signature_scope:"SERVER_HMAC_INTEGRITY_AUTHENTICITY_NOT_NONREPUDIATION"};
}
