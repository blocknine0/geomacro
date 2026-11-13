/** Shared, non-mocking production release primitives. Node 24+ --experimental-strip-types. */
import {createHash,createHmac,pbkdf2Sync,createPrivateKey,createPublicKey,sign as nodeSign,verify as nodeVerify,randomUUID} from 'node:crypto';
import {mkdirSync,writeFileSync,readFileSync} from 'node:fs';
import {dirname,resolve} from 'node:path';
import {execFileSync} from 'node:child_process';

export const ACCOUNT_RE=/^[a-f0-9]{32}$/i;
export const UUID_RE=/^[a-f0-9]{8}-(?:[a-f0-9]{4}-){3}[a-f0-9]{12}$/i;
export const SHA_RE=/^[a-f0-9]{64}$/i;
export const HOT50=Object.freeze('USA CHN IND RUS GBR DEU FRA JPN KOR BEL CAN AUS BRA MEX ITA ESP NLD CHE NOR SWE POL UKR TUR SAU ARE IRN ISR EGY QAT OMN IRQ ZAF NGA COD ZMB CHL PER ARG BOL IDN VNM THA MYS SGP PHL PAK BGD KAZ MNG MMR'.split(' '));
export const CATEGORIES=Object.freeze(['geopolitics','macro','critical_minerals']);
export const ORIGIN='https://geomacro-control-plane.daspallab202391.workers.dev';
export const WORKER='geomacro-control-plane';
export const D1_DAILY_READ_CEILING=580_000_000;
export const D1_DAILY_WRITE_CEILING=1_100_000;
export const D1_HOURLY_READ_CEILING=24_000_000;
export const D1_HOURLY_WRITE_CEILING=45_000;

export function need(condition:boolean,code:string):asserts condition {if(!condition)throw Error(code)}
export function envString(name:string,min=1):string {const value=process.env[name]??'';need(value.length>=min,`RELEASE_ENV_${name}_MISSING`);return value}
// This SHA-256 helper is for canonical content and envelope integrity only.
// Secret credentials must use a keyed HMAC/KDF, never this content digest.
export const canonicalContentSha256=(canonicalContent:string|Uint8Array):string=>
 createHash('sha256').update(canonicalContent).digest('hex');
// Cloudflare usage receipts can carry provider-derived credential taint in
// static analysis. Use an intentionally expensive deterministic PBKDF2-HMAC
// fingerprint for that evidence; never use bare SHA-256 for credentials.
export const providerUsagePbkdf2Sha256=(key:string|Uint8Array,canonicalUsage:string|Uint8Array):string=>
 pbkdf2Sync(Buffer.concat([Buffer.from(key),Buffer.from([0]),Buffer.from(canonicalUsage)]),
  Buffer.from("geomacro-provider-usage-fingerprint-v1"),310_000,32,"sha256").toString("hex");
function normalized(value:unknown,depth=0):unknown{
 need(depth<24,'RELEASE_CANONICAL_DEPTH');
 if(value===null||typeof value==='string'||typeof value==='boolean')return value;
 if(typeof value==='number'){need(Number.isFinite(value),'RELEASE_CANONICAL_NONFINITE');return value}
 if(Array.isArray(value))return value.map(v=>normalized(v,depth+1));
 need(typeof value==='object'&&value!==null&&Object.getPrototypeOf(value)===Object.prototype,'RELEASE_CANONICAL_INVALID');
 const out:Record<string,unknown>={};
 for(const k of Object.keys(value as Record<string,unknown>).sort()){
  need(!['__proto__','constructor','prototype'].includes(k),'RELEASE_CANONICAL_KEY');
  const v=(value as Record<string,unknown>)[k];need(v!==undefined,'RELEASE_CANONICAL_UNDEFINED');out[k]=normalized(v,depth+1);
 }return out;
}
export const canonical=(value:unknown):string=>JSON.stringify(normalized(value));
export function signEnvelope(payload:Record<string,unknown>){
 const raw=envString('SIGNING_JWK',40);let key:ReturnType<typeof createPrivateKey>;
 try{const jwk=JSON.parse(raw);need(jwk?.d&&['EC','OKP'].includes(jwk.kty),'RELEASE_SIGNING_PRIVATE_JWK_REQUIRED');key=createPrivateKey({key:jwk,format:'jwk'})}
 catch{throw Error('RELEASE_SIGNING_JWK_INVALID')}
 const alg=key.asymmetricKeyType==='ed25519'?'Ed25519':key.asymmetricKeyType==='ec'&&key.asymmetricKeyDetails?.namedCurve==='prime256v1'?'ES256':null;
 need(alg!==null,'RELEASE_SIGNING_ALG_UNSUPPORTED');
 const bytes=Buffer.from(canonical(payload));const signature=alg==='Ed25519'?nodeSign(null,bytes,key):nodeSign('sha256',bytes,{key,dsaEncoding:'ieee-p1363'});
 const publicSpki=createPublicKey(key).export({format:'der',type:'spki'});
 return {payload,attestation:{alg,key_spki_sha256:canonicalContentSha256(publicSpki),payload_sha256:canonicalContentSha256(bytes),signature_b64u:signature.toString('base64url'),created_at:new Date().toISOString(),scope:'INTEGRITY_ONLY_NOT_EXTERNAL_FACT_CERTIFICATION'}};
}
export function verifySignedEnvelopeFile(path:string):Record<string,unknown>{
 const wrapped=JSON.parse(readFileSync(path,'utf8'));
 const body=wrapped?.payload,sig=wrapped?.attestation;
 need(body?.status==='PASS'&&sig?.payload_sha256===canonicalContentSha256(canonical(body))&&
   typeof sig.signature_b64u==='string','RELEASE_SIGNED_RECEIPT_UNVERIFIED');
 const raw=envString('SIGNING_JWK',40);
 let secret:ReturnType<typeof createPrivateKey>;
 try{secret=createPrivateKey({key:JSON.parse(raw),format:'jwk'})}catch{throw Error('RELEASE_VERIFIER_JWK_INVALID')}
 const pub=createPublicKey(secret),spki=pub.export({format:'der',type:'spki'});
 const algorithm=pub.asymmetricKeyType==='ed25519'?'Ed25519':
  pub.asymmetricKeyType==='ec'&&pub.asymmetricKeyDetails?.namedCurve==='prime256v1'?'ES256':null;
 need(algorithm!==null&&sig.alg===algorithm&&sig.key_spki_sha256===canonicalContentSha256(spki),
  'RELEASE_RECEIPT_ISSUER_MISMATCH');
 const bytes=Buffer.from(canonical(body)),signature=Buffer.from(sig.signature_b64u,'base64url');
 const valid=algorithm==='Ed25519'?nodeVerify(null,bytes,pub,signature):
  nodeVerify('sha256',bytes,{key:pub,dsaEncoding:'ieee-p1363'},signature);
 need(valid,'RELEASE_RECEIPT_SIGNATURE_BAD');return body;
}
export function persist(path:string,value:unknown){const target=resolve(path);mkdirSync(dirname(target),{recursive:true,mode:0o700});writeFileSync(target,canonical(value)+'\n',{mode:0o600});return target}
export function signedReport(path:string,payload:Record<string,unknown>){return persist(path,signEnvelope(payload))}
export function assertOfficialMain():string{
 need(process.env.GITHUB_ACTIONS==='true'&&process.env.GITHUB_REPOSITORY==='blocknine0/geomacro'&&process.env.GITHUB_REF==='refs/heads/main','RELEASE_MAIN_PROTECTED_RUNNER_REQUIRED');
 const sha=envString('GITHUB_SHA',40);need(/^[a-f0-9]{40}$/.test(sha),'RELEASE_SHA_INVALID');
 const local=execFileSync('git',['rev-parse','HEAD'],{encoding:'utf8'}).trim();
 const remote=execFileSync('git',['ls-remote','https://github.com/blocknine0/geomacro.git','refs/heads/main'],{encoding:'utf8',timeout:15000}).trim().split(/\s+/)[0];
 need(sha===local&&sha===remote,'RELEASE_MAIN_MOVED');return sha;
}
export async function api(path:string,init:RequestInit={}):Promise<any>{
 const account=envString('CLOUDFLARE_ACCOUNT_ID',32);need(ACCOUNT_RE.test(account),'RELEASE_ACCOUNT_INVALID');
 const token=envString('CLOUDFLARE_API_TOKEN',20);
 need(path.startsWith('/')&&!path.includes('..'),'RELEASE_API_PATH');
 const r=await fetch(`https://api.cloudflare.com/client/v4/accounts/${account}${path}`,{
  ...init,redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
  headers:{Authorization:`Bearer ${token}`,Accept:'application/json',...(init.body?{'Content-Type':'application/json'}:{}),...(init.headers||{})}
 });
 const body=await r.json().catch(()=>null);
 need(r.ok&&!r.redirected&&body?.success===true&&body.result!=null,`RELEASE_PROVIDER_HTTP_${r.status}`);
 return body.result;
}
/**
 * Return a fixed diagnostic code for a Cloudflare GraphQL response. Never
 * emit provider error text: it may echo caller variables or account details.
 * For native Cloudflare Analytics API, built-in account/script scalars are
 * named "string" (lower-case), not standard GraphQL "String".
 */
/**
 * Classify only documented Cloudflare Analytics error *families*.
 * A provider error body can echo account tags, GraphQL variables or other
 * sensitive material; NEVER log its raw message or extensions.
 *
 * Do not turn a provider rejection into PASS or substitute sampled counts.
 * Unknown errors stay HOLD with the deliberately generic provider code.
 */
export function classifyGraphQLFailure(body:unknown):string{
 const value=body as {errors?:Array<{message?:unknown;extensions?:unknown}>}|null;
 const errors=value?.errors;
 if(!Array.isArray(errors)||errors.length===0)return 'RELEASE_GRAPHQL_RESPONSE_INVALID';
 const messages=errors.map(e=>typeof e?.message==='string'?e.message:'').join('\n');
 // Permission errors may not literally contain the word "permission".
 if(/unauthori[sz]ed|not authori[sz]ed for (?:that |this )?account|not entitled|does not have access|permission|forbidden|access denied|insufficient scope|not allowed|missing.*scope/iu.test(messages))
  return 'RELEASE_GRAPHQL_ACCESS_DENIED';
 if(/unknown type|unknown field|cannot query field|unknown argument|variable .* (?:type|used)|validation error|is not defined|expected type|error parsing args|scalar fields must have no selections|object field must have selections|query contains error/iu.test(messages))
  return 'RELEASE_GRAPHQL_SCHEMA_REJECTED';
 if(/cannot request data older|query time range is too large|retention (?:limit|period)|date range (?:too large|exceeded)|outside.*retention/iu.test(messages))
  return 'RELEASE_GRAPHQL_DATA_WINDOW_REJECTED';
 if(/rate.?limit|rate limiter budget depleted|too many requests|too many nodes|too many zones|too many accounts|query cost|resource exhausted|query consumed excessive resources|number of fields can't be more than|limit must be positive|limit .* greater than/iu.test(messages))
  return 'RELEASE_GRAPHQL_RATE_OR_COST_LIMIT';
 if(/unable to execute query|too many queries in progress|internal server error|temporarily unavailable|upstream database.*unavailable/iu.test(messages))
  return 'RELEASE_GRAPHQL_PROVIDER_UNAVAILABLE';
 return 'RELEASE_GRAPHQL_PROVIDER_ERRORS';
}
export type VerifiedGraphQLCredential='CLOUDFLARE_BILLING_READ_TOKEN'|'CLOUDFLARE_API_TOKEN';
export async function queryCloudflareAnalytics(
 query:string,variables:Record<string,unknown>,
 credential:VerifiedGraphQLCredential='CLOUDFLARE_BILLING_READ_TOKEN',
){
 // Explicitly limit the selectable credentials to two pre-existing, protected
 // production environment secrets. This is NOT a public bearer override.
 need(credential==='CLOUDFLARE_BILLING_READ_TOKEN'||credential==='CLOUDFLARE_API_TOKEN',
  'RELEASE_GRAPHQL_CREDENTIAL_NOT_ALLOWED');
 const token=envString(credential,20);
 const res=await fetch('https://api.cloudflare.com/client/v4/graphql',{
  method:'POST',redirect:'error',cache:'no-store',signal:AbortSignal.timeout(20000),
  headers:{Authorization:`Bearer ${token}`,'Content-Type':'application/json',Accept:'application/json'},
  body:JSON.stringify({query,variables})
 });const body=await res.json().catch(()=>null);
 if(Array.isArray(body?.errors)&&body.errors.length)throw Error(classifyGraphQLFailure(body));
 need(res.ok&&!res.redirected&&body?.data,`RELEASE_GRAPHQL_UNVERIFIED_${res.status}`);
 return body.data;
}
export async function queryD1(databaseId:string,sql:string):Promise<{rows:any[];meta:any}>{
 need(UUID_RE.test(databaseId),'RELEASE_D1_ID_INVALID');
 need(/^(SELECT|EXPLAIN|PRAGMA)\b/i.test(sql)&&!sql.includes(';'),'RELEASE_D1_READONLY_SQL_REQUIRED');
 const result=await api(`/d1/database/${databaseId}/query`,{method:'POST',body:JSON.stringify({sql,params:[]})});
 need(Array.isArray(result)&&result.length===1&&result[0].success===true&&Array.isArray(result[0].results)&&
  Number.isSafeInteger(result[0].meta?.rows_read)&&result[0].meta.rows_written===0,'RELEASE_D1_QUERY_RECEIPT_INVALID');
 return {rows:result[0].results,meta:result[0].meta};
}
export async function canonicalD1():Promise<{uuid:string;file_size:number}>{
 const databases=await api('/d1/database?per_page=100');
 need(Array.isArray(databases),'RELEASE_D1_LIST_INVALID');
 const matches=databases.filter((d:any)=>d.name==='geomacro-control-plane');
 need(matches.length===1&&UUID_RE.test(matches[0].uuid)&&Number.isSafeInteger(matches[0].file_size)&&matches[0].file_size>=0,'RELEASE_D1_BINDING_OR_STORAGE_UNVERIFIED');
 const info=await api(`/d1/database/${matches[0].uuid}`);
 need(info.uuid===matches[0].uuid&&info.version==='production','RELEASE_D1_PRODUCTION_UNKNOWN');
 return {uuid:info.uuid,file_size:matches[0].file_size};
}
export function freshUtcDay(day:string):boolean{return /^\d{4}-\d{2}-\d{2}$/.test(day)&&!Number.isNaN(Date.parse(day+'T00:00:00Z'))}
export function invocationId():string{return randomUUID()}
export function holdError(error:unknown):string {const x=error instanceof Error?error.message:'RELEASE_UNEXPECTED';return /^[A-Z][A-Z_0-9]{5,100}$/.test(x)?x:'RELEASE_OPERATION_FAILED'}
