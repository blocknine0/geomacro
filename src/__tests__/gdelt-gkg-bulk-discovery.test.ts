import {describe,expect,it,vi} from "vitest";
import {createHash} from "node:crypto";
import {deflateRawSync} from "node:zlib";
import {
  GDELT_GKG_BULK_SCHEMA,GDELT_GKG_LATEST_URL,
  parseGdeltGkgLastupdate,unpackSingleGkgZip,readGdeltStaticArchive,
  summarizeGdeltGkgBulk,probeGdeltGkgBulk,
} from "../../scripts/lib/gdelt-gkg-bulk-discovery.mjs";
import {parseGdeltFipsCountries,summarizeGdeltEventDiscovery,readGdeltEventDiscovery} from "../lib/gdelt-event-discovery.server";

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

describe("Supabase-free GDELT Event export restores the former source stage",()=>{
  const fipsRows=new Map<string,string>();
  for(let i=0;i<205;i++)fipsRows.set(String.fromCharCode(65+Math.floor(i/26))+String.fromCharCode(65+i%26),"Unknown country "+i);
  fipsRows.set("CH","China");fipsRows.set("US","United States");fipsRows.set("SW","Switzerland");
  const fips=[...fipsRows].map(x=>x.join("\t")).join("\n");
  const event=(id:string,code:string,root="19")=>{const f=Array(61).fill("");f[0]=id;f[1]="20261012";f[28]=root;f[53]=code;f[60]="https://private-original.invalid/never-persist";return f.join("\t");};
  const text=[event("1","CH"),event("2","SW"),event("3","US"),event("3","US"),event("4","XX"),event("5","US","01")].join("\n");
  it("uses official FIPS names plus canonical countries, never confusing FIPS CH with ISO CH",()=>{
    const lookup=parseGdeltFipsCountries(fips);
    const r=summarizeGdeltEventDiscovery(text,lookup,date,now);
    expect(r.country_counts).toEqual([{country_iso3:"CHE",indexed_records:1},{country_iso3:"CHN",indexed_records:1},{country_iso3:"USA",indexed_records:1}]);
    expect(r.unmapped_conflict_rows).toBe(1);expect(r.conflict_root_rows).toBe(4);
    expect(r.original_news_freshness_verified).toBe(false);expect(JSON.stringify(r)).not.toContain("private-original");
  });
  it("reuses the bounded ZIP verifier for the exact Event filename and rejects cross-kind members",()=>{
    const bytes=zip(text,stamp+".export.CSV");
    expect(unpackSingleGkgZip(bytes,stamp,"events")).toBe(text);
    expect(()=>unpackSingleGkgZip(bytes,stamp)).toThrow();
    expect(()=>unpackSingleGkgZip(bytes,stamp,"unknown")).toThrow();
  });
  it("fetches current integrity-matched exports and aggregates without a DB, raw store or DOC calls",async()=>{
    const bytes=zip(text,stamp+".export.CSV"),digest=createHash("md5").update(bytes).digest("hex");
    const index=String(bytes.length)+" "+digest+" http://data.gdeltproject.org/gdeltv2/"+stamp+".export.CSV.zip";
    const fake=vi.fn(async(url:string)=>new Response(url.endsWith("lastupdate.txt")?index:url.endsWith("FIPS.country.txt")?fips:bytes));
    const r=await readGdeltEventDiscovery({fetchImpl:fake as any,now});
    expect(r.archive_integrity_verified).toBe(true);expect(fake).toHaveBeenCalledTimes(3);
    expect(fake.mock.calls[2][0]).toBe("https://gdeltproject.org/data/lookups/FIPS.country.txt");
    expect(fake.mock.calls.some(c=>c[0].includes("supabase")||c[0].includes("api/v2/doc"))).toBe(false);
    expect(r.supabase_requests).toBe(0);
  });
  it("preserves actual integrity/auth/future-date failures without promoting indexed news",async()=>{
    const denied=vi.fn(async()=>new Response("",{status:429}));
    const r=await readGdeltEventDiscovery({fetchImpl:denied as any,now});
    expect(r.archive_integrity_verified).toBe(false);expect(r.reason).toBe("GKG_MANIFEST_HTTP_429");expect(denied).toHaveBeenCalledOnce();
    expect(()=>summarizeGdeltEventDiscovery(text,parseGdeltFipsCountries(fips),"2026-10-12T12:15:00Z",now)).toThrow();
    expect(()=>parseGdeltFipsCountries(fips+"\nCH\tSwitzerland")).toThrow();
  });
});

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

  it("recovers a truly past current GKG batch from one bounded Range GET if lastupdate points to the future",async()=>{
    const futureStamp="20261012121500";
    const futureManifest="100 "+"f".repeat(32)+
      " http://data.gdeltproject.org/gdeltv2/"+futureStamp+".gkg.csv.zip\n";
    const start=1000,tailText="partial-do-not-trust\n"+manifest();
    const end=start+Buffer.byteLength(tailText)-1;
    const fetchImpl=vi.fn(async(url:string,request:RequestInit)=>{
      if(url===GDELT_GKG_LATEST_URL)return new Response(futureManifest);
      if(url==="https://data.gdeltproject.org/gdeltv2/masterfilelist.txt"){
        expect(request.headers).toMatchObject({range:"bytes=-262144"});
        return new Response(tailText,{status:206,headers:{
          "content-range":"bytes "+start+"-"+end+"/"+(end+1),
          "content-type":"text/plain",
        }});
      }
      return new Response(archive);
    });
    const x=await probeGdeltGkgBulk({now,fetchImpl});
    expect(fetchImpl).toHaveBeenCalledTimes(3);
    expect(x).toMatchObject({
      state:"CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY",
      manifest_route:"MASTERFILE_TAIL",upstream_batch_at:date,
      archive_integrity_verified:true,chargeable:false,
      original_pubdate_verified:false,
    });
    expect(x.domains.map((z:any)=>z.theme_matched_article_count)).toEqual([1,1,1]);
  });

  it("fails closed if the past index fallback ignores Range, without inventing a fresh batch",async()=>{
    const futureStamp="20261012121500";
    const futureManifest="100 "+"f".repeat(32)+
      " http://data.gdeltproject.org/gdeltv2/"+futureStamp+".gkg.csv.zip\n";
    const x=await probeGdeltGkgBulk({now,fetchImpl:async(url:string)=>
      url===GDELT_GKG_LATEST_URL
      ?new Response(futureManifest)
      :new Response("unbounded masterfile content",{status:200})});
    expect(x).toMatchObject({state:"GKG_BULK_DEGRADED",
      reason:"GKG_MASTERFILE_RANGE_UNAVAILABLE",
      archive_integrity_verified:false,public_published:false,chargeable:false});
  });
  it("ignores future row clocks even when an older GKG archive is valid",()=>{
    const content=raw+"\n"+row("future","CRITICAL_MINERALS",
      "https://minerals2.example.com/alert").replace(stamp,"20261012121500");
    const result=summarizeGdeltGkgBulk(content,{now,batch_at:date});
    expect(result.domains[2].theme_matched_article_count).toBe(1);
    expect(result.malformed_rows).toBe(1);
  });

  it("reuses the verified GKG archive and adds no official GET if there are no approved first-party article paths",async()=>{
    const fetchImpl=vi.fn(async(url:string)=>{
      if(url===GDELT_GKG_LATEST_URL)return new Response(manifest());
      return new Response(archive);
    });
    const result=await probeGdeltGkgBulk({now,fetchImpl,reviewFirstParty:true});
    expect(fetchImpl).toHaveBeenCalledTimes(2);
    expect(result.state).toBe("CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY");
    expect(result.first_party_original_review).toMatchObject({
      schema:"geomacro.private-gkg-firstparty-original-review.v1",
      state:"NO_ALLOWLISTED_FIRST_PARTY_LEADS",
      bounded_page_request_count:0,maximum_page_request_budget:6,
      commercial_rights_verified:false,independent_event_qualified:false,
      signed_gro_generated:false,chargeable:false,public_published:false,
      supabase_requests:0,d1_writes:0,b2_requests:0,payments_performed:0,
    });
    expect(result.first_party_original_review.domains.map((x:any)=>
      x.publisher_original_24h_dates_verified)).toEqual([0,0,0]);
    expect(JSON.stringify(result)).not.toContain("news.example.org");
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


describe("bounded static archive publication-race recovery",()=>{
  const missingStamp="20261012120000";
  const entry=(kind:string,ts:string,bytes:Buffer)=>`${bytes.length} ${createHash("md5").update(bytes).digest("hex")} http://data.gdeltproject.org/gdeltv2/${ts}.${kind==="gkg"?"gkg.csv":"export.CSV"}.zip\n`;
  for(const kind of ["gkg","events"] as const){
    it(`${kind}: recovers one 404 using a strictly older checksum-pinned entry, never the missing URL again`,async()=>{
      const bytes=zip(raw,stamp+(kind==="gkg"?".gkg.csv":".export.CSV"));
      const latest=entry(kind,missingStamp,bytes),tail=entry(kind,stamp,bytes)+latest;
      const fetcher=vi.fn(async(url:string)=>{
        if(url.endsWith("lastupdate.txt"))return new Response(latest);
        if(url.endsWith("masterfilelist.txt"))return new Response(tail,{status:206,headers:{"content-range":`bytes 0-${Buffer.byteLength(tail)-1}/${Buffer.byteLength(tail)}`}});
        return url.includes(missingStamp)?new Response("missing",{status:404}):new Response(bytes);
      });
      const r=await readGdeltStaticArchive({fetchImpl:fetcher,now,kind});
      expect(r.manifest.batch_at).toBe(date);expect(r.manifest_route).toBe("MASTERFILE_EARLIER_AFTER_404");
      expect(fetcher).toHaveBeenCalledTimes(4);
      expect(fetcher.mock.calls.filter(c=>c[0].includes(missingStamp))).toHaveLength(1);
    });
  }
  it("never falls back on denial or checksum failure",async()=>{
    for(const status of [401,403,429,500]){
      const fake=vi.fn(async(url:string)=>url.endsWith("lastupdate.txt")?new Response(manifest()):new Response("held",{status}));
      await expect(readGdeltStaticArchive({fetchImpl:fake,now})).rejects.toThrow(`GKG_ARCHIVE_HTTP_${status}`);
      expect(fake).toHaveBeenCalledTimes(2);
    }
    const fake=vi.fn(async(url:string)=>url.endsWith("lastupdate.txt")?new Response(manifest("0".repeat(32))):new Response(archive));
    await expect(readGdeltStaticArchive({fetchImpl:fake,now})).rejects.toThrow("GKG_ARCHIVE_MD5_OR_SIZE_MISMATCH");
    expect(fake).toHaveBeenCalledTimes(2);
  });
  it("stops after a second missing object and refuses a tail containing only the same or future entries",async()=>{
    for(const older of [true,false]){
      const latest=entry("gkg",missingStamp,archive),tail=(older?manifest():"")+latest;
      const fake=vi.fn(async(url:string)=>url.endsWith("lastupdate.txt")?new Response(latest):url.endsWith("masterfilelist.txt")?
        new Response(tail,{status:206,headers:{"content-range":`bytes 0-${Buffer.byteLength(tail)-1}/${Buffer.byteLength(tail)}`}}):new Response("missing",{status:404}));
      await expect(readGdeltStaticArchive({fetchImpl:fake,now})).rejects.toThrow(older?"GKG_ARCHIVE_HTTP_404":"GKG_NO_CURRENT_PINNED_BATCH");
      expect(fake).toHaveBeenCalledTimes(older?4:3);
    }
  });
});
