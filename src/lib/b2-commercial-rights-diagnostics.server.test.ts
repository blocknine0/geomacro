import { describe,expect,it,vi } from "vitest";
import { diagnoseB2RightsReadPrerequisites } from "./b2-live.server";
describe("B2 commercial-rights runtime prerequisites: no network or secret disclosure",()=>{
  it("reports absent runtime config without calling reserve/B2",()=>{
    const snapshot={
      B2_ARCHIVE_READ_KEY_ID:process.env.B2_ARCHIVE_READ_KEY_ID,
      B2_ARCHIVE_READ_APPLICATION_KEY:process.env.B2_ARCHIVE_READ_APPLICATION_KEY,
      B2_KEY_ID:process.env.B2_KEY_ID,B2_APPLICATION_KEY:process.env.B2_APPLICATION_KEY,
      GEOMACRO_CONTROL_PLANE_TOKEN:process.env.GEOMACRO_CONTROL_PLANE_TOKEN,
      CONTROL_PLANE_TOKEN:process.env.CONTROL_PLANE_TOKEN,
    };
    const stub=vi.spyOn(globalThis,"fetch");
    try{
      for(const key of Object.keys(snapshot))delete process.env[key];
      const result=diagnoseB2RightsReadPrerequisites();
      expect(result.status).toBe("B2_READ_CREDENTIALS_MISSING");
      expect(result.credentials_configured).toBe(false);
      expect(result.signed_b2_get_attempted).toBe(false);
      expect(JSON.stringify(result)).not.toContain("secret");
      expect(stub).not.toHaveBeenCalled();
    }finally{
      for(const [key,value] of Object.entries(snapshot))
        if(value===undefined)delete process.env[key];else process.env[key]=value;
      stub.mockRestore();
    }
  });
  it("distinguishes missing control token without exposing any values",()=>{
    const snapshot={
      B2_ARCHIVE_READ_KEY_ID:process.env.B2_ARCHIVE_READ_KEY_ID,
      B2_ARCHIVE_READ_APPLICATION_KEY:process.env.B2_ARCHIVE_READ_APPLICATION_KEY,
      B2_KEY_ID:process.env.B2_KEY_ID,B2_APPLICATION_KEY:process.env.B2_APPLICATION_KEY,
      GEOMACRO_CONTROL_PLANE_TOKEN:process.env.GEOMACRO_CONTROL_PLANE_TOKEN,
      CONTROL_PLANE_TOKEN:process.env.CONTROL_PLANE_TOKEN,
    };
    try{
      process.env.B2_ARCHIVE_READ_KEY_ID="test-only-not-real";
      process.env.B2_ARCHIVE_READ_APPLICATION_KEY="test-only-not-real";
      delete process.env.GEOMACRO_CONTROL_PLANE_TOKEN;
      delete process.env.CONTROL_PLANE_TOKEN;
      const result=diagnoseB2RightsReadPrerequisites();
      expect(result.status).toBe("CONTROL_PLANE_TOKEN_MISSING");
      expect(result.signed_b2_get_attempted).toBe(false);
      expect(JSON.stringify(result)).not.toContain("test-only-not-real");
    }finally{
      for(const [key,value] of Object.entries(snapshot))
        if(value===undefined)delete process.env[key];else process.env[key]=value;
    }
  });
});
