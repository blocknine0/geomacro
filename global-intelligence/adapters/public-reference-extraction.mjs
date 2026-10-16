/*
 * Source-native reference observations for the public-transport production lane.
 * Research/context only. No scoring, original-news qualification, D1/B2 writes,
 * issuer signing, raw customer exposure, commercial rights elevation or funds.
 */
const ROOTS=Object.freeze({
  ecb:"https://data-api.ecb.europa.eu/service/data/EXR/D.USD.EUR.SP00.A?startPeriod=2026-01-01&format=csvdata",
  bis:"https://stats.bis.org/api/v2/data/dataflow/BIS/WS_CBPOL/1.0/M.US?format=csvfile",
  eurostat:"https://ec.europa.eu/eurostat/api/dissemination/statistics/1.0/data/namq_10_gdp?geo=DE&na_item=B1GQ&unit=CP_MEUR&s_adj=NSA&freq=Q&sinceTimePeriod=2025",
  bls:"https://api.bls.gov/publicAPI/v1/timeseries/data/CUUR0000SA0",
  sec_edgar:"https://data.sec.gov/submissions/CIK0000320193.json",
  gdacs:"https://www.gdacs.org/gdacsapi/api/events/geteventlist/SEARCH?eventlist=EQ&fromdate=2026-01-01&todate=2026-12-31",
  swpc:"https://services.swpc.noaa.gov/products/summary/solar-wind-speed.json",
});
export const REFERENCE_READER_IDS=Object.freeze(Object.keys(ROOTS));
const MAX_BYTES=1024*1024;
function presentNumber(v){
  if(v===null||v===undefined||v==="")return null;
  const n=Number(v);
  return Number.isFinite(n)?n:null;
}
function datePeriod(p){
  if(!/^(?:19|20)\d{2}(?:-(?:0[1-9]|1[0-2])(?:-(?:0[1-9]|[12]\d|3[01]))?)?$/.test(String(p)))return null;
  return String(p);
}
function entry(id,{country_iso3=null,reference_period=null,unit=null,value=null,source_record_count=1,original_publication_at=null,kind="STATISTICAL_REFERENCE",extra=null}={}){
  return {
    source_id:id,country_iso3,reference_period,unit,value,source_record_count,
    original_publication_at,kind,
    ...(extra?{extra}:{}),
    eligible_for_signed_current_news:false,
    commercial_rights_certified:false,
    native_original_publication_proven:false,
  };
}
export function parseCsvRecords(body){
  if(typeof body!=="string"||body.length>MAX_BYTES)throw Error("REFERENCE_CSV_SIZE_INVALID");
  const lines=[];let row=[],field="",quoted=false;
  for(let i=0;i<body.length;i++){
    const ch=body[i];
    if(ch==='"'){
      if(quoted&&body[i+1]==='"'){field+='"';i++;}
      else quoted=!quoted;
    }else if(ch===","&&!quoted){row.push(field);field="";}
    else if((ch==="\n"||ch==="\r")&&!quoted){
      if(ch==="\r"&&body[i+1]==="\n")i++;
      row.push(field);if(row.some(x=>x!==""))lines.push(row);
      row=[];field="";
      if(lines.length>10000)throw Error("REFERENCE_CSV_ROWS_LIMIT");
    }else field+=ch;
  }
  if(quoted)throw Error("REFERENCE_CSV_QUOTES_INVALID");
  row.push(field);if(row.some(x=>x!==""))lines.push(row);
  if(lines.length<2)throw Error("REFERENCE_CSV_EMPTY");
  const headers=lines.shift().map(x=>x.trim().replace(/^\uFEFF/,""));
  if(new Set(headers).size!==headers.length)throw Error("REFERENCE_CSV_HEADERS_DUPLICATED");
  return lines.map(columns=>{
    if(columns.length!==headers.length)throw Error("REFERENCE_CSV_COLUMNS_INVALID");
    return Object.fromEntries(headers.map((h,i)=>[h,columns[i]]));
  });
}
function newest(rows,periodFn){
  return rows.filter(x=>periodFn(x)).sort((a,b)=>
    String(periodFn(b)).localeCompare(String(periodFn(a))))[0]??null;
}
export function extractPublicReference(id,payload){
  if(!REFERENCE_READER_IDS.includes(id))throw Error("REFERENCE_SOURCE_NOT_APPROVED");
  if(id==="ecb"||id==="bis"){
    const rows=parseCsvRecords(payload);
    const row=newest(rows,r=>datePeriod(r.TIME_PERIOD)&&presentNumber(r.OBS_VALUE)!==null?r.TIME_PERIOD:null);
    if(!row)throw Error("REFERENCE_OBSERVATION_MISSING");
    const units=id==="ecb"?"USD per EUR":"percent";
    if(id==="ecb"&&row.CURRENCY&&row.CURRENCY!=="USD")throw Error("REFERENCE_CURRENCY_MISMATCH");
    return entry(id,{country_iso3:id==="bis"?"USA":null,
      reference_period:row.TIME_PERIOD,value:presentNumber(row.OBS_VALUE),
      unit:units,source_record_count:rows.length,
      kind:id==="bis"?"CENTRAL_BANK_POLICY_SERIES":"FX_REFERENCE_SERIES"});
  }
  if(id==="eurostat"){
    const x=payload;
    if(!x||!Array.isArray(x.id)||!Array.isArray(x.size)||
       x.id.length!==x.size.length||!x.id.includes("time")||
       !x.id.includes("geo")||!x.value||typeof x.value!=="object"||
       x.size.some(n=>!Number.isSafeInteger(n)||n<1)||
       x.size.reduce((a,b)=>a*b,1)>10000)
      throw Error("EUROSTAT_JSONSTAT_INVALID");
    // Even when the upstream API ignores a dimension filter, select only
    // the exact fully pinned intersection; never aggregate across axes.
    const expected={geo:"DE",freq:"Q",s_adj:"NSA",na_item:"B1GQ",unit:"CP_MEUR"};
    function codeIndex(axis,code){
      const index=x.dimension?.[axis]?.category?.index;
      if(Array.isArray(index))return index.indexOf(code);
      if(index&&typeof index==="object"&&Number.isSafeInteger(index[code]))
        return index[code];
      return -1;
    }
    const selected=x.id.map((axis,i)=>{
      if(axis==="time")return null;
      if(Object.prototype.hasOwnProperty.call(expected,axis)){
        const at=codeIndex(axis,expected[axis]);
        if(at<0||at>=x.size[i])throw Error("EUROSTAT_EXACT_DIMENSION_MISSING");
        return at;
      }
      if(x.size[i]!==1)throw Error("EUROSTAT_MIXED_SCOPE");
      return 0;
    });
    const periodIndex=x.dimension?.time?.category?.index;
    if(!periodIndex)throw Error("EUROSTAT_JSONSTAT_INVALID");
    const times=Array.isArray(periodIndex)?periodIndex.map((k,i)=>[k,i]):
      Object.entries(periodIndex);
    const observations=[];
    for(const [label,at] of times){
      const period=String(label);
      if(!/^(?:19|20)\d{2}-Q[1-4]$/.test(period)||
         !Number.isSafeInteger(at)||at<0||
         at>=x.size[x.id.indexOf("time")])continue;
      let flat=0;
      for(let j=0;j<x.id.length;j++)
        flat=flat*x.size[j]+(x.id[j]==="time"?at:selected[j]);
      const value=presentNumber(x.value[String(flat)]);
      if(value!==null)observations.push({period,value});
    }
    observations.sort((a,b)=>b.period.localeCompare(a.period));
    if(!observations.length)throw Error("EUROSTAT_OBSERVATION_MISSING");
    return entry(id,{country_iso3:"DEU",reference_period:observations[0].period,
      value:observations[0].value,unit:"million EUR current prices",
      source_record_count:observations.length,kind:"QUARTERLY_GDP_REFERENCE"});
  }
  if(id==="bls"){
    const s=payload?.Results?.series?.[0];
    if(payload?.status!=="REQUEST_SUCCEEDED"||!Array.isArray(s?.data))
      throw Error("BLS_DATA_SHAPE_INVALID");
    const rows=s.data.filter(x=>/^(?:19|20)\d{2}$/.test(String(x.year))&&
      /^M(?:0[1-9]|1[0-2])$/.test(String(x.period))&&presentNumber(x.value)!==null);
    rows.sort((a,b)=>(b.year+b.period).localeCompare(a.year+a.period));
    if(!rows.length)throw Error("BLS_REFERENCE_MISSING");
    return entry(id,{country_iso3:"USA",reference_period:rows[0].year+"-"+rows[0].period.slice(1),
      unit:"CPI index (not percent)",value:presentNumber(rows[0].value),
      source_record_count:rows.length,kind:"PRICE_INDEX_REFERENCE"});
  }
  if(id==="sec_edgar"){
    const r=payload?.filings?.recent;
    if(!Array.isArray(r?.form)||!Array.isArray(r?.accessionNumber)||!Array.isArray(r?.filingDate))
      throw Error("SEC_FILINGS_SHAPE_INVALID");
    const rows=r.form.map((form,i)=>({form,date:r.filingDate[i],
      accession:r.accessionNumber[i],document:r.primaryDocument?.[i]}))
      .filter(x=>/^(?:10-K|10-Q|8-K)$/.test(String(x.form))&&datePeriod(x.date)&&
        /^\d{10}-\d{2}-\d{6}$/.test(String(x.accession)));
    rows.sort((a,b)=>String(b.date).localeCompare(String(a.date)));
    if(!rows.length)throw Error("SEC_RELEVANT_FILING_ABSENT");
    return entry(id,{country_iso3:null,reference_period:rows[0].date,
      unit:"filing",value:null,source_record_count:rows.length,
      kind:"FILING_INDEX_NOT_ORIGINAL_FILING",
      extra:{issuer_cik:"0000320193",form:rows[0].form,original_document_retrieved:false}});
  }
  if(id==="gdacs"){
    const features=payload?.features??payload?.events;
    if(!Array.isArray(features))throw Error("GDACS_EVENT_COLLECTION_INVALID");
    const valid=features.filter(x=>x&&typeof x==="object"&&x.properties&&
      (x.geometry?.type||x.properties?.eventtype));
    // A global disaster index does not prove the country of impact.
    return entry(id,{country_iso3:null,reference_period:null,
      unit:"disaster event",value:null,source_record_count:valid.length,
      kind:"HAZARD_DISCOVERY_NOT_COUNTRY_VERIFIED",
      extra:{affected_country_verified:false}});
  }
  if(id==="swpc"){
    const rows=Array.isArray(payload)?payload:[payload];
    if(!rows.length||!rows.some(x=>x&&typeof x==="object"))throw Error("SWPC_DATA_SHAPE_INVALID");
    return entry(id,{country_iso3:null,reference_period:null,
      unit:"space weather observation",value:null,source_record_count:rows.length,
      kind:"SPACE_WEATHER_NOT_COUNTRY_EVENT"});
  }
  throw Error("REFERENCE_SOURCE_NOT_APPROVED");
}
async function readBounded(url,fetchImpl){
  const res=await fetchImpl(url,{
    method:"GET",redirect:"error",signal:AbortSignal.timeout(12000),
    headers:{"accept":"application/json,text/csv,text/plain,*/*",
      "user-agent":"Geomacro-Reference-Probe/1.0 contact@geomacro.live"}
  });
  if(!res.ok){await res.body?.cancel().catch(()=>{});throw Error("REFERENCE_HTTP_"+res.status);}
  if(!res.body||Number(res.headers.get("content-length")??0)>MAX_BYTES)
    throw Error("REFERENCE_RESPONSE_TOO_LARGE");
  const reader=res.body.getReader(),parts=[];let size=0;
  try{
    for(;;){
      const {done,value}=await reader.read();if(done)break;
      size+=value.byteLength;if(size>MAX_BYTES)throw Error("REFERENCE_RESPONSE_TOO_LARGE");
      parts.push(value);
    }
  }finally{await reader.cancel().catch(()=>{});reader.releaseLock();}
  const output=new Uint8Array(size);let n=0;for(const p of parts){output.set(p,n);n+=p.byteLength;}
  return new TextDecoder("utf-8",{fatal:true}).decode(output);
}
export async function readPublicReference(id,{fetchImpl=fetch}={}){
  const url=ROOTS[id];
  if(!url)throw Error("REFERENCE_SOURCE_NOT_APPROVED");
  const body=await readBounded(url,fetchImpl);
  let x=body;
  if(!["ecb","bis"].includes(id)){
    try{x=JSON.parse(body);}catch{throw Error("REFERENCE_INVALID_JSON");}
  }
  return extractPublicReference(id,x);
}
export async function publicReferenceReceipt({read=readPublicReference,now=()=>new Date()}={}){
  const results=[];
  for(const id of REFERENCE_READER_IDS){
    try{
      const row=await read(id);
      if(row?.source_id!==id||row?.commercial_rights_certified!==false||
         row?.eligible_for_signed_current_news!==false)throw Error("REFERENCE_CONTRACT_INVALID");
      results.push({id,state:"EXACT_REFERENCE_EXTRACTED",
        reference_period:row.reference_period,
        country_iso3:row.country_iso3,kind:row.kind,
        extracted_records:row.source_record_count,
        release_time_verified:false,commercial_paid_eligible:false});
    }catch(e){
      const m=String(e?.message??"");
      const known=/^(?:REFERENCE_|EUROSTAT_|BLS_|SEC_|GDACS_|SWPC_)/.test(m);
      results.push({id,state:"EXTRACTION_UNVERIFIED",
        reason:known?m.replace(/[^A-Z0-9_]/g,"").slice(0,90):"NETWORK_OR_SOURCE_SHAPE_ERROR",
        commercial_paid_eligible:false});
    }
  }
  return {schema:"geomacro.public-reference-extraction.v1",
    checked_at:now().toISOString(),source_count:REFERENCE_READER_IDS.length,
    extracted:results.filter(x=>x.state==="EXACT_REFERENCE_EXTRACTED").length,
    failed:results.filter(x=>x.state!=="EXACT_REFERENCE_EXTRACTED").length,
    results,signed_current_publications:0,commercial_paid_eligible:false,
    raw_payload_persisted:false,supabase_requests:0,d1_writes:0,b2_requests:0,payments:0};
}
