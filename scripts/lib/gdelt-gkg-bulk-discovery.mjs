// GDELT 2.0 GKG 15-minute STATIC bulk discovery. No DOC API quota,
// Supabase, B2, model calls, article storage, source-native date or risk score.
// The batch clock is GDELT observation time, NEVER publisher publication time.
import {createHash} from "node:crypto";
import {inflateRawSync} from "node:zlib";

export const GDELT_GKG_LATEST_URL="https://data.gdeltproject.org/gdeltv2/lastupdate.txt";
export const GDELT_GKG_MASTERFILE_URL="https://data.gdeltproject.org/gdeltv2/masterfilelist.txt";
const MAX_MASTERFILE_TAIL_BYTES=256*1024;
export const GDELT_GKG_BULK_SCHEMA="geomacro.private-gdelt-gkg-bulk-discovery.v1";
const MAX_INDEX_BYTES=8192;
const MAX_PACKED_BYTES=18*1024*1024;
const MAX_UNPACKED_BYTES=64*1024*1024;
const MAX_ROWS=100000;
const MAX_AGE_MS=2*60*60*1000;
const CATEGORIES=["geopolitics","macro","rare_earth"];
const TOPIC={
  geopolitics:/(?:^|_)(?:ARMEDCONFLICT|ARMED_CONFLICT|MILITARY|WAR|COUP|TERROR|INSURGENCY|SANCTION|PROTEST|PEACEKEEP|BORDER_DISPUTE|VIOLENCE|CEASEFIRE|CONFLICT)(?:_|$)/iu,
  macro:/(?:^|_)(?:INFLATION|MONETARY|CENTRAL_BANK|INTEREST_RATE|CURRENCY|EXCHANGE_RATE|UNEMPLOYMENT|RECESSION|DEBT_CRISIS|BANKING_CRISIS|FISCAL_POLICY|GDP|MACROECONOM)(?:_|$)/iu,
  rare_earth:/(?:^|_)(?:RARE_EARTH|CRITICAL_MINERAL|MINING|MINERAL_RESOURCE|LITHIUM|COBALT|GALLIUM|GERMANIUM|GRAPHITE|NEODYMIUM|NICKEL|DYSPROSIUM|TERBIUM)(?:_|$)/iu,
};
const md5=buffer=>createHash("md5").update(buffer).digest("hex");
const sha256=buffer=>createHash("sha256").update(buffer).digest("hex");
function utcFromStamp(value){
  if(!/^\d{14}$/u.test(String(value)))return null;
  const x=String(value);
  const iso=x.slice(0,4)+"-"+x.slice(4,6)+"-"+x.slice(6,8)+"T"+
    x.slice(8,10)+":"+x.slice(10,12)+":"+x.slice(12,14)+".000Z";
  const ms=Date.parse(iso);
  return Number.isFinite(ms)&&new Date(ms).toISOString()===iso?iso:null;
}
export function parseGdeltGkgLastupdate(raw,{now=new Date(),maxBytes=MAX_INDEX_BYTES}={}){
  if(!Number.isSafeInteger(maxBytes)||maxBytes<1||maxBytes>MAX_MASTERFILE_TAIL_BYTES||
     typeof raw!=="string"||Buffer.byteLength(raw)>maxBytes||
     !Number.isFinite(now.getTime()))throw Error("GKG_MANIFEST_INVALID");
  const matches=[];
  for(const line of raw.split(/\r?\n/u)){
    if(!line.trim())continue;
    const fields=line.trim().split(/\s+/u);
    if(fields.length!==3)continue;
    const [size,checksum,path]=fields;
    if(!/^[0-9a-f]{32}$/iu.test(checksum)||!/^[1-9]\d{0,8}$/u.test(size))continue;
    let uri;
    try{uri=new URL(path);}catch{continue}
    const name=/^\/gdeltv2\/(\d{14})\.gkg\.csv\.zip$/u.exec(uri.pathname);
    if(!name||uri.hostname!=="data.gdeltproject.org"||
       !["http:","https:"].includes(uri.protocol)||uri.port||
       uri.search||uri.hash||uri.username||uri.password)continue;
    const batch=utcFromStamp(name[1]);const age=now.getTime()-Date.parse(batch??"");
    if(!batch||age<0||age>MAX_AGE_MS||Number(size)>MAX_PACKED_BYTES)continue;
    matches.push({batch_at:batch,expected_md5:checksum.toLowerCase(),
      expected_bytes:Number(size),
      // No source URL from untrusted file: reconstruct exact pinned HTTPS.
      fetch_url:"https://data.gdeltproject.org"+uri.pathname});
  }
  matches.sort((a,b)=>b.batch_at.localeCompare(a.batch_at));
  if(!matches.length)throw Error("GKG_NO_CURRENT_PINNED_BATCH");
  return matches[0];
}
async function limitedBody(response,limit){
  if(!response?.body)throw Error("GKG_BODY_MISSING");
  const header=Number(response.headers?.get?.("content-length")??0);
  if(header>limit)throw Error("GKG_BODY_OVERSIZE");
  const reader=response.body.getReader(),chunks=[];let total=0;
  try{
    for(;;){
      const {done,value}=await reader.read();
      if(done)break;
      total+=value.byteLength;
      if(total>limit)throw Error("GKG_BODY_OVERSIZE");
      chunks.push(Buffer.from(value));
    }
  }finally{reader.releaseLock();}
  return Buffer.concat(chunks);
}
// ZIP single-member parser. Deflate only, no encryption, multi-file, zip64,
// paths, or unbounded decompression. Central directory is authoritative.
export function unpackSingleGkgZip(blob,expectedStamp){
  if(!Buffer.isBuffer(blob)||blob.length<120||blob.length>MAX_PACKED_BYTES)
    throw Error("GKG_ZIP_INVALID");
  let end=-1;
  for(let p=blob.length-22;p>=Math.max(0,blob.length-65557);p--){
    if(blob.readUInt32LE(p)===0x06054b50){end=p;break;}
  }
  if(end<0||blob.readUInt16LE(end+8)!==1||
     blob.readUInt16LE(end+10)!==1||blob.readUInt16LE(end+4)!==0||
     blob.readUInt16LE(end+6)!==0)throw Error("GKG_ZIP_CENTRAL_INVALID");
  const central=blob.readUInt32LE(end+16),directorySize=blob.readUInt32LE(end+12);
  if(central+directorySize>end||central+46>blob.length||
     blob.readUInt32LE(central)!==0x02014b50)
    throw Error("GKG_ZIP_CENTRAL_INVALID");
  const flags=blob.readUInt16LE(central+8),method=blob.readUInt16LE(central+10);
  const packed=blob.readUInt32LE(central+20),unpacked=blob.readUInt32LE(central+24);
  const nameSize=blob.readUInt16LE(central+28),
    extra=blob.readUInt16LE(central+30),comment=blob.readUInt16LE(central+32);
  const local=blob.readUInt32LE(central+42);
  if(flags&1||![0,8].includes(method)||packed>MAX_PACKED_BYTES||
     unpacked>MAX_UNPACKED_BYTES||
     central+46+nameSize+extra+comment>central+directorySize||
     central+46+nameSize>blob.length||
     blob.toString("utf8",central+46,central+46+nameSize)!==
       expectedStamp+".gkg.csv"||local+30>central||
     blob.readUInt32LE(local)!==0x04034b50||
     blob.readUInt16LE(local+8)!==method)
    throw Error("GKG_ZIP_ENTRY_INVALID");
  const localName=blob.readUInt16LE(local+26),
    localExtra=blob.readUInt16LE(local+28);
  const offset=local+30+localName+localExtra;
  if(offset+packed>central||offset<0||offset>blob.length||
     blob.toString("utf8",local+30,local+30+localName)!==
       expectedStamp+".gkg.csv")throw Error("GKG_ZIP_ENTRY_INVALID");
  const zipped=blob.subarray(offset,offset+packed);
  let plain;
  try{
    plain=method===0?zipped:inflateRawSync(zipped,{maxOutputLength:MAX_UNPACKED_BYTES+1});
  }catch{throw Error("GKG_ZIP_DECOMPRESSION_FAILED")}
  if(plain.byteLength!==unpacked||plain.byteLength>MAX_UNPACKED_BYTES)
    throw Error("GKG_ZIP_SIZE_MISMATCH");
  return new TextDecoder("utf-8",{fatal:true}).decode(plain);
}
export function summarizeGdeltGkgBulk(content,{batch_at,now=new Date()}){
  const batch=Date.parse(batch_at);
  if(typeof content!=="string"||Buffer.byteLength(content)>MAX_UNPACKED_BYTES||
     !Number.isFinite(batch)||!Number.isFinite(now.getTime())||
     batch>now.getTime()||now.getTime()-batch>MAX_AGE_MS)
    throw Error("GKG_SUMMARY_INVALID");
  const seen=Object.fromEntries(CATEGORIES.map(c=>[c,new Set()]));
  const outlets=Object.fromEntries(CATEGORIES.map(c=>[c,new Set()]));
  let scanned=0,invalid=0;
  for(const line of content.split("\n")){
    if(!line.trim())continue;
    if(++scanned>MAX_ROWS)throw Error("GKG_ROWS_EXCEEDED");
    const cols=line.replace(/\r$/u,"").split("\t");
    if(cols.length!==27){invalid++;continue}
    const date=utcFromStamp(cols[1]);
    if(!date||Date.parse(date)>now.getTime()||
       Math.abs(Date.parse(date)-batch)>60*60*1000){invalid++;continue}
    const url=cols[4];
    let host;
    try{
      const uri=new URL(url);
      if(!["http:","https:"].includes(uri.protocol)||uri.username||uri.password||
         uri.href.length>2048)continue;
      host=uri.hostname.toLowerCase();
    }catch{continue}
    // Theme codes only; not arbitrary article text, names or URL substrings.
    const themes=(cols[7]+";"+cols[8]).split(";")
      .map(x=>x.split(",")[0]).slice(0,2000);
    for(const category of CATEGORIES){
      if(themes.some(theme=>TOPIC[category].test(theme))){
        seen[category].add(sha256(url));
        outlets[category].add(host);
      }
    }
  }
  return {
    schema:GDELT_GKG_BULK_SCHEMA,
    state:"CURRENT_GKG_BATCH_SCANNED_PRIVATE_DISCOVERY_ONLY",
    source:"gdelt_v2_gkg_static_15m_archive",
    checked_at:now.toISOString(),upstream_batch_at:batch_at,
    batch_age_minutes:Math.floor((now.getTime()-batch)/60000),
    total_gkg_rows_scanned:scanned,malformed_rows:invalid,
    domains:CATEGORIES.map(category=>({
      category,theme_matched_article_count:seen[category].size,
      observed_outlet_host_count:outlets[category].size,
      article_origin_publication_verified:false,
      same_event_independently_corroborated:false,
      current_scored_event_verified:false,commercial_rights_verified:false,
      chargeable:false,
    })),
    original_pubdate_verified:false,independent_event_verified:false,
    public_published:false,chargeable:false,
    supabase_requests:0,b2_requests:0,d1_writes:0,payments_performed:0,
  };
}
export async function probeGdeltGkgBulk({fetchImpl=fetch,now=new Date()}={}){
  try{
    const request=async(url,timeout)=>fetchImpl(url,{
      redirect:"error",headers:{accept:"*/*",
        "user-agent":"Geomacro-Private-GDELT-Static-GKG/1.0"},
      signal:AbortSignal.timeout(timeout),
    });
    const index=await request(GDELT_GKG_LATEST_URL,12000);
    if(!index?.ok)throw Error("GKG_MANIFEST_HTTP_"+(index?.status??"UNKNOWN"));
    const text=(await limitedBody(index,MAX_INDEX_BYTES)).toString("utf8");
    let manifest;
    let manifest_route="LASTUPDATE";
    try{manifest=parseGdeltGkgLastupdate(text,{now});}
    catch(error){
      if(!(error instanceof Error)||error.message!=="GKG_NO_CURRENT_PINNED_BATCH")throw error;
      // During boundary rollover the official lastupdate pointer can
      // advertise a not-yet-current/future batch. Never mint its timestamp.
      // Read bounded earlier GKG manifest entries, max ONE Range GET.
      const tail=await fetchImpl(GDELT_GKG_MASTERFILE_URL,{
        redirect:"error",
        headers:{accept:"text/plain","range":"bytes=-"+MAX_MASTERFILE_TAIL_BYTES,
          "user-agent":"Geomacro-Private-GDELT-Static-GKG/1.0"},
        signal:AbortSignal.timeout(12000),
      });
      if(tail?.status!==206)throw Error("GKG_MASTERFILE_RANGE_UNAVAILABLE");
      const range=String(tail.headers?.get?.("content-range")??"");
      const parts=/^bytes (\d+)-(\d+)\/(\d+)$/u.exec(range);
      if(!parts||Number(parts[2])<Number(parts[1])||
         Number(parts[3])<=Number(parts[2])||
         Number(parts[2])-Number(parts[1])+1>MAX_MASTERFILE_TAIL_BYTES)
        throw Error("GKG_MASTERFILE_RANGE_INVALID");
      const recovered=await limitedBody(tail,MAX_MASTERFILE_TAIL_BYTES);
      const batchText=recovered.toString("utf8");
      // Truncated first line cannot become a candidate.
      const trimmed=Number(parts[1])>0?
        batchText.slice(batchText.indexOf("\n")+1):batchText;
      manifest=parseGdeltGkgLastupdate(trimmed,{now,
        maxBytes:MAX_MASTERFILE_TAIL_BYTES});
      manifest_route="MASTERFILE_TAIL";
    }
    const archive=await request(manifest.fetch_url,25000);
    if(!archive?.ok)throw Error("GKG_ARCHIVE_HTTP_"+(archive?.status??"UNKNOWN"));
    const zipped=await limitedBody(archive,MAX_PACKED_BYTES);
    if(zipped.length!==manifest.expected_bytes||md5(zipped)!==manifest.expected_md5)
      throw Error("GKG_ARCHIVE_MD5_OR_SIZE_MISMATCH");
    const stamp=manifest.batch_at.replace(/\D/gu,"").slice(0,14);
    const decoded=unpackSingleGkgZip(zipped,stamp);
    return {...summarizeGdeltGkgBulk(decoded,{now,batch_at:manifest.batch_at}),
      manifest_route,archive_integrity_verified:true,
      archive_sha256:sha256(zipped)};
  }catch(error){
    // No error string or upstream URL, only safe fixed-shape reason enum.
    const reason=String(error instanceof Error?error.message:"");
    const allow=["GKG_MANIFEST_INVALID","GKG_NO_CURRENT_PINNED_BATCH",
      "GKG_BODY_MISSING","GKG_BODY_OVERSIZE","GKG_ZIP_INVALID",
      "GKG_ZIP_CENTRAL_INVALID","GKG_ZIP_ENTRY_INVALID",
      "GKG_ZIP_DECOMPRESSION_FAILED","GKG_ZIP_SIZE_MISMATCH",
      "GKG_ARCHIVE_MD5_OR_SIZE_MISMATCH","GKG_ROWS_EXCEEDED","GKG_SUMMARY_INVALID",
      "GKG_MASTERFILE_RANGE_UNAVAILABLE","GKG_MASTERFILE_RANGE_INVALID"];
    const safe=allow.includes(reason)?reason:
      /^GKG_(?:MANIFEST|ARCHIVE)_HTTP_(?:4\d\d|5\d\d)$/u.test(reason)
      ?reason:"GKG_NETWORK_OR_FORMAT_UNAVAILABLE";
    return {schema:GDELT_GKG_BULK_SCHEMA,state:"GKG_BULK_DEGRADED",
      source:"gdelt_v2_gkg_static_15m_archive",checked_at:now.toISOString(),
      reason:safe,archive_integrity_verified:false,
      original_pubdate_verified:false,independent_event_verified:false,
      public_published:false,chargeable:false,
      supabase_requests:0,b2_requests:0,d1_writes:0,payments_performed:0};
  }
}
