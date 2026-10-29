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
function rpcConfig(network:string) {
  const suffix=network==="eip155:8453"?"BASE":
    network==="eip155:137"?"POLYGON":null;
  if(!suffix)throw Error("NO_CARD_RPC_UNSUPPORTED_NETWORK");
  const endpoint=process.env["GEOMACRO_NO_CARD_RPC_"+suffix]?.trim()??"";
  const confirmations=Number(process.env["GEOMACRO_NO_CARD_CONFIRMATIONS_"+suffix]??"");
  let url:URL;
  try{url=new URL(endpoint);}catch{throw Error("NO_CARD_RPC_NOT_CONFIGURED");}
  if(url.protocol!=="https:" || url.username || url.password || url.hash ||
      !Number.isInteger(confirmations)||confirmations<1||confirmations>2048)
    throw Error("NO_CARD_RPC_OR_FINALITY_NOT_APPROVED");
  return {endpoint:url.toString(),confirmations};
}
async function rpc(url:string,method:string,params:unknown[],fetcher:typeof fetch):Promise<unknown> {
  const response=await fetcher(url,{method:"POST",redirect:"error",cache:"no-store",
    headers:{"Content-Type":"application/json",Accept:"application/json"},
    body:JSON.stringify({jsonrpc:"2.0",id:1,method,params}),
    signal:AbortSignal.timeout(6000)});
  if(!response.ok || Number(response.headers.get("content-length")||0)>131072)
    throw Error("NO_CARD_RPC_UNAVAILABLE");
  const raw=await response.text();
  if(raw.length>131072)throw Error("NO_CARD_RPC_RESPONSE_TOO_LARGE");
  const parsed=JSON.parse(raw) as {jsonrpc?:string;id?:number;result?:unknown;error?:unknown};
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
  const {endpoint,confirmations}=rpcConfig(q.network);
  const fetcher=input.fetcher??fetch;
  const reportedChainId=await rpc(endpoint,"eth_chainId",[],fetcher) as string;
  const receipt=await rpc(endpoint,"eth_getTransactionReceipt",[input.transaction],fetcher) as TxReceipt;
  if(!receipt?.blockNumber || !/^0x[0-9a-fA-F]+$/u.test(receipt.blockNumber))
    throw Error("NO_CARD_RECEIPT_MISSING_BLOCK");
  const block=await rpc(endpoint,"eth_getBlockByNumber",[receipt.blockNumber,false],fetcher) as Block;
  const latestBlock=await rpc(endpoint,"eth_blockNumber",[],fetcher) as string;
  return validateNoCardNativeUsdcReceipt({
    network:q.network,asset:q.asset_contract,recipient:q.recipient,
    amountAtomic:q.amount_atomic,txHash:input.transaction,receipt,block,
    latestBlock,reportedChainId,minConfirmations:confirmations,payer:input.payer,
  });
}
