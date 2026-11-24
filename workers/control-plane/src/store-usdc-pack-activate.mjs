import {CUSTOMER_CREDIT_CONTRACT} from './customer-paid-ledger.mjs';
import {customerHmac} from './customer-runtime.mjs';

export const USDC_PACK_RECIPIENT='0x95ba71d21c41bda8bba9533f96d25f793e4137b5';
export const USDC_PACK_CHAINS=Object.freeze({
 base:Object.freeze({chainId:8453,provider:'base_usdc',token:'0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913',rpc:'https://mainnet.base.org'}),
 polygon:Object.freeze({chainId:137,provider:'polygon_usdc',token:'0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359',rpc:'https://polygon-bor-rpc.publicnode.com'}),
 arc:Object.freeze({chainId:5042,provider:'arc_usdc',token:'0x3600000000000000000000000000000000000000',rpc:'https://rpc.mainnet.arc.io'}),
});
export const USDC_PACK_CATALOG=Object.freeze({
 'risk-gate-small':Object.freeze({sku:'risk-gate-small',tier:'risk_gate_pack_small',priceUsd:15,amountMinorUnits:1500,credits:1500}),
 'risk-gate-standard':Object.freeze({sku:'risk-gate-standard',tier:'risk_gate_pack_standard',priceUsd:30,amountMinorUnits:3000,credits:3000}),
 'risk-gate-best':Object.freeze({sku:'risk-gate-best',tier:'risk_gate_pack_best',priceUsd:60,amountMinorUnits:6000,credits:6000}),
});
const TRANSFER_TOPIC='0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef';
const TX=/^0x[0-9a-f]{64}$/;
const ADDRESS=/^0x[0-9a-f]{40}$/;
const HEADERS={'Cache-Control':'no-store','X-Content-Type-Options':'nosniff'};
const fail=(status,error)=>({status,error});
const json=(body,status=200)=>Response.json(body,{status,headers:HEADERS});
const iso=n=>new Date(n).toISOString();
function secureEqual(a,b){
 const left=new TextEncoder().encode(String(a??'')),right=new TextEncoder().encode(String(b??''));
 if(left.length!==right.length||left.length<32)return false;
 let mismatch=0;for(let i=0;i<left.length;i++)mismatch|=left[i]^right[i];return mismatch===0;
}
function activeGate(env){
 return env?.GEOMACRO_USDC_PACK_CHECKOUT_ACCEPTANCE==='ACCEPTED_MAINNET_USDC_PACK_FUNDING'&&
  env?.GEOMACRO_CUSTOMER_PAID_RUNTIME_ACCEPTANCE==='ACCEPTED_CANONICAL_D1_PAID_RUNTIME'&&
  env?.GEOMACRO_RISK_GATE_COMMERCIAL_ACCEPTANCE==='ACCEPTED_RISK_GATE_PRICING_LEDGER'&&
  env?.GEOMACRO_COMMERCE_EMERGENCY_FREEZE==='false'&&
  env?.GEOMACRO_CENTRAL_SECURITY_MODE==='enforce'&&
  env?.GEOMACRO_COMMERCIAL_LAUNCH_ACK==='I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH'&&
  env?.GEOMACRO_REAL_FUNDS_SECURITY_ACK==='I_ACCEPT_REAL_FUNDS_SECURITY_GATES'&&
  String(env?.GEOMACRO_API_CREDENTIAL_PEPPER??'').length>=32&&
  String(env?.GEOMACRO_CUSTOMER_AUTH_PEPPER??'').length>=64&&
  typeof env?.DB?.batch==='function';
}
async function rpc(url,method,params,fetcher){
 const response=await fetcher(url,{method:'POST',redirect:'error',headers:{'content-type':'application/json',accept:'application/json'},
  body:JSON.stringify({jsonrpc:'2.0',id:1,method,params}),signal:AbortSignal.timeout(7000)});
 if(!response.ok)throw Error('USDC_RPC_UNAVAILABLE');
 const body=await response.json();if(body?.error||body?.result===undefined)throw Error('USDC_RPC_INVALID_RESPONSE');
 return body.result;
}
export async function verifyPackTransfer({network,txHash,sku,walletAddress,fetcher=fetch}){
 const chain=USDC_PACK_CHAINS[network],pack=USDC_PACK_CATALOG[sku];
 const tx=String(txHash??'').toLowerCase(),wallet=String(walletAddress??'').toLowerCase();
 if(!chain||!pack||!TX.test(tx)||(walletAddress!==undefined&&!ADDRESS.test(wallet)) )throw Error('USDC_PACK_PROOF_INPUT_INVALID');
 const [chainId,receipt,latest]=await Promise.all([
  rpc(chain.rpc,'eth_chainId',[],fetcher),
  rpc(chain.rpc,'eth_getTransactionReceipt',[tx],fetcher),
  rpc(chain.rpc,'eth_blockNumber',[],fetcher),
 ]);
 if(String(chainId).toLowerCase()!=='0x'+chain.chainId.toString(16))throw Error('USDC_RPC_WRONG_CHAIN');
 if(!receipt||receipt.status!=='0x1'||String(receipt.transactionHash??'').toLowerCase()!==tx||
   !/^0x[0-9a-f]+$/i.test(String(receipt.blockNumber??''))||!/^0x[0-9a-f]+$/i.test(String(latest??'')))
   throw Error('USDC_TX_NOT_CONFIRMED');
 if(BigInt(latest)<BigInt(receipt.blockNumber))throw Error('USDC_TX_BLOCK_PENDING');
 const destination='0x'+USDC_PACK_RECIPIENT.slice(2).padStart(64,'0');
 const amount=BigInt(pack.amountMinorUnits)*10_000n;
 const matches=(receipt.logs??[]).filter(log=>log?.address?.toLowerCase()===chain.token.toLowerCase()&&
  Array.isArray(log.topics)&&log.topics.length===3&&log.topics[0]?.toLowerCase()===TRANSFER_TOPIC&&
  log.topics[2]?.toLowerCase()===destination.toLowerCase()&&/^0x[0-9a-f]{64}$/i.test(String(log.data??''))&&
  BigInt(log.data)===amount);
 if(matches.length!==1)throw Error('USDC_PACK_EXACT_TRANSFER_REQUIRED');
 const from=String(matches[0].topics[1]??'').toLowerCase();
 if(!/^0x0{24}[0-9a-f]{40}$/.test(from)||(walletAddress!==undefined&&('0x'+from.slice(-40))!==wallet))
  throw Error('USDC_PACK_PAYER_WALLET_MISMATCH');
 const block=await rpc(chain.rpc,'eth_getBlockByNumber',[receipt.blockNumber,false],fetcher);
 if(!block||String(block.number).toLowerCase()!==String(receipt.blockNumber).toLowerCase()||!/^0x[0-9a-f]+$/i.test(String(block.timestamp??'')))
  throw Error('USDC_TX_BLOCK_TIMESTAMP_UNAVAILABLE');
 return {network,chainId:chain.chainId,provider:chain.provider,token:chain.token,recipient:USDC_PACK_RECIPIENT,
  tx_hash:tx,payer:'0x'+from.slice(-40),amount_atomic:amount.toString(),block_number:BigInt(receipt.blockNumber).toString(),
  settled_at:iso(Number(BigInt(block.timestamp))*1000),sku,amount_minor_units:pack.amountMinorUnits,credits:pack.credits,tier:pack.tier};
}
async function readSessionUser(env,sessionToken,now){
 const token=String(sessionToken??'');if(!/^[a-f0-9]{64}$/.test(token))throw Object.assign(Error('CUSTOMER_SESSION_REQUIRED'),{status:401});
 const hash=await customerHmac(String(env.GEOMACRO_CUSTOMER_AUTH_PEPPER),'session',token);
 const row=await env.DB.prepare(`SELECT u.id,u.email FROM sessions s JOIN users u ON u.id=s.user_id
  WHERE s.token_hmac_sha256=? AND s.revoked_at IS NULL AND s.expires_at>? AND u.status='active' AND u.email_verified_at IS NOT NULL`)
  .bind(hash,now).first();
 if(!row)throw Object.assign(Error('CUSTOMER_SESSION_INVALID'),{status:401});return row;
}
async function proofDigest(proof){
 const text=['geomacro.usdc-pack-transfer.v1',proof.network,String(proof.chainId),proof.tx_hash,proof.sku,
  proof.payer,proof.recipient,proof.token,proof.amount_atomic,proof.block_number,proof.settled_at].join('\0');
 const bytes=await crypto.subtle.digest('SHA-256',new TextEncoder().encode(text));
 return Array.from(new Uint8Array(bytes),b=>b.toString(16).padStart(2,'0')).join('');
}
async function readFundedTransfer(db,network,txHash){
 return db.prepare(`SELECT t.user_id,t.sku,t.receipt_id,t.amount_atomic,t.wallet_address,r.verified_at,
   g.grant_id,l.delta_credits FROM customer_usdc_pack_transfers t
   JOIN customer_payment_receipts r ON r.receipt_id=t.receipt_id
   JOIN customer_entitlement_grants g ON g.receipt_id=r.receipt_id AND g.user_id=r.user_id
   JOIN credit_ledger l ON l.receipt_id=r.receipt_id AND l.user_id=r.user_id AND l.event_type='funding'
   WHERE t.network=? AND t.tx_hash=?`).bind(network,txHash).first();
}
export async function storeUsdcPackActivate(request,env,{now=()=>Date.now(),fetcher=fetch}={}){
 if(request.method!=='POST')return json({ok:false,error:'METHOD_NOT_ALLOWED'},405);
 const expected=String(env?.GEOMACRO_COMMERCE_LEDGER_TOKEN??'').trim();
 if(expected.length<32||!secureEqual(request.headers.get('authorization')?.replace(/^Bearer\s+/,'')??'',expected))
  return json({ok:false,error:'USDC_PACK_LEDGER_UNAUTHORIZED'},401);
 if((request.headers.get('content-type')??'').split(';')[0].trim().toLowerCase()!=='application/json')
  return json({ok:false,error:'UNSUPPORTED_MEDIA_TYPE'},415);
 let body;try{const raw=await request.text();if(raw.length>2048)return json({ok:false,error:'BODY_TOO_LARGE'},413);body=JSON.parse(raw);}catch{return json({ok:false,error:'INVALID_JSON'},400);}
 if(!body||typeof body!=='object'||Array.isArray(body)||Object.keys(body).some(k=>!['action','network','tx_hash','sku','session_token'].includes(k)))
  return json({ok:false,error:'USDC_PACK_BODY_INVALID'},400);
 if(body.action==='status')return json({ok:true,checkout_enabled:activeGate(env),code:activeGate(env)?null:'USDC_PACK_CHECKOUT_NOT_ACCEPTED'});
 if(body.action!=='activate'||typeof body.network!=='string'||typeof body.sku!=='string'||typeof body.tx_hash!=='string'||typeof body.session_token!=='string')
  return json({ok:false,error:'USDC_PACK_BODY_INVALID'},400);
 if(!activeGate(env))return json({ok:false,error:'USDC_PACK_CHECKOUT_NOT_ACCEPTED'},423);
 const at=iso(now());
 try{
  const user=await readSessionUser(env,body.session_token,at);
  const wallets=(await env.DB.prepare('SELECT wallet_address FROM customer_wallet_addresses WHERE user_id=? ORDER BY created_at,wallet_address LIMIT 20').bind(user.id).all()).results??[];
  if(!wallets.length)return json({ok:false,error:'CUSTOMER_WALLET_BINDING_REQUIRED'},409);
  const proof=await verifyPackTransfer({network:body.network,txHash:body.tx_hash,sku:body.sku,fetcher});
  if(!wallets.some(row=>row.wallet_address===proof.payer))return json({ok:false,error:'USDC_PACK_PAYER_WALLET_MISMATCH'},402);
  const prior=await readFundedTransfer(env.DB,proof.network,proof.tx_hash);
  if(prior){
   if(prior.user_id!==user.id||prior.sku!==proof.sku||prior.wallet_address!==proof.payer||prior.amount_atomic!==proof.amount_atomic)
    return json({ok:false,error:'USDC_TX_ALREADY_USED'},409);
   return json({ok:true,checkout_enabled:true,payment_funded:true,idempotent_replay:true,
    receipt_id:prior.receipt_id,credits_funded:prior.delta_credits,credits:prior.delta_credits,sku:prior.sku});
  }
  const pack=USDC_PACK_CATALOG[proof.sku],receiptId='r_usdc_'+proof.chainId+'_'+proof.tx_hash.slice(2),grantId='g_usdc_'+proof.chainId+'_'+proof.tx_hash.slice(2);
  const fundingId='f_usdc_'+proof.chainId+'_'+proof.tx_hash.slice(2),verification=await proofDigest(proof);
  const expiry='9999-12-31T23:59:59.999Z';
  try{
   await env.DB.batch([
    env.DB.prepare(`INSERT INTO customer_payment_receipts
     (receipt_id,user_id,provider,environment,provider_event_id,sku,amount_minor_units,currency,settled_at,verified_at,verification_sha256)
     VALUES(?,?,?,'mainnet',?,?,?,'USDC',?,?,?)`).bind(receiptId,user.id,proof.provider,`${proof.chainId}:${proof.tx_hash}`,
      proof.sku,proof.amount_minor_units,proof.settled_at,at,verification),
    env.DB.prepare(`INSERT INTO customer_entitlement_grants
     (grant_id,user_id,receipt_id,tier,contract_version,starts_at,expires_at,status)
     VALUES(?,?,?,?,?,?,?,'active')`).bind(grantId,user.id,receiptId,pack.tier,CUSTOMER_CREDIT_CONTRACT,at,expiry),
    env.DB.prepare(`INSERT INTO credit_ledger(event_id,user_id,event_type,delta_credits,receipt_id,occurred_at)
     VALUES(?,?,'funding',?,?,?)`).bind(fundingId,user.id,pack.credits,receiptId,at),
    env.DB.prepare(`INSERT INTO customer_usdc_pack_transfers
     (network,tx_hash,user_id,wallet_address,sku,amount_atomic,receipt_id,block_number,settled_at)
     VALUES(?,?,?,?,?,?,?,?,?)`).bind(proof.network,proof.tx_hash,user.id,proof.payer,proof.sku,proof.amount_atomic,receiptId,proof.block_number,proof.settled_at),
   ]);
  }catch{
   const replay=await readFundedTransfer(env.DB,proof.network,proof.tx_hash);
   if(replay&&replay.user_id===user.id&&replay.sku===proof.sku&&replay.wallet_address===proof.payer&&replay.amount_atomic===proof.amount_atomic)
    return json({ok:true,checkout_enabled:true,payment_funded:true,idempotent_replay:true,receipt_id:replay.receipt_id,
     credits_funded:replay.delta_credits,credits:replay.delta_credits,sku:replay.sku});
   if(replay)return json({ok:false,error:'USDC_TX_ALREADY_USED'},409);
   return json({ok:false,error:'USDC_PACK_LEDGER_FUNDING_UNCONFIRMED'},503);
  }
  const funded=await readFundedTransfer(env.DB,proof.network,proof.tx_hash);
  if(!funded||funded.user_id!==user.id||funded.receipt_id!==receiptId||funded.delta_credits!==pack.credits)
   return json({ok:false,error:'USDC_PACK_LEDGER_READBACK_UNAVAILABLE'},503);
  return json({ok:true,checkout_enabled:true,payment_funded:true,idempotent_replay:false,receipt_id:receiptId,
   credits_funded:pack.credits,credits:pack.credits,sku:proof.sku,network:proof.network,tx_hash:proof.tx_hash});
 }catch(error){
  return json({ok:false,error:/^[A-Z0-9_]{1,80}$/.test(String(error?.message??''))?error.message:'USDC_PACK_ACTIVATION_UNAVAILABLE'},error?.status??402);
 }
}
