#!/usr/bin/env node
import {createECDH} from "node:crypto";
import {pathToFileURL} from "node:url";

export const EXPECTED_HOT_WALLET = "0x95ba71d21c41bda8bba9533f96d25f793e4137b5";
export const LOCKED_COLD_WALLET = "0xF98c18231ceFBD6d11154DEc14b3Aec6D74dC4B0";
export const DEFAULT_MIN_USDC_ATOMIC = 1_000_000n;

export const CHAINS = Object.freeze([
  {name:"base",caip2:"eip155:8453",chainId:8453,token:"0x833589fCD6eDb6E08f4c7C32D4f71b54bdA02913",rpcEnv:"BASE_RPC_URL"},
  {name:"polygon",caip2:"eip155:137",chainId:137,token:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",rpcEnv:"POLYGON_RPC_URL",fallbackRpc:"https://polygon-bor-rpc.publicnode.com"},
  {name:"arc",caip2:"eip155:5042",chainId:5042,token:"0x3600000000000000000000000000000000000000",rpcEnv:"ARC_RPC_URL"},
]);

const MASK = (1n << 64n) - 1n;
const ROT = [0,1,62,28,27,36,44,6,55,20,3,10,43,25,39,41,45,15,21,8,18,2,61,56,14];
const ROUND = [
  0x0000000000000001n,0x0000000000008082n,0x800000000000808an,0x8000000080008000n,
  0x000000000000808bn,0x0000000080000001n,0x8000000080008081n,0x8000000000008009n,
  0x000000000000008an,0x0000000000000088n,0x0000000080008009n,0x000000008000000an,
  0x000000008000808bn,0x800000000000008bn,0x8000000000008089n,0x8000000000008003n,
  0x8000000000008002n,0x8000000000000080n,0x000000000000800an,0x800000008000000an,
  0x8000000080008081n,0x8000000000008080n,0x0000000080000001n,0x8000000080008008n,
];

function rol64(value, shift) {
  if (!shift) return value;
  const n = BigInt(shift);
  return ((value << n) | (value >> (64n - n))) & MASK;
}

function keccakF(state) {
  for (const rc of ROUND) {
    const c = new Array(5), d = new Array(5);
    for (let x=0;x<5;x++) c[x]=state[x]^state[x+5]^state[x+10]^state[x+15]^state[x+20];
    for (let x=0;x<5;x++) d[x]=c[(x+4)%5]^rol64(c[(x+1)%5],1);
    for (let y=0;y<5;y++) for (let x=0;x<5;x++) state[x+5*y]^=d[x];
    const b = new Array(25).fill(0n);
    for (let y=0;y<5;y++) for (let x=0;x<5;x++) b[y+5*((2*x+3*y)%5)]=rol64(state[x+5*y],ROT[x+5*y]);
    for (let y=0;y<5;y++) for (let x=0;x<5;x++) state[x+5*y]=b[x+5*y]^((~b[(x+1)%5+5*y])&b[(x+2)%5+5*y]);
    state[0]^=rc;
  }
}

export function keccak256(input) {
  const bytes = Buffer.from(input);
  const rate = 136;
  const paddedLength = Math.ceil((bytes.length + 1) / rate) * rate;
  const padded = Buffer.alloc(paddedLength);
  bytes.copy(padded);
  padded[bytes.length] = 0x01;
  padded[padded.length - 1] |= 0x80;
  const state = new Array(25).fill(0n);
  for (let offset=0;offset<padded.length;offset+=rate) {
    for (let i=0;i<rate;i++) state[Math.floor(i/8)]^=BigInt(padded[offset+i])<<BigInt((i%8)*8);
    keccakF(state);
  }
  const result = Buffer.alloc(32);
  for (let i=0;i<32;i++) result[i]=Number((state[Math.floor(i/8)]>>BigInt((i%8)*8))&0xffn);
  return "0x"+result.toString("hex");
}

export function deriveAddress(privateKey) {
  if (!/^0x[0-9a-fA-F]{64}$/.test(privateKey ?? "")) throw new Error("PRIVATE_KEY_INVALID");
  const ecdh=createECDH("secp256k1");
  try { ecdh.setPrivateKey(Buffer.from(privateKey.slice(2),"hex")); }
  catch { throw new Error("PRIVATE_KEY_INVALID"); }
  const publicKey=ecdh.getPublicKey(undefined,"uncompressed").subarray(1);
  return "0x"+keccak256(publicKey).slice(-40).toLowerCase();
}

export function encodeTransfer(amount) {
  const value=BigInt(amount);
  if (value<0n || value >= 1n<<256n) throw new Error("TRANSFER_AMOUNT_INVALID");
  const recipient=LOCKED_COLD_WALLET.slice(2).toLowerCase().padStart(64,"0");
  return "0xa9059cbb"+recipient+value.toString(16).padStart(64,"0");
}

export async function jsonRpc(rpcUrl, method, params=[], fetchImpl=fetch) {
  const response=await fetchImpl(rpcUrl,{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({jsonrpc:"2.0",id:1,method,params})});
  if (!response.ok) throw new Error("RPC_HTTP_ERROR");
  const body=await response.json();
  if (body?.error) throw new Error("RPC_CALL_FAILED");
  if (!Object.hasOwn(body ?? {},"result")) throw new Error("RPC_RESPONSE_INVALID");
  return body.result;
}

function receipt(chain, status, extra={}) {
  return {schema:"geomacro.cold-wallet-sweep-receipt.v1",chain:chain.caip2,network:chain.name,status,hot_wallet:EXPECTED_HOT_WALLET,cold_wallet:LOCKED_COLD_WALLET,...extra};
}

export async function sweepChain(chain, {rpcUrl,privateKey,dryRun=true,minAtomic=DEFAULT_MIN_USDC_ATOMIC,fetchImpl=fetch,sendTransaction}={}) {
  if (!rpcUrl) return receipt(chain,"skipped",{reason:"RPC_NOT_CONFIGURED"});
  const chainId=Number(BigInt(await jsonRpc(rpcUrl,"eth_chainId",[],fetchImpl)));
  if (chainId!==chain.chainId) return receipt(chain,"failed",{reason:"CHAIN_ID_MISMATCH",expected_chain_id:chain.chainId,observed_chain_id:chainId});
  if (!dryRun) {
    if (!privateKey) return receipt(chain,"failed",{reason:"PRIVATE_KEY_MISSING"});
    let derived;
    try { derived=deriveAddress(privateKey); } catch { return receipt(chain,"failed",{reason:"PRIVATE_KEY_INVALID"}); }
    if (derived.toLowerCase()!==EXPECTED_HOT_WALLET) return receipt(chain,"failed",{reason:"HOT_WALLET_MISMATCH",derived_hot_wallet:derived});
  }
  const [tokenBalanceHex,nativeBalanceHex]=await Promise.all([
    jsonRpc(rpcUrl,"eth_call",[{to:chain.token,data:"0x70a08231"+EXPECTED_HOT_WALLET.slice(2).toLowerCase().padStart(64,"0")},"latest"],fetchImpl),
    jsonRpc(rpcUrl,"eth_getBalance",[EXPECTED_HOT_WALLET,"latest"],fetchImpl),
  ]);
  const balance=BigInt(tokenBalanceHex);
  const nativeBalance=BigInt(nativeBalanceHex);
  const threshold=BigInt(minAtomic);
  if (balance<threshold) return receipt(chain,"skipped",{reason:"BELOW_MINIMUM",usdc_atomic:balance.toString(),minimum_usdc_atomic:threshold.toString()});
  if (dryRun) return receipt(chain,"dry_run",{usdc_atomic:balance.toString(),native_balance_wei:nativeBalance.toString(),destination_locked:true});
  const data=encodeTransfer(balance);
  const transaction={from:EXPECTED_HOT_WALLET,to:chain.token,value:"0x0",data};
  const [gasHex,gasPriceHex]=await Promise.all([
    jsonRpc(rpcUrl,"eth_estimateGas",[transaction],fetchImpl),
    jsonRpc(rpcUrl,"eth_gasPrice",[],fetchImpl),
  ]);
  const gasLimit=BigInt(gasHex)*120n/100n;
  const gasPrice=BigInt(gasPriceHex);
  const requiredGas=gasLimit*gasPrice;
  if (nativeBalance<requiredGas) return receipt(chain,"skipped",{reason:"INSUFFICIENT_GAS",usdc_atomic:balance.toString(),native_balance_wei:nativeBalance.toString(),required_gas_wei:requiredGas.toString()});
  try {
    let txHash;
    if (sendTransaction) txHash=await sendTransaction({chain,rpcUrl,privateKey,transaction:{...transaction,gasLimit:"0x"+gasLimit.toString(16),gasPrice:"0x"+gasPrice.toString(16)}});
    else {
      const {JsonRpcProvider,Wallet}=await import("ethers");
      const provider=new JsonRpcProvider(rpcUrl,chain.chainId,{staticNetwork:true});
      const wallet=new Wallet(privateKey,provider);
      const sent=await wallet.sendTransaction({to:chain.token,value:0n,data,gasLimit,gasPrice});
      txHash=sent.hash;
    }
    return receipt(chain,"submitted",{usdc_atomic:balance.toString(),tx_hash:txHash,destination_locked:true});
  } catch {
    return receipt(chain,"failed",{reason:"TRANSACTION_SUBMISSION_FAILED",usdc_atomic:balance.toString(),destination_locked:true});
  }
}

export function parseArgs(argv) {
  const args=new Set(argv);
  if ([...args].some(arg=>arg!=="--dry-run"&&arg!=="--execute") || (args.has("--dry-run")&&args.has("--execute"))) throw new Error("ARGUMENTS_INVALID");
  return {dryRun:!args.has("--execute")};
}

export async function runSweep({env=process.env,argv=process.argv.slice(2),fetchImpl=fetch,sendTransaction}={}) {
  const {dryRun}=parseArgs(argv);
  let minAtomic=DEFAULT_MIN_USDC_ATOMIC;
  if (env.SWEEP_MIN_USDC_ATOMIC!==undefined) {
    if (!/^\d+$/.test(env.SWEEP_MIN_USDC_ATOMIC)) throw new Error("MINIMUM_INVALID");
    minAtomic=BigInt(env.SWEEP_MIN_USDC_ATOMIC);
  }
  if (!dryRun && env.GEOMACRO_COLD_SWEEP_ENABLED!=="true") throw new Error("LIVE_SWEEP_DISABLED");
  const results=[];
  for (const chain of CHAINS) {
    const rpcUrl=env[chain.rpcEnv]||chain.fallbackRpc;
    results.push(await sweepChain(chain,{rpcUrl,privateKey:dryRun?undefined:env.GEOMACRO_HOT_WALLET_SWEEP_PRIVATE_KEY,dryRun,minAtomic,fetchImpl,sendTransaction}));
  }
  return {schema:"geomacro.cold-wallet-sweep-run.v1",dry_run:dryRun,results};
}

if (process.argv[1] && import.meta.url===pathToFileURL(process.argv[1]).href) {
  try { console.log(JSON.stringify(await runSweep(),null,2)); }
  catch (error) { console.log(JSON.stringify({schema:"geomacro.cold-wallet-sweep-run.v1",status:"failed",reason:/^[A-Z0-9_]{1,64}$/.test(error?.message??"")?error.message:"SWEEP_FAILED"},null,2)); process.exitCode=1; }
}
