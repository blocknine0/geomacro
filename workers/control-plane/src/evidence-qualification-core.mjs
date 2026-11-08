/*
 * Evidence Qualification Engine v1 - pure WebCrypto core shared by Workers
 * and Node contract tests. No producer-supplied PASS flag is authoritative.
 */
const te=new TextEncoder();
const HEX=/^[a-f0-9]{64}$/u;
const UTC=/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d(?:\.\d{1,3})?Z$/u;
const CHANNELS=new Set(['rss','google_news','telegram','official_state','private_osint']);
const CATEGORIES=new Set(['geopolitics','macro','rare_earth']);
const DEFICITS=Object.freeze({
 ORIGIN:'ORIGINAL_SOURCE_UNVERIFIED',TIME:'NATIVE_TIMESTAMP_UNVERIFIED',
 INTEGRITY:'ORIGINAL_CONTENT_UNVERIFIED',QUORUM:'INDEPENDENT_QUORUM_MISSING',
 RIGHTS:'COMMERCIAL_RIGHTS_UNVERIFIED',REVIEW:'TRUSTED_REVIEW_MISSING',
 DUPLICATE:'DUPLICATE_OR_NEAR_DUPLICATE',EXPIRED:'EVIDENCE_EXPIRED',
});
export {DEFICITS};
function error(code){throw Error('EQE_'+code);}
function validIso(s){return typeof s==='string'&&UTC.test(s)&&Number.isFinite(Date.parse(s))&&
  new Date(Date.parse(s)).toISOString().replace('.000Z','Z')===s.replace('.000Z','Z');}
function plain(v){return v!==null&&typeof v==='object'&&!Array.isArray(v)&&
  [null,Object.prototype].includes(Object.getPrototypeOf(v));}
function validString(s,max){return typeof s==='string'&&s.length>0&&s.length<=max;}
function noLoneSurrogate(s){return !/(?:[\uD800-\uDBFF](?![\uDC00-\uDFFF])|(?<![\uD800-\uDBFF])[\uDC00-\uDFFF])/u.test(s);}
export function canonicalJcs(value){
 const seen=new WeakSet();
 const visit=(v,depth)=>{
  if(depth>24)error('JCS_DEPTH');
  if(v===null)return 'null';
  if(typeof v==='string'){if(!noLoneSurrogate(v))error('JCS_INVALID_UNICODE');return JSON.stringify(v);}
  if(typeof v==='number'){if(!Number.isFinite(v))error('JCS_NUMBER');return JSON.stringify(v);}
  if(typeof v==='boolean')return v?'true':'false';
  if(!v||typeof v!=='object'||(!Array.isArray(v)&&!plain(v)))error('JCS_VALUE');
  if(seen.has(v))error('JCS_CYCLE');seen.add(v);
  const out=Array.isArray(v)?'['+v.map(x=>visit(x,depth+1)).join(',')+']':
   '{'+Object.keys(v).sort().map(k=>{
    if(['__proto__','constructor','prototype'].includes(k))error('JCS_UNSAFE_KEY');
    return visit(k,depth+1)+':'+visit(v[k],depth+1);
   }).join(',')+'}';
  seen.delete(v);return out;
 };
 return visit(value,0);
}
const asBytes=x=>typeof x==='string'?te.encode(x):x;
export async function sha256(x){return Array.from(new Uint8Array(await crypto.subtle.digest('SHA-256',asBytes(x))),
  b=>b.toString(16).padStart(2,'0')).join('');}
function b64decode(s){
 if(typeof s!=='string'||!/^(?:[A-Za-z0-9+/]{4})*(?:[A-Za-z0-9+/]{2}==|[A-Za-z0-9+/]{3}=)?$/u.test(s)||s.length<16)
  error('BASE64_INVALID');
 return Uint8Array.from(atob(s),c=>c.charCodeAt(0));
}
const b64encode=x=>btoa(String.fromCharCode(...new Uint8Array(x)));
function safeUrl(raw){
 if(!validString(raw,2048))return null;
 try{
  const url=new URL(raw);
  if(url.protocol!=='https:'||url.username||url.password||url.port||url.hash||
     !/^[a-z0-9.-]+\.[a-z]{2,24}$/u.test(url.hostname)||url.hostname.endsWith('.local'))
   return null;
  url.search='';url.hash='';
  return url.href;
 }catch{return null;}
}
const tokenize=s=>String(s).toLowerCase().normalize('NFKC').match(/[\p{L}\p{N}]{3,}/gu)??[];
export function simhash(text){
 const weight=Array(64).fill(0);
 for(const word of tokenize(text).slice(0,3000)){
  let x=0xcbf29ce484222325n;
  for(const char of word){x^=BigInt(char.codePointAt(0));x=BigInt.asUintN(64,x*0x100000001b3n);}
  for(let j=0;j<64;j++)weight[j]+=(x>>BigInt(j))&1n?1:-1;
 }
 let bits=0n;for(let j=0;j<64;j++)if(weight[j]>0)bits|=1n<<BigInt(j);
 return bits.toString(16).padStart(16,'0');
}
export function simhashDistance(a,b){
 if(!/^[0-9a-f]{16}$/u.test(a)||!/^[0-9a-f]{16}$/u.test(b))error('SIMHASH_INVALID');
 let x=BigInt('0x'+a)^BigInt('0x'+b),n=0;while(x){n++;x&=x-1n;}return n;
}
export async function normalizeUnqualifiedEvidence(raw){
 if(!plain(raw)||!CHANNELS.has(raw.channel)||!CATEGORIES.has(raw.category)||
    !/^[A-Z]{3}$/u.test(raw.country_iso3??'')||!validString(raw.title,300)||
    typeof raw.body!=='string'||raw.body.length>16384||!validIso(raw.observed_at))
  error('INGEST_INPUT_INVALID');
 const article_url=safeUrl(raw.article_url);
 if(!article_url)error('INGEST_URL_INVALID');
 const content_sha256=await sha256(te.encode(raw.body));
 const item={
  schema:'geomacro.unqualified-evidence.v1',channel:raw.channel,
  category:raw.category,country_iso3:raw.country_iso3,
  article_url,title:raw.title,body:raw.body,content_sha256,
  narrative_simhash:simhash(raw.title+' '+raw.body),
  observed_at:raw.observed_at,
  claimed_published_at:validIso(raw.claimed_published_at)?raw.claimed_published_at:null,
  suggested_origin_url:safeUrl(raw.canonical_url??''),
 };
 const id=await sha256(canonicalJcs({article_url,content_sha256,category:item.category}));
 return Object.freeze({id,...item});
}
async function verifyDetached(payload,signature,publicSpkiB64){
 try{
  const key=await crypto.subtle.importKey('spki',b64decode(publicSpkiB64),{name:'Ed25519'},false,['verify']);
  return await crypto.subtle.verify('Ed25519',key,b64decode(signature),te.encode(canonicalJcs(payload)));
 }catch{return false;}
}
const isSha=s=>typeof s==='string'&&HEX.test(s);
function independentCorroboration(proof){
 if(!Array.isArray(proof?.confirmations)||proof.confirmations.length<2||proof.confirmations.length>8)return false;
 const domains=new Set(),families=new Set(),hashes=new Set();
 for(const c of proof.confirmations){
  if(!plain(c)||c.same_event_claim_sha256!==proof.same_event_claim_sha256||
     !validString(c.originating_org,96)||!isSha(c.original_content_sha256)||
     c.independently_authored!==true||c.syndicated_from!==null||
     !validIso(c.published_at)||!safeUrl(c.url))return false;
  const u=new URL(c.url);domains.add(u.hostname);families.add(c.originating_org);
  hashes.add(c.original_content_sha256);
 }
 const times=proof.confirmations.map(c=>Date.parse(c.published_at));
 return domains.size>=2&&families.size>=2&&hashes.size>=2&&
   Math.max(...times)-Math.min(...times)<=90*60*1000;
}
export async function analyzeDeficits(item,attestation,{
  reviewerPublicSpkiB64,approvedOrigins={},now=Date.now(),nearDuplicates=[],
}={}){
 const reasons=new Set();
 if(!item||item.schema!=='geomacro.unqualified-evidence.v1'||!isSha(item.id)||
    !isSha(item.content_sha256)||await sha256(item.body)!==item.content_sha256)
  error('ITEM_INTEGRITY_INVALID');
 if(!plain(attestation)||!plain(attestation.proof)||
   !(await verifyDetached(attestation.proof,attestation.signature_base64,reviewerPublicSpkiB64)))
  return {state:'QUARANTINED',deficits:[DEFICITS.REVIEW],qualified:false};
 const p=attestation.proof;
 if(p.item_id!==item.id||p.original_content_sha256!==item.content_sha256||
    !isSha(p.same_event_claim_sha256)||p.original_content_verified!==true)
  reasons.add(DEFICITS.INTEGRITY);
 const original=safeUrl(p.original_url);
 const origin=original?new URL(original):null;
 const registered=origin?approvedOrigins[origin.hostname]:null;
 if(!original||!registered||registered.organization_id!==p.originating_org||
    p.original_publisher_verified!==true||
    p.original_url!==original||!validString(p.originating_org,96))
  reasons.add(DEFICITS.ORIGIN);
 const t=Date.parse(p.original_published_at),signedAt=Date.parse(p.reviewed_at);
 if(!validIso(p.original_published_at)||!validIso(p.reviewed_at)||
    !validIso(p.proof_expires_at)||t>now+5*60000||t<now-6*3600000||
    signedAt<t||signedAt>now+5*60000||Date.parse(p.proof_expires_at)<=now||
    (item.claimed_published_at!==null&&Math.abs(t-Date.parse(item.claimed_published_at))>5*60000)||
    p.native_publication_metadata_verified!==true)
  reasons.add(DEFICITS.TIME);
 if(!independentCorroboration(p))reasons.add(DEFICITS.QUORUM);
 if(p.commercial_derived_use_rights_verified!==true||!isSha(p.rights_receipt_sha256)||
    !validString(p.rights_license_id,160)||p.rights_license_id==='unknown')
  reasons.add(DEFICITS.RIGHTS);
 if(nearDuplicates.some(x=>x!==item.id&&
     typeof x==='object'&&x.id!==item.id&&
     simhashDistance(item.narrative_simhash,x.narrative_simhash)<=3))
  reasons.add(DEFICITS.DUPLICATE);
 return {state:reasons.size?'QUARANTINED':'QUALIFIED',
  deficits:[...reasons].sort(),qualified:reasons.size===0};
}
export async function signEvidence(item,attestation,{privatePkcs8B64,publicSpkiB64,keyId,now=Date.now()}={}){
 if(!validString(keyId,128))error('SIGNER_KEY_ID_REQUIRED');
 const payload={schema:'geomacro.qualified-evidence.v1',item,review:attestation.proof,
  review_signature_base64:attestation.signature_base64};
 const canonical=canonicalJcs(payload),digest=await sha256(canonical);
 const key=await crypto.subtle.importKey('pkcs8',b64decode(privatePkcs8B64),{name:'Ed25519'},false,['sign']);
 const signature=b64encode(await crypto.subtle.sign('Ed25519',key,te.encode(canonical)));
 const signed_at=new Date(now).toISOString(),expires_at=attestation.proof.proof_expires_at;
 const envelope={payload,integrity:{key_id:keyId,algorithm:'Ed25519',canonicalization:'RFC8785-JCS',
  sha256_checksum:digest,signature_base64:signature,signed_at,expires_at}};
 if(!(await verifyEvidence(envelope,{[keyId]:publicSpkiB64},now)))error('SIGNATURE_SELF_VERIFY_FAILED');
 return envelope;
}
export async function verifyEvidence(envelope,publicKeys,now=Date.now()){
 try{
  if(!plain(envelope)||!plain(envelope.payload)||!plain(envelope.integrity)||
     envelope.payload.schema!=='geomacro.qualified-evidence.v1')return false;
  const i=envelope.integrity,pub=publicKeys?.[i.key_id];
  if(i.algorithm!=='Ed25519'||i.canonicalization!=='RFC8785-JCS'||!pub||
     !isSha(i.sha256_checksum)||!validIso(i.signed_at)||!validIso(i.expires_at)||
     Date.parse(i.signed_at)>now+5*60000||Date.parse(i.expires_at)<=now)return false;
  const canonical=canonicalJcs(envelope.payload);
  return await sha256(canonical)===i.sha256_checksum&&
    await verifyDetached(envelope.payload,i.signature_base64,pub);
 }catch{return false;}
}
