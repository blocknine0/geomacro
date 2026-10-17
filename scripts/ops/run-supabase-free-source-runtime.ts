import {createD1ControlPlaneStateClient} from "../lib/d1-control-plane-state.mjs";
import {runSupabaseFreeSourceRuntime} from "../../src/lib/supabase-free-source-runtime.server";
try{
  for(const [key,value] of Object.entries(process.env))
    if(/^(?:APP_|HISTORICAL_|TELEGRAM_SIGNAL_)?SUPABASE_(?:URL|DB_URL|SERVICE_ROLE_KEY|ACCESS_TOKEN|DB_PASSWORD)$/.test(key)&&value)
      throw Error("SOURCE_RUNTIME_FROZEN_CREDENTIALS_FORBIDDEN");
  const state=createD1ControlPlaneStateClient({pipeline:"supabase_free_source_runtime"});
  const report=await runSupabaseFreeSourceRuntime({state});
  console.log(JSON.stringify(report));
  if(!report.source_reads_healthy)process.exitCode=3;
}catch{
  console.error("SOURCE_RUNTIME_D1_EXECUTION_UNAVAILABLE");process.exitCode=2;
}
