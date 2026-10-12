import {describe,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {deflateRawSync} from "node:zlib";
import {
  GDELT_GKG_BULK_SCHEMA,GDELT_GKG_LATEST_URL,
  parseGdeltGkgLastupdate,unpackSingleGkgZip,
  summarizeGdeltGkgBulk,probeGdeltGkgBulk,
} from "../../scripts/lib/gdelt-gkg-bulk-discovery.mjs";

const now=new Date("2026-10-12T12:00:00.000Z");
const stamp="20261012114500",date="2026-10-12T11:45:00.000Z";
function row(id:string,themes:string,source="https://news.example.org/post"){
  const fields=Array(27).fill("");
  fields[0]="gkg-"+id;fields[1]=stamp;fields[3]="news.example.org";
  fields[4]=source;fields[7]=themes;
  return fields.join("\t");
}
const raw=[
  row("1","ARMED_CONFLICT;MILITARY"),
  row("2","ECON_INFLATION;EPU_CATS_MONETARY_POLICY",
      "https://economy.example.net/post"),
  row("3","CRITICAL_MINERALS;RARE_EARTH",
      "https://minerals.example.org/post"),
  row("3dup","CRITICAL_MINERALS",
      "https://minerals.example.org/post"),
  row("4","UNRELATED_TOPIC",
      "https://news.example.org/other"),
].join("\n")+"\n";
function zip(body:string, filename=stamp+".gkg.csv"){
  const data=Buffer.from(body,"utf8"),packed=deflateRawSync(data);
  const name=Buffer.from(filename,"utf8");
  const local=Buffer.alloc(30),central=Buffer.alloc(46),eocd=Buffer.alloc(22);
  local.writeUInt32LE(0x04034b50,0);local.writeUInt16LE(20,4);
  local.writeUInt16LE(8,8);local.writeUInt32LE(packed.length,18);
  local.writeUInt32LE(data.length,22);local.writeUInt16LE(name.length,26);
  const centralOffset=local.length+name.length+packed.length;
  central.writeUInt32LE(0x02014b50,0);central.writeUInt16LE(20,4);
  central.writeUInt16LE(20,6);central.writeUInt16LE(8,10);
  central.writeUInt32LE(packed.length,20);central.writeUInt32LE(data.length,24);
  central.writeUInt16LE(name.length,28);central.writeUInt32LE(0,42);
  eocd.writeUInt32LE(0x06054b50,0);eocd.writeUInt16LE(1,8);
  eocd.writeUInt16LE(1,10);eocd.writeUInt32LE(central.length+name.length,12);
  eocd.writeUInt32LE(centralOffset,16);
  return Buffer.concat([local,name,packed,central,name,eocd]);
}
const archive=zip(raw);
const md5=createHash("md5").update(archive).digest("hex");
const manifest=(digest=md5,bytes=archive.length)=>
  String(bytes)+" "+digest+" http://data.gdeltproject.org/gdeltv2/"+stamp+".gkg.csv.zip\n"+
  "42 "+"e".repeat(32)+" http://data.gdeltproject.org/gdeltv2/"+stamp+".export.CSV.zip\n";

describe("#2042 static GDELT 15-minute global discovery independent of DOC 429",()=>{
  it("validates pinned GKG only; rejects old, future, malformed, off-host and excessive batches",()=>{
    expect(parseGdeltGkgLastupdate(manifest(),{now})).toMatchObject({
      expected_bytes:archive.length,expected_md5:md5,batch_at:date,
      fetch_url:"https://data.gdeltproject.org/gdeltv2/"+stamp+".gkg.csv.zip",
    });
    expect(()=>parseGdeltGkgLastupdate(manifest(),{now:new Date("2026-10-13T12:00:00Z")})).toThrow("GKG_NO_CURRENT_PINNED_BATCH");
    expect(()=>parseGdeltGkgLastupdate(manifest(),{now:new Date("2026-10-12T11:44:00Z")})).toThrow();
    expect(()=>parseGdeltGkgLastupdate(
      manifest().replace("data.gdeltproject.org","evil.example"),{now})).toThrow();
    expect(()=>parseGdeltGkgLastupdate(
      manifest().replace(".gkg.csv.zip",".gkg.csv.zip?token=secret"),{now})).toThrow();
    expect(()=>parseGdeltGkgLastupdate("A".repeat(9000),{now})).toThrow();
  });
  it("verifies one pinned ZIP member with hard-cap decompression",()=>{
    expect(unpackSingleGkgZip(archive,stamp)).toBe(raw);
    expect(()=>unpackSingleGkgZip(zip(raw,"../secret.txt"),stamp)).toThrow();
    expect(()=>unpackSingleGkgZip(archive,"20261011114500")).toThrow();
    const corrupt=Buffer.from(archive);
    corrupt[60]^=0xff;
    expect(()=>unpackSingleGkgZip(corrupt,stamp)).toThrow();
  });
  it("counts three unverified topical baskets but not raw articles, countries or paid evidence",()=>{
    const s=summarizeGdeltGkgBulk(raw,{now,batch_at:date});
    expect(s).toMatchObject({schema:GDELT_GKG_BULK_SCHEMA,
      state:"CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY",
      public_published:false,chargeable:false,
      original_pubdate_verified:false,independent_event_verified:false,
      supabase_requests:0,b2_requests:0,d1_writes:0,payments_performed:0});
    expect(s.domains.map((x:any)=>x.theme_matched_article_count)).toEqual([1,1,1]);
    expect(s.domains.every((x:any)=>!x.article_origin_publication_verified &&
      !x.same_event_independently_corroborated && !x.chargeable)).toBe(true);
    expect(JSON.stringify(s)).not.toContain("news.example.org");
    expect(JSON.stringify(s)).not.toContain("critical minerals");
    expect(JSON.stringify(s)).not.toContain("https://");
    expect(()=>summarizeGdeltGkgBulk(raw,{now:new Date("2026-10-13T12:00:00Z"),batch_at:date})).toThrow();
  });
  it("uses at most one manifest + one archive GET, verifies manifest MD5 and bounds",async()=>{
    const fetchImpl=vi.fn(async(url:string,options:RequestInit)=>{
      expect(options.redirect).toBe("error");
      expect(String(url).startsWith("https://data.gdeltproject.org/")).toBe(true);
      return url===GDELT_GKG_LATEST_URL
        ?new Response(manifest(),{headers:{"content-type":"text/plain"}})
        :new Response(archive,{headers:{"content-type":"application/zip"}});
    });
    const result=await probeGdeltGkgBulk({now,fetchImpl});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.state).toBe("CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY");
    expect(result.archive_integrity_verified).toBe(true);
    expect(result.domains.map((x:any)=>x.theme_matched_article_count)).toEqual([1,1,1]);
    expect(JSON.stringify(result)).not.toContain("news.example.org");
    const bad=await probeGdeltGkgBulk({now,fetchImpl:async(url:string)=>
      url===GDELT_GKG_LATEST_URL
        ?new Response(manifest("f".repeat(32)))
        :new Response(archive)});
    expect(bad).toMatchObject({state:"GKG_BULK_DEGRADED",
      reason:"GKG_ARCHIVE_MD5_OR_SIZE_MISMATCH",chargeable:false});
  });
  it("reports HTTP 429 as degraded without request storms or secrets",async()=>{
    let calls=0;
    const denied=await probeGdeltGkgBulk({now,fetchImpl:async()=>{
      calls++;return new Response("sensitive upstream body",{status:429});}});
    expect(calls).toBe(1);
    expect(denied).toMatchObject({state:"GKG_BULK_DEGRADED",
      reason:"GKG_MANIFEST_HTTP_429",public_published:false,chargeable:false});
    expect(JSON.stringify(denied)).not.toContain("sensitive");
  });
});
