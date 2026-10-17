import {automatedFindsRunHealth} from "../lib/automated-finds-run-health.mjs";
import {createHash,createHmac} from "node:crypto";
import {createB2Client} from "./b2-s3-client.mjs";
import {publishAutomatedFinds} from "../../src/lib/automated-finds-publisher.server";
import {loadRiskObjectVerificationKeysFromEnv} from "../../src/lib/risk-object-signing.server";
import {verifyAutomatedFindsSnapshot} from "../../src/lib/automated-finds-contract";
import {canonicalJson} from "../../src/lib/canonical-json";
import type {StatelessIntelligenceResult} from "../../src/lib/stateless-public-intelligence.server";

const ORIGIN="https://geomacro-control-plane.daspallab202391.workers.dev";
export async function publishCollectedAutomatedFinds(reports:StatelessIntelligenceResult[]){
  // Only the existing protected workflow supplies the writer, shared quota
  // ledger and signer. Never put a private signing key in a Worker/browser.
  if(process.env.B2_ACCOUNT_QUOTA_REQUIRED!=="1"||process.env.B2_REQUEST_BUDGET!=="12")
    throw Error("AUTOMATED_FINDS_GOVERNED_B2_REQUIRED");
  const root=process.env.GEOMACRO_COMMERCE_LEDGER_TOKEN??"";
  if(root.length<32)throw Error("AUTOMATED_FINDS_AUTHORIZATION_REQUIRED");
  const token=createHmac("sha256",root.trim()).update("geomacro-control-plane-v1").digest("hex");
  const keys=loadRiskObjectVerificationKeysFromEnv();
  let lastArchiveAt:string|null=null;
  let lastArchiveVerified=false;
  try{
    const previous=await fetch(ORIGIN+"/v1/public/automated-finds",{redirect:"error",cache:"no-store",signal:AbortSignal.timeout(8000)});
    if(previous.ok){const raw=await previous.text();if(raw.length>300_000)throw Error("OVERSIZE");
      const doc=JSON.parse(raw);await verifyAutomatedFindsSnapshot({schema:"geomacro.automated-finds-snapshot.v1",batches:doc.batches},keys);
      if(doc.ok===true&&doc.schema==="geomacro.automated-finds-feed.v1"){
        lastArchiveAt=doc.archive_last_attempt_at??null;
        lastArchiveVerified=lastArchiveAt!==null&&doc.archive_checkpoint?.generated_at===lastArchiveAt;
      }}
  }catch{/* Missing/stale prior state cannot authorize skipping a backup. */}
  let b2:ReturnType<typeof createB2Client>|undefined;
  const archive={putWithMetadataVerification:async(...args:any[])=>{
    b2??=createB2Client({endpointUrl:"https://s3.us-east-005.backblazeb2.com",bucket:"geomacro-private-archive",
      accessKey:process.env.B2_KEY_ID,secretKey:process.env.B2_APPLICATION_KEY});
    return b2.putWithMetadataVerification(...args);
  }};
  const receipt=await publishAutomatedFinds({reports,archive,lastArchiveAt,lastArchiveVerified,promote:async(body:any)=>{
    await verifyAutomatedFindsSnapshot(body.snapshot,keys);
    const reply=await fetch(ORIGIN+"/v1/automated-finds",{method:"PUT",redirect:"error",
      headers:{Authorization:"Bearer "+token,"Content-Type":"application/json"},
      body:JSON.stringify(body),signal:AbortSignal.timeout(15_000)});
    if(!reply.ok)throw Error("AUTOMATED_FINDS_D1_PUBLISH_REJECTED_"+reply.status);
    const ack=await reply.json();
    const expectedHash=createHash("sha256").update(canonicalJson(body.snapshot)).digest("hex");
    if(ack.ok!==true||ack.payload_sha256!==expectedHash||ack.signed_category_count!==3)
      throw Error("AUTOMATED_FINDS_D1_ACK_INVALID");
    const read=await fetch(ORIGIN+"/v1/public/automated-finds",{redirect:"error",cache:"no-store",
      signal:AbortSignal.timeout(12_000)});
    if(!read.ok||Number(read.headers.get("content-length")??0)>300_000)throw Error("AUTOMATED_FINDS_D1_READBACK_UNAVAILABLE");
    const text=await read.text();if(text.length>300_000)throw Error("AUTOMATED_FINDS_D1_READBACK_TOO_LARGE");
    const doc=JSON.parse(text);
    if(doc.ok!==true||doc.schema!=="geomacro.automated-finds-feed.v1"||doc.chargeable!==false||
       doc.full_b2_readback_verified!==(body.proof!==null)||doc.exact_gzip_restore_verified!==(body.proof!==null))
      throw Error("AUTOMATED_FINDS_D1_READBACK_INVALID");
    const restored={schema:"geomacro.automated-finds-snapshot.v1" as const,batches:doc.batches};
    await verifyAutomatedFindsSnapshot(restored,keys);
    if(createHash("sha256").update(canonicalJson(restored)).digest("hex")!==expectedHash)
      throw Error("AUTOMATED_FINDS_D1_EXACT_READBACK_MISMATCH");
  }});
  const health=automatedFindsRunHealth(receipt);
  console.log(JSON.stringify({...receipt,...health}));
  // D1 exact readback and all signed categories already passed above. A held
  // backup must not advertise a source/publisher outage or cause extra polls.
  // Actual source/signing/D1 failures still throw and fail the caller.
  if(health.archive_backup_degraded)
    console.warn("::warning::AUTOMATED_FINDS_ARCHIVE_DEGRADED_CURRENT_D1_VERIFIED");
}
