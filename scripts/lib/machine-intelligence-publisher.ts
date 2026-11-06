import {qualifyMachineIntelligenceBatch} from "../../src/lib/machine-intelligence-publication.server";
import {MACHINE_COMMERCIAL_PROFILE} from "../../src/lib/geomacro-machine-commercial-qualification.server";
import {MACHINE_INTELLIGENCE_PROOF_SCHEMA,MACHINE_INTELLIGENCE_SOURCE_ID,
  MACHINE_INTELLIGENCE_EVIDENCE_CONTRACT} from "../../lib/intelligence-publication-authority.mjs";
import {publishQualifiedIntelligenceTransport} from "./qualified-intelligence-transport.mjs";

export async function publishMachineIntelligence(options:Record<string,unknown>) {
  let qualifiedInput:unknown,qualification:unknown;
  const result=await publishQualifiedIntelligenceTransport({...options,
    proofIdentity:{schema:MACHINE_INTELLIGENCE_PROOF_SCHEMA,
      current_source_id:MACHINE_INTELLIGENCE_SOURCE_ID,
      current_evidence_contract:MACHINE_INTELLIGENCE_EVIDENCE_CONTRACT,
      authority_profile:MACHINE_COMMERCIAL_PROFILE,external_reviewer_attested:false},
    qualify:async(input:Parameters<typeof qualifyMachineIntelligenceBatch>[0])=>{
      const checked=await qualifyMachineIntelligenceBatch(input);
      qualifiedInput=input;qualification=checked;return checked;
    },
  });
  if(typeof options.stageGroInputs==="function"){
    const signing=await options.stageGroInputs({input:qualifiedInput,qualified:qualification});
    return {...result,automatic_gro_signing:signing};
  }
  return result;
}
