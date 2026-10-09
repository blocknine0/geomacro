import { describe, expect, it } from "vitest";
import { mkdtempSync, rmSync, writeFileSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { pathToFileURL } from "node:url";
import { spawnSync } from "node:child_process";

const SCRIPT=resolve("scripts/intelligence-orchestrator.mjs");
const env:Record<string,string>={
  PATH:process.env.PATH??"",
  CLOUDFLARE_ACCOUNT_ID:"account-test-id",
  CLOUDFLARE_API_TOKEN:"test-no-production-secret-token-123",
  D1_DATABASE_ID:"12345678-1234-1234-1234-123456789abc",
  INTELLIGENCE_ORCHESTRATOR_TASK_ALLOWLIST:"official_native_rss",
  GEOMACRO_SUPABASE_RESTRICTED_MODE:"true",
  TELEGRAM_ENABLED:"false",
  GRI_PUBLISH_ENABLED:"false",
};
const source=readFileSync(SCRIPT,"utf8");

describe("#1827 scheduled intelligence control-plane requires only canonical D1, never fake Supabase login",()=>{
  it("preserves a preexisting future-due D1 cursor with ZERO Supabase credentials or B2/paid requests",()=>{
    const dir=mkdtempSync(join(tmpdir(),"geomacro-d1-direct-"));
    try {
      const mock=join(dir,"mock-d1-fetch.mjs");
      writeFileSync(mock,`
globalThis.fetch=async (url,init)=>{
  const parsed=new URL(String(url));
  if(parsed.hostname!=="api.cloudflare.com" ||
     !parsed.pathname.includes("/accounts/account-test-id/d1/database/12345678-1234-1234-1234-123456789abc/query") ||
     init.method!=="POST" ||
     !String(init.headers.authorization).startsWith("Bearer test-no-production") ||
     !JSON.parse(init.body).sql.includes("FROM pipeline_checkpoint") ||
     JSON.parse(init.body).params[0]!=="intelligence_orchestrator") {
    throw Error("UNAUTHORIZED_NETWORK_OR_QUERY");
  }
  const timestamp=new Date().toISOString();
  const due=new Date(Date.now()+60*60*1000).toISOString();
  return Response.json({success:true,result:[{success:true,results:[{
    scope:"official_native_rss",status:"HEALTHY",
    last_attempt_at:timestamp,last_success_at:timestamp,
    updated_at:timestamp,
    cursor:JSON.stringify({next_due_at:due,bootstrap_pending:false,status:"healthy"}),
    metadata_json:JSON.stringify({source:"geomacro_intelligence_orchestrator",task:"official_native_rss"}),
  }]}]});
};
`,{mode:0o600});
      const result=spawnSync(process.execPath,[
        "--import",pathToFileURL(mock).href,SCRIPT,
      ],{env,cwd:process.cwd(),encoding:"utf8",timeout:15000});
      expect(result.status, result.stderr||result.stdout).toBe(0);
      const report=JSON.parse(result.stdout);
      expect(report).toMatchObject({
        ok:true,restricted_data_plane:true,selected:[],
        task_allowlist:["official_native_rss"],
      });
      expect(JSON.stringify(report)).not.toContain("test-no-production");
      expect(JSON.stringify(report)).not.toContain("SUPABASE_SERVICE_ROLE_KEY");
      expect(result.stderr).not.toContain("SUPABASE");
    } finally {rmSync(dir,{recursive:true,force:true});}
  });

  it("fails before touching external network without D1 authorization even when Supabase secrets are present",()=>{
    const result=spawnSync(process.execPath,[SCRIPT],{
      env:{
        ...env,CLOUDFLARE_ACCOUNT_ID:"",
        APP_SUPABASE_URL:"https://ldpwajisioljyjtojvfx.supabase.co",
        APP_SUPABASE_SERVICE_ROLE_KEY:"legacy-secret-should-not-be-used",
      },
      cwd:process.cwd(),encoding:"utf8",timeout:10000,
    });
    expect(result.status).not.toBe(0);
    expect(result.stderr).toContain("D1_CONTROL_STATE_CLOUDFLARE_ACCOUNT_ID_REQUIRED");
    expect(result.stderr).not.toContain("legacy-secret-should-not-be-used");
    expect(result.stdout).toBe("");
  });

  it("does not import or synthesize service-role credentials and retains frozen Supabase task restrictions",()=>{
    const loader=readFileSync("scripts/lib/direct-postgres-supabase-loader.mjs","utf8");
    const workflow=readFileSync(".github/workflows/intelligence-orchestrator.yml","utf8");
    expect(source).toContain("const d1State = createD1ControlPlaneStateClient()");
    expect(source).toContain("await d1State.persist(task.key, payload");
    expect(source).toContain("await d1State.loadRows()");
    expect(source).toContain("new Map([...rows.values()].map((row) => [row.source_id, row]))");
    expect(source).not.toContain('from "@supabase/supabase-js"');
    expect(source).not.toContain("APP_SUPABASE_URL");
    expect(source).not.toContain("APP_SUPABASE_SERVICE_ROLE_KEY");
    expect(source).not.toContain(".from(\"live_intelligence_scheduler_state\")");
    expect(loader).not.toContain("ORCHESTRATOR_SHIM_URL");
    expect(workflow).toContain("GEOMACRO_SUPABASE_RESTRICTED_MODE=true");
    expect(workflow).toContain('B2_ACCOUNT_QUOTA_REQUIRED: "1"');
    expect(workflow).toContain('cron: "7,22,37,52 * * * *"');
    expect(workflow).toContain("Probe optional Supabase data plane without blocking D1/B2 heartbeat");
  });
});
