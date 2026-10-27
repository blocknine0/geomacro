import {copyFileSync,readFileSync,writeFileSync,lstatSync,readdirSync} from "node:fs";
import {resolve,relative} from "node:path";
import {pathToFileURL} from "node:url";

export function prepareWebCandidate({root=process.cwd(),sha=process.env.GITHUB_SHA}={}) {
  if (!/^[a-f0-9]{40}$/.test(sha??"")) throw Error("CANDIDATE_EXACT_SHA_REQUIRED");
  const dir=resolve(root,".output/server");
  const config=JSON.parse(readFileSync(resolve(dir,"wrangler.json"),"utf8"));
  if(config.main!=="index.mjs" || config.assets?.directory!=="../public" ||
     config.assets?.binding!=="ASSETS" || config.no_bundle!==true ||
     !config.compatibility_flags?.includes("nodejs_compat") ||
     !config.compatibility_flags?.includes("global_fetch_strictly_public"))
    throw Error("CANDIDATE_BUILD_LAYOUT_UNVERIFIED");
  // Keep the existing generated app/assets, but reconstruct the deployment
  // settings from an allowlist: never inherit routes, domains or paid bindings.
  const safe={name:"geomacro-web-candidate",main:"candidate.mjs",
    compatibility_date:config.compatibility_date,
    compatibility_flags:["nodejs_compat","global_fetch_strictly_public"],
    no_bundle:true,rules:[{type:"ESModule",globs:["**/*.mjs","**/*.js"]}],
    assets:{binding:"ASSETS",directory:"../public",run_worker_first:true},
    // Workers Free enforces its own CPU ceiling and rejects any cpu_ms
    // override (100328). Never turn this into a paid-plan upgrade.
    workers_dev:true,preview_urls:false,
    vars:{GEOMACRO_SUPABASE_RUNTIME_MODE:"standby",
      // Historical project is independently quota-governed, B2-first and
      // fail-closed without BOTH server-only historical and D1 credentials.
      GEOMACRO_HISTORICAL_SUPABASE_READ_MODE:"fallback"},
    observability:{enabled:false}};
  // Conservative ceiling, below the currently documented Worker bundle cap.
  let bytes=0;
  function visit(path) {
    for(const name of readdirSync(path)) {
      const file=resolve(path,name),stat=lstatSync(file);
      if(stat.isSymbolicLink())throw Error("CANDIDATE_BUILD_SYMLINK_REJECTED");
      if(stat.isDirectory())visit(file); else bytes+=stat.size;
    }
  }
  visit(dir);
  if(bytes>16*1024*1024)throw Error("CANDIDATE_BUILD_SIZE_REJECTED");
  const marker={schema_version:"geomacro.deployment-build.v1",
    canonical_repository:"blocknine0/geomacro",canonical_main_sha:sha,
    production_activation_performed:false,candidate_mode:"read-only-no-funds"};
  writeFileSync(resolve(dir,"../public/.well-known/geomacro-build.json"),JSON.stringify(marker)+"\n");
  copyFileSync(resolve(root,"workers/web-candidate/read-only.mjs"),resolve(dir,"candidate-guard.mjs"));
  writeFileSync(resolve(dir,"candidate.mjs"),
    'import app from "./index.mjs";\nimport {readOnlyCandidate} from "./candidate-guard.mjs";\nexport default readOnlyCandidate(app);\n');
  const output=resolve(dir,"candidate-wrangler.json");
  writeFileSync(output,JSON.stringify(safe,null,2)+"\n");
  return {schema:"geomacro.web-candidate-build.v1",canonical_main_sha:sha,
    config:relative(root,output),server_bytes_before_wrapper:bytes,
    read_only:true,production_domain_changed:false,private_bindings_added:false,
    payment_authorized:false};
}
if(process.argv[1]&&import.meta.url===pathToFileURL(resolve(process.argv[1])).href)
  console.log(JSON.stringify(prepareWebCandidate()));
