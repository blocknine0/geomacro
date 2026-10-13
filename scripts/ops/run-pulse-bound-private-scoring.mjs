#!/usr/bin/env node
/**
 * Automatic 30m private scoring only: reread the actual D1 novel URL-SHA
 * ledger, then let the existing canonical scorer classify ONLY the matched
 * freshly re-fetched publisher originals. No D1 writes or B2 requests here.
 */
import {spawnSync} from "node:child_process";
import {mkdirSync,writeFileSync} from "node:fs";
import {createD1ControlPlaneStateClient} from "../lib/d1-control-plane-state.mjs";
import {emptyPrivateScoringDiagnostic} from "../lib/restricted-private-scoring-diagnostics.mjs";
import {selectPrivateNovelPulseRefs} from "../lib/private-novel-pulse-match.mjs";

const domain=String(process.env.GDELT_FORCE_CATEGORY||"");
try {
  if (!["geopolitics","macro","rare_earth"].includes(domain) ||
      process.argv.length!==2 || !process.env.D1_DATABASE_ID)
    throw Error("PRIVATE_PULSE_SCORING_CONTEXT_INVALID");
  const rows=await createD1ControlPlaneStateClient({
    pipeline:"official_source_pulse_30m",
  }).loadRows();
  const refs=selectPrivateNovelPulseRefs(rows.get(domain),domain);
  if (refs.size===0) {
    const dir="artifacts/restricted-current-scoring";
    mkdirSync(dir,{recursive:true,mode:0o700});
    writeFileSync(dir+"/"+domain+".json",JSON.stringify({
      schema:"geomacro.private-scoring-candidates.v1",category:domain,
      classifier_version:"event-severity-v1.0.5",private_only:true,
      records:[],diagnostics:emptyPrivateScoringDiagnostic(domain),
    })+"\n",{mode:0o600});
    writeFileSync(dir+"/"+domain+"-source.json",JSON.stringify({
      schema:"geomacro.private-gri-source-candidates.v1",category:domain,
      private_only:true,public_published:false,commercial_eligible:false,
      records:[],
    })+"\n",{mode:0o600});
    console.log(JSON.stringify({domain,private_novel_original_count:0,
      classifier_called:false,public_published:false,payment_performed:false}));
  } else {
    const result=spawnSync(process.execPath,[
      "scripts/ingest-news.js","--private-scored-stage",
    ],{
      env:{...process.env,
        GEOMACRO_PRIVATE_PULSE_SCOPED:"true",
        GEOMACRO_PRIVATE_PULSE_REFS:JSON.stringify([...refs]),
      },
      stdio:"inherit",timeout:170_000,
    });
    if (result.error || result.status!==0)
      throw Error("PRIVATE_PULSE_BOUND_CLASSIFIER_FAILED");
    console.log(JSON.stringify({domain,private_novel_original_count:refs.size,
      classifier_called:true,public_published:false,payment_performed:false}));
  }
} catch {
  console.error("PRIVATE_PULSE_SCORING_D1_OR_CLASSIFIER_UNVERIFIED");
  process.exitCode=78;
}
