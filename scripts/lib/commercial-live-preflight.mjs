/**
 * Fail-closed, read-only production acceptance. No payment, B2, D1 or Supabase writes.
 * A green result is NOT authorization to settle real money or deliver paid data.
 */
const SHA=/^[a-f0-9]{40}$/;
const HOT=['intelligence','global_risk','risk_indices'];
const obj=x=>x&&typeof x==='object'&&!Array.isArray(x)?x:null;
const status=x=>Number.isInteger(x?.status)&&x.status>=0&&x.status<=599?x.status:0;
export function assessLiveNoFundsReadiness({canonicalSha,build,health,discovery,availability,observedAt=new Date().toISOString()}={}){
 if(typeof canonicalSha!=='string'||!SHA.test(canonicalSha))throw Error('LIVE_PREFLIGHT_EXPECTED_SHA_REQUIRED');
 const marker=obj(build?.body),h=obj(health?.body),disc=obj(discovery?.body),avail=obj(availability?.body);
 const bStatus=status(build),hStatus=status(health),dStatus=status(discovery),aStatus=status(availability);
 const deployed=bStatus===200&&marker?.schema_version==='geomacro.deployment-build.v1'&&
  marker?.canonical_repository==='blocknine0/geomacro'&&marker?.canonical_main_sha===canonicalSha;
 const pub=obj(h?.public_production);
 const hot=obj(pub?.hot_snapshot_serving),current=obj(pub?.current_hot_product_ready);
 const data=hStatus===200&&h?.ok===true&&h?.production_data_runtime_configured===true&&
  pub?.b2_runtime_configured===true&&HOT.every(k=>hot?.[k]?.ok===true&&current?.[k]===true);
 const prelaunch=dStatus===200&&disc?.status==='prelaunch'&&
  disc?.productionFundsAuthorized===false&&Array.isArray(disc?.resources)&&disc.resources.length===0;
 const noFunds=(aStatus===200||aStatus===422)&&avail?.payment_required_now===false&&
  avail?.execution_authorized===false;
 // A live no-funds quote must disclose a strictly positive, internally
 // consistent atomic USDC price, not just a syntactically numeric label.
 // Actual capability/variant correctness remains enforced by the server's
 // canonical eligibility resolver and later immutable x402 payment binding.
 const price=obj(avail?.exact_price);
 const decimal=typeof price?.amount_usdc==='string'?price.amount_usdc:'';
 const decimalValid=/^(?:0|[1-9]\\d*)(?:\\.\\d{1,6})?$/.test(decimal);
 let correctAtomic=false;
 if(decimalValid){
  const [whole,fraction='']=decimal.split('.');
  const atomic=BigInt(whole)*1_000_000n+BigInt(fraction.padEnd(6,'0'));
  correctAtomic=atomic>0n&&atomic<=250_000n&&price?.amount_atomic===atomic.toString();
 }
 const deliverable=noFunds&&aStatus===200&&avail?.ok===true&&avail?.chargeable===true&&
  avail?.availability?.deliverable===true&&avail?.availability?.code==='AVAILABLE'&&
  typeof avail?.query_plan_hash==='string'&&/^[a-f0-9]{64}$/.test(avail.query_plan_hash)&&
  price?.asset==='USDC'&&correctAtomic;
 const blockers=[];
 const require=(flag,code)=>{if(!flag)blockers.push(code);};
 require(deployed,'WEBSITE_PUBLISH_SHA_NOT_CURRENT');
 require(hStatus===200,'DEEP_HEALTH_NOT_HTTP_200');
 require(h?.production_data_runtime_configured===true,'PRODUCTION_DATA_RUNTIME_NOT_READY');
 // A successful HTTP status and three hot booleans are insufficient: require
 // the SAME complete B2-backed deep-health predicate used by the gate itself.
 // Do not report a ready verdict when the origin explicitly says ok:false or
 // when the independent B2-backed edge has not been authenticated.
 require(h?.ok===true,'DEEP_HEALTH_REPORTED_NOT_OK');
 require(pub?.b2_runtime_configured===true,'B2_BACKED_SIGNED_EDGE_NOT_VERIFIED');
 require(data,'CURRENT_SIGNED_3_OF_3_NOT_VERIFIED');
 for(const k of HOT)require(hot?.[k]?.ok===true&&current?.[k]===true,'CURRENT_SIGNED_'+k.toUpperCase()+'_NOT_VERIFIED');
 require(prelaunch,'X402_ZERO_PAYABLE_PRELAUNCH_DISCOVERY_NOT_VERIFIED');
 require(noFunds,'X402_NO_FUNDS_AVAILABILITY_CONTRACT_NOT_VERIFIED');
 require(deliverable,'REPRESENTATIVE_PAID_PRODUCT_NOT_DELIVERABLE');
 return Object.freeze({
  schema:'geomacro.live-commercial-no-funds-go-no-go.v1',
  checked_at:observedAt,canonical_main_sha:canonicalSha,
  observation_status:{build:bStatus,deep_health:hStatus,discovery:dStatus,availability:aStatus},
  gates:{deployed_sha_parity:deployed,deep_health_current_3_of_3:data,
   zero_payable_prelaunch_discovery:prelaunch,availability_no_payment_no_execution:noFunds,
   one_representative_product_deliverable:deliverable,
   all_195_countries_certified:false,all_corridors_certified:false,
   commercial_source_rights_verified_by_this_probe:false,
   external_payment_settlement_verified_by_this_probe:false},
  blockers,
  status:blockers.length===0?'READY_FOR_SEPARATE_OWNER_PAYMENT_ACCEPTANCE_NOT_LAUNCHED':'BLOCKED_NO_REAL_FUNDS',
  no_funds_probe:true,performed_payment:false,real_funds_authorized:false,
  b2_direct_reads:0,d1_writes:0,supabase_requests:0,source_urls_or_raw_data_logged:false
 });
}