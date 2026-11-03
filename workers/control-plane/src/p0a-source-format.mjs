/**
 * P0-A private source format normalizer. Source-specific and bounded.
 * Publication times come only from source ITEM metadata, never fetch time.
 * ZIP is accepted only inside CSV_STREAM (the SourceConfig enum is unchanged).
 */
export const P0A_MAX_COMPRESSED_BYTES=8*1024*1024;
export const P0A_MAX_UNCOMPRESSED_BYTES=24*1024*1024;
const TYPES=new Set(['RSS_2','ATOM','RDF','JSON_REST','CSV_STREAM','HTML_BOUNDED']);
const enc=new TextEncoder(),dec=new TextDecoder('utf-8',{fatal:true});
const utf8=s=>enc.encode(s).byteLength;
const plain=s=>String(s??'').replace(/<!\[CDATA\[([\s\S]*?)\]\]>/giu,'$1')
 .replace(/<[^>]*>/gu,' ').replace(/&#(\d+);/gu,(_,x)=>String.fromCodePoint(Math.min(0x10ffff,Number(x))))
 .replace(/&(amp|lt|gt|quot|apos|nbsp);/giu,(_,x)=>({amp:'&',lt:'<',gt:'>',quot:'"',apos:"'",nbsp:' '}[x.toLowerCase()]))
 .replace(/\s+/gu,' ').trim();
const tag=(xml,name)=>xml.match(new RegExp('<(?:[a-z][\\w.-]*:)?'+name+'(?:\\s[^>]*)?>([\\s\\S]*?)<\\/(?:[a-z][\\w.-]*:)?'+name+'>','iu'))?.[1]??'';
const attr=(html,key)=>html.match(new RegExp('\\b'+key+'\\s*=\\s*["\\x27]([^"\\x27]+)["\\x27]','iu'))?.[1]??null;
const link=value=>{
 try{const u=new URL(value);return u.protocol==='https:'&&!u.username&&!u.password&&!u.port&&
  u.hostname.includes('.')&&!u.hostname.endsWith('.internal')&&!u.hostname.endsWith('.local')&&
  u.href.length<=2048?u.href:null;}catch{return null}
};
const date=value=>{
 if(typeof value!=='string'||value.length>100||/^\d{4}-\d{2}-\d{2}$/u.test(value))return null;
 const t=Date.parse(value);
 return Number.isFinite(t)&&t<=Date.now()+300000?new Date(t).toISOString():null;
};
function record(title,clock,url,recordId=null){
 const clean=plain(title).slice(0,250);
 if(!clean&&!(typeof recordId==='string'&&recordId.length))return null;
 return {title:clean||null,native_published_at:date(clock),original_url:link(url),source_record_id:recordId?String(recordId).slice(0,180):null};
}
function parseXml(parser,text){
 if(/<!DOCTYPE\b|<!ENTITY\b/iu.test(text))throw Error('P0A_XML_DTD_REFUSED');
 const xml=text.replace(/^\uFEFF/u,'').trimStart();
 const root=parser==='RSS_2'?/<rss(?:\s|>)/iu:parser==='ATOM'?/<(?:[a-z][\w.-]*:)?feed(?:\s|>)/iu:/<rdf:RDF(?:\s|>)/iu;
 if(!root.test(xml.slice(0,1500)))throw Error('P0A_XML_ROOT_MISMATCH');
 const itemTag=parser==='ATOM'?'entry':'item';
 const re=new RegExp('<(?:[a-z][\\w.-]*:)?'+itemTag+'\\b[^>]*>[\\s\\S]*?<\\/(?:[a-z][\\w.-]*:)?'+itemTag+'>','giu');
 const out=[];
 for(const match of xml.matchAll(re)){
  const item=match[0],title=tag(item,'title');
  const atomHref=item.match(/<link\b[^>]*\bhref\s*=\s*["']([^"']+)["'][^>]*\/?>/iu)?.[1];
  const clock=parser==='RSS_2'?tag(item,'pubDate'):
    parser==='ATOM'?tag(item,'published'):
    /xmlns:dc=["']http:\/\/purl.org\/dc\/elements\/1\.1\/["']/iu.test(xml.slice(0,2500))?tag(item,'date'):'';
  const row=record(title,clock,atomHref??plain(tag(item,'link')),plain(tag(item,'guid')||tag(item,'id')));
  if(row)out.push(row);
  if(out.length>2000)throw Error('P0A_XML_RESULT_OVERFLOW');
 }
 return out;
}
function jsonRows(data){
 if(Array.isArray(data))return data;
 for(const key of ['results','items','articles','data','reports','records'])
  if(Array.isArray(data?.[key]))return data[key];
 return null;
}
function parseJson(text){
 const rows=jsonRows(JSON.parse(text));
 if(!rows)throw Error('P0A_JSON_ITEMS_MISSING');
 if(rows.length>5000)throw Error('P0A_JSON_RESULT_OVERFLOW');
 return rows.map(row=>record(row?.title??row?.headline??row?.name,
   row?.date?.original??row?.published_at??row?.publishedAt??row?.pubDate??
    row?.date_published??row?.public_timestamp,
   row?.url??row?.link??row?.canonical_url??row?.permalink,
   row?.id??row?.guid??null)).filter(Boolean);
}
function csvGrid(text,delimiter){
 const rows=[],current=[];let value='',quoted=false;
 for(let i=0;i<text.length;i++){
  const c=text[i];
  if(c==='"'){
   if(quoted&&text[i+1]==='"'){value+='"';i++}else quoted=!quoted;
  }else if(!quoted&&(c===delimiter||c==='\n'||c==='\r')){
   if(c===delimiter){current.push(value);value='';continue}
   if(c==='\r'&&text[i+1]==='\n')i++;
   current.push(value);value='';
   if(current.some(x=>x.trim()))rows.push([...current]);
   current.length=0;
   if(rows.length>10000)throw Error('P0A_CSV_ROWS_OVERFLOW');
  }else value+=c;
 }
 if(quoted)throw Error('P0A_CSV_UNBALANCED_QUOTES');
 if(value||current.length){current.push(value);rows.push([...current])}
 return rows;
}
function parseCsv(text){
 const first=text.slice(0,1000),delimiter=(first.match(/\t/gu)??[]).length>(first.match(/,/gu)??[]).length?'\t':',';
 const rows=csvGrid(text.replace(/^\uFEFF/u,''),delimiter);
 if(!rows.length)return [];
 const lower=rows[0].map(x=>x.trim().toLowerCase().replace(/[\s-]/gu,'_'));
 const idx=(...keys)=>keys.map(k=>lower.indexOf(k)).find(x=>x>=0)??-1;
 const titleAt=idx('title','headline','name'),timeAt=idx('published_at','published','pubdate','date_published','original_date'),
  linkAt=idx('url','link','sourceurl','source_url'),idAt=idx('id','guid','record_id','globaleventid');
 if(titleAt>=0){
  return rows.slice(1).map(row=>record(row[titleAt],row[timeAt],row[linkAt],row[idAt])).filter(Boolean);
 }
 // Raw GDELT event ZIP is a headerless tab-separated 58+ column event table.
 // SQLDATE (YYYYMMDD) is a calendar DATE, never a verified publication clock.
 if(delimiter==='\t'&&rows[0].length>=58){
  return rows.map(row=>record(null,null,row[57],row[0])).filter(x=>x?.source_record_id);
 }
 throw Error('P0A_CSV_COLUMNS_UNRECOGNIZED');
}
function parseHtml(text){
 if(/<!DOCTYPE\s+[^>]*\[/iu.test(text)||/<!ENTITY\b/iu.test(text))throw Error('P0A_HTML_ENTITY_REFUSED');
 const out=[],re=/<article\b[^>]*>[\s\S]*?<\/article>/giu;
 for(const match of text.matchAll(re)){
  const article=match[0];
  const anchor=article.match(/<a\b[^>]*href\s*=\s*["']([^"']+)["'][^>]*>([\s\S]*?)<\/a>/iu);
  const time=article.match(/<time\b[^>]*>/iu)?.[0]??'';
  const stamp=attr(time,'datetime')??plain(tag(article,'time'));
  const row=record(anchor?.[2]??tag(article,'h2')??tag(article,'h3'),stamp,anchor?.[1]);
  if(row)out.push(row);
  if(out.length>500)throw Error('P0A_HTML_RESULT_OVERFLOW');
 }
 return out;
}
function crc32(bytes){
 let crc=-1;
 for(const b of bytes){crc^=b;for(let k=0;k<8;k++)crc=crc&1?(crc>>>1)^0xedb88320:crc>>>1;}
 return (crc^(-1))>>>0;
}
async function inflateZip(bytes){
 const view=new DataView(bytes.buffer,bytes.byteOffset,bytes.byteLength);
 let eocd=-1;
 for(let i=bytes.length-22;i>=Math.max(0,bytes.length-65557);i--)
  if(view.getUint32(i,true)===0x06054b50){eocd=i;break}
 if(eocd<0)throw Error('P0A_ZIP_CENTRAL_DIRECTORY_MISSING');
 const entries=view.getUint16(eocd+10,true),directory=view.getUint32(eocd+16,true);
 if(entries!==1)throw Error('P0A_ZIP_SINGLE_CSV_REQUIRED');
 if(directory+46>bytes.length||view.getUint32(directory,true)!==0x02014b50)
  throw Error('P0A_ZIP_CENTRAL_DIRECTORY_INVALID');
 const flags=view.getUint16(directory+8,true),method=view.getUint16(directory+10,true);
 const expectedCrc=view.getUint32(directory+16,true),compressed=view.getUint32(directory+20,true),
  uncompressed=view.getUint32(directory+24,true),nameLen=view.getUint16(directory+28,true),
  local=view.getUint32(directory+42,true);
 if(flags&1||![0,8].includes(method)||compressed>P0A_MAX_COMPRESSED_BYTES||
    uncompressed>P0A_MAX_UNCOMPRESSED_BYTES||local+30>bytes.length||
    view.getUint32(local,true)!==0x04034b50)
  throw Error('P0A_ZIP_ENTRY_UNSUPPORTED');
 const filename=dec.decode(bytes.slice(directory+46,directory+46+nameLen));
 if(!/\.(?:csv|tsv|txt)$/iu.test(filename))throw Error('P0A_ZIP_CSV_ONLY');
 const start=local+30+view.getUint16(local+26,true)+view.getUint16(local+28,true);
 if(start+compressed>bytes.length)throw Error('P0A_ZIP_TRUNCATED');
 const packed=bytes.slice(start,start+compressed);
 const unpacked=method===0?packed:new Uint8Array(await new Response(
  new Blob([packed]).stream().pipeThrough(new DecompressionStream('deflate-raw'))).arrayBuffer());
 if(unpacked.length!==uncompressed||unpacked.length>P0A_MAX_UNCOMPRESSED_BYTES||
    crc32(unpacked)!==expectedCrc)throw Error('P0A_ZIP_CHECKSUM_INVALID');
 return dec.decode(unpacked);
}
export async function normalizeP0aPayload(parserType,bytes){
 if(!TYPES.has(parserType)||!(bytes instanceof Uint8Array)||!bytes.length||
    bytes.length>P0A_MAX_COMPRESSED_BYTES)throw Error('P0A_FORMAT_INPUT_INVALID');
 const zipped=parserType==='CSV_STREAM'&&bytes.length>4&&bytes[0]===0x50&&bytes[1]===0x4b;
 const text=zipped?await inflateZip(bytes):dec.decode(bytes);
 if(utf8(text)>P0A_MAX_UNCOMPRESSED_BYTES)throw Error('P0A_FORMAT_BODY_TOO_LARGE');
 const rows=parserType==='RSS_2'||parserType==='ATOM'||parserType==='RDF'?parseXml(parserType,text):
    parserType==='JSON_REST'?parseJson(text):
    parserType==='CSV_STREAM'?parseCsv(text):parseHtml(text);
 return rows;
}
