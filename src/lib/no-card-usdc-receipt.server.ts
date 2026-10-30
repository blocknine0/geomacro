import process from "node:process";
import type { PreparedCapabilityQuote } from "./capability-prepared-quote.server";

/**
 * Independent on-chain evidence for exact native-USDC seller settlement.
 * A facilitator's "success" alone is never enough to grant a paid delivery.
 * No wallet private key, credit card or third-party paywall is used.
 */
const TRANSFER_TOPIC =
  "0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const TX=/^0x[a-fA-F0-9]{64}$/u;
const HASH=/^0x[a-fA-F0-9]{64}$/u;
const EVM=/^0x[a-fA-F0-9]{40}$/u;
const CHAIN_IDS:Readonly<Record<string,number>>={
  "eip155:8453":8453,"eip155:137":137,
};
type TxLog={address?:string;topics?:string[];data?:string};
type TxReceipt={transactionHash?:string;status?:string;blockHash?:string;
  blockNumber?:string;logs?:TxLog[]};
type Block={hash?:string;number?:string};
type ChainInspection={network:string;asset:string;recipient:string;
  amountAtomic:string;txHash:string;receipt:TxReceipt;block:Block;
  latestBlock:string;reportedChainId:string;minConfirmations:number;
  payer?:string|null};

/** Pure contract validation; unit tests must not call any RPC or settle funds. */
export function validateNoCardNativeUsdcReceipt(input:ChainInspection) {
  const {network,asset,recipient,amountAtomic,txHash,receipt,block,
    latestBlock,reportedChainId,minConfirmations,payer}=input;
  const chainId=CHAIN_IDS[network];
  if(!chainId || !TX.test(txHash) || !EVM.test(asset) || !EVM.test(recipient) ||
      !/^[1-9][0-9]*$/u.test(amountAtomic) ||
      (payer!=null && !EVM.test(payer)) ||
      !Number.isInteger(minConfirmations)||minConfirmations<1||minConfirmations>2048)
    throw Error("NO_CARD_CHAIN_PROOF_SCOPE_INVALID");
  if(reportedChainId.toLowerCase()!=="0x"+chainId.toString(16))
    throw Error("NO_CARD_RPC_WRONG_CHAIN");
  if(!receipt || receipt.status!=="0x1" ||
      receipt.transactionHash?.toLowerCase()!==txHash.toLowerCase() ||
      !HASH.test(receipt.blockHash??"") ||
      !HASH.test(block?.hash??"") ||
      block.hash?.toLowerCase()!==receipt.blockHash?.toLowerCase() ||
      block.number?.toLowerCase()!==receipt.blockNumber?.toLowerCase() ||
      !receipt.blockNumber?.startsWith("0x") || !latestBlock.startsWith("0x"))
    throw Error("NO_CARD_TX_NOT_CANONICAL_SUCCESS");
  const at=BigInt(receipt.blockNumber);
  const latest=BigInt(latestBlock);
  if(latest<at || latest-at+1n<BigInt(minConfirmations))
    throw Error("NO_CARD_CHAIN_CONFIRMATIONS_INSUFFICIENT");
  const toTopic="0x"+recipient.slice(2).toLowerCase().padStart(64,"0");
  const fromTopic=payer?"0x"+payer.slice(2).toLowerCase().padStart(64,"0"):null;
  const matched=(receipt.logs??[]).filter(log=>
    log.address?.toLowerCase()===asset.toLowerCase() &&
    Array.isArray(log.topics) && log.topics.length===3 &&
    log.topics[0]?.toLowerCase()===TRANSFER_TOPIC &&
    log.topics[2]?.toLowerCase()===toTopic &&
    (!fromTopic||log.topics[1]?.toLowerCase()===fromTopic) &&
    typeof log.data==="string" && /^0x[0-9a-fA-F]+$/u.test(log.data) &&
    BigInt(log.data)===BigInt(amountAtomic)
  );
  if(matched.length!==1)throw Error("NO_CARD_EXACT_USDC_TRANSFER_LOG_NOT_PROVEN");
  return {
    confirmed:true,network,asset,recipient,amountAtomic,
    transaction:txHash,
  };
}
/**
 * Ordered read-only RPC fallback for Base/Polygon merchant settlement verification.
 *
 * Only transport/unavailable-node failures are retryable. Wrong chain, reorg,
 * invalid Transfer, under-confirmed receipts and all other *semantic* failures
 * MUST fail closed rather than promote another node's answer.
 *
 * Each candidate reads chain ID, receipt, canonical block, and head from the
 * SAME endpoint. Never mix proof fields from different providers.
 */
const MAX_RPC_ALTERNATES=10;
const RPC_PROOF_BUDGET_MS=25000;
const RETRYABLE_RPC_ERRORS=new Set(["NO_CARD_RPC_UNAVAILABLE","NO_CARD_RPC_INVALID_REPLY"]);

function approvedRpcUrl(value:string) {
  let url:URL;
  try{url=new URL(value);}catch{throw Error("NO_CARD_RPC_OR_FINALITY_NOT_APPROVED");}
  const host=url.hostname.toLowerCase();
  if(url.protocol!=="https:"||url.username||url.password||url.hash||
     !host||host==="localhost"||host.endsWith(".localhost")||
     host==="[::1]"||host==="::1"||
     /^127\./u.test(host)||/^10\./u.test(host)||
     /^192\.168\./u.test(host)||/^169\.254\./u.test(host)||
     /^172\.(1[6-9]|2[0-9]|3[01])\./u.test(host))
    throw Error("NO_CARD_RPC_OR_FINALITY_NOT_APPROVED");
  return url.toString();
}
function rpcConfig(network:string) {
  const suffix=network==="eip155:8453"?"BASE":
    network==="eip155:137"?"POLYGON":null;
  if(!suffix)throw Error("NO_CARD_RPC_UNSUPPORTED_NETWORK");
  const primary=process.env["GEOMACRO_NO_CARD_RPC_"+suffix]?.trim()??"";
  const confirmations=Number(process.env["GEOMACRO_NO_CARD_CONFIRMATIONS_"+suffix]??"");
  if(!primary)throw Error("NO_CARD_RPC_NOT_CONFIGURED");
  if(!Number.isInteger(confirmations)||confirmations<1||confirmations>2048)
    throw Error("NO_CARD_RPC_OR_FINALITY_NOT_APPROVED");
  const alternateConfig=process.env["GEOMACRO_NO_CARD_RPC_"+suffix+"_ALTERNATES"]?.trim()??"";
  let alternates:unknown=[];
  if(alternateConfig){
    try{
      // Existing owner secrets may contain a single Ankr URL, not a JSON array.
      // Accept either exact HTTPS URL, JSON string, or JSON array; never infer
      // a comma-separated list, so payment verification remains deterministic.
      const parsed=alternateConfig.startsWith("https://")?
        alternateConfig:JSON.parse(alternateConfig);
      alternates=typeof parsed==="string"?[parsed]:parsed;
    }catch{throw Error("NO_CARD_RPC_ALTERNATES_INVALID");}
    if(!Array.isArray(alternates)||alternates.length>MAX_RPC_ALTERNATES||
       alternates.some(item=>typeof item!=="string"||!item.trim()))
      throw Error("NO_CARD_RPC_ALTERNATES_INVALID");
  }
  // Each backup can be saved independently in Lovable Secrets (BACKUP_1...BACKUP_10).
  // Keep the legacy JSON-array config working for existing deployments.
  const individuallyConfigured=Array.from({length:MAX_RPC_ALTERNATES},(_,i)=>
    process.env["GEOMACRO_NO_CARD_RPC_"+suffix+"_BACKUP_"+(i+1)]?.trim()??""
  ).filter(Boolean);
  // Preserve the owner's existing JSON-array backups (e.g. Ankr) before newly added individual secrets.
  const configuredAlternates=[...(alternates as string[]),...individuallyConfigured];
  if(configuredAlternates.length>MAX_RPC_ALTERNATES)
    throw Error("NO_CARD_RPC_ALTERNATES_INVALID");
  const endpoints=[...new Set([primary,...configuredAlternates].map(approvedRpcUrl))];
  return {endpoints,confirmations};
}
async function rpc(url:string,method:string,params:unknown[],
  fetcher:typeof fetch,timeoutMs:number):Promise<unknown> {
  let response:Response;
  try{
    response=await fetcher(url,{method:"POST",redirect:"manual",cache:"no-store",
      headers:{"Content-Type":"application/json",Accept:"application/json"},
      body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
      signal:AbortSignal.timeout(Math.max(1,Math.min(6000,timeoutMs)))});
  }catch{throw Error("NO_CARD_RPC_UNAVAILABLE");}
  // Workerd does not support redirect:"error". Redirects are never followed:
  // a manual 3xx is rejected and may only trigger bounded read-only fallback.
  if(response.status>=300&&response.status<400)
    throw Error("NO_CARD_RPC_UNAVAILABLE");
  if(!response.ok)throw Error("NO_CARD_RPC_UNAVAILABLE");
  if(Number(response.headers.get("content-length")||0)>131072)
    throw Error("NO_CARD_RPC_RESPONSE_TOO_LARGE");
  let parsed:{jsonrpc?:string;id?:number;result?:unknown;error?:unknown};
  try{
    const raw=await response.text();
    if(raw.length>131072)throw Error("NO_CARD_RPC_RESPONSE_TOO_LARGE");
    parsed=JSON.parse(raw);
  }catch(e){
    if(e instanceof Error&&e.message==="NO_CARD_RPC_RESPONSE_TOO_LARGE")throw e;
    throw Error("NO_CARD_RPC_INVALID_REPLY");
  }
  if(parsed?.jsonrpc!=="2.0"||parsed.id!==1||parsed.error||parsed.result==null)
    throw Error("NO_CARD_RPC_INVALID_REPLY");
  return parsed.result;
}
export async function confirmNoCardNativeUsdcChainSettlement(input:{
  quote:PreparedCapabilityQuote;transaction:string;payer?:string|null;
  fetcher?:typeof fetch;
}) {
  const q=input.quote;
  if(!TX.test(input.transaction))throw Error("NO_CARD_TX_HASH_REQUIRED");
  const {endpoints,confirmations}=rpcConfig(q.network);
  const fetcher=input.fetcher??fetch;
  const deadline=Date.now()+RPC_PROOF_BUDGET_MS;
  for(let i=0;i<endpoints.length;i++){
    const endpoint=endpoints[i];
    const read=(method:string,params:unknown[])=>{
      const remaining=deadline-Date.now();
      if(remaining<=0)throw Error("NO_CARD_RPC_BUDGET_EXHAUSTED");
      return rpc(endpoint,method,params,fetcher,remaining);
    };
    try{
      const reportedChainId=await read("eth_chainId",[]) as string;
      if(typeof reportedChainId!=="string"||
         reportedChainId.toLowerCase()!=="0x"+CHAIN_IDS[q.network]?.toString(16))
        throw Error("NO_CARD_RPC_WRONG_CHAIN");
      const receipt=await read("eth_getTransactionReceipt",[input.transaction]) as TxReceipt;
      if(!receipt?.blockNumber || !/^0x[0-9a-fA-F]+$/u.test(receipt.blockNumber))
        throw Error("NO_CARD_RECEIPT_MISSING_BLOCK");
      const block=await read("eth_getBlockByNumber",[receipt.blockNumber,false]) as Block;
      const latestBlock=await read("eth_blockNumber",[]) as string;
      return validateNoCardNativeUsdcReceipt({
        network:q.network,asset:q.asset_contract,recipient:q.recipient,
        amountAtomic:q.amount_atomic,txHash:input.transaction,receipt,block,
        latestBlock,reportedChainId,minConfirmations:confirmations,payer:input.payer,
      });
    }catch(e){
      const code=e instanceof Error?e.message:"";
      if(!RETRYABLE_RPC_ERRORS.has(code))throw e;
      if(i===endpoints.length-1||Date.now()>=deadline)
        throw Error("NO_CARD_RPC_ALL_ENDPOINTS_UNAVAILABLE");
    }
  }
  throw Error("NO_CARD_RPC_ALL_ENDPOINTS_UNAVAILABLE");
}
