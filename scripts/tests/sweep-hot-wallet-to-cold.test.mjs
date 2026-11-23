import test from "node:test";
import assert from "node:assert/strict";
import {
  CHAINS, DEFAULT_MIN_USDC_ATOMIC, EXPECTED_HOT_WALLET, LOCKED_COLD_WALLET,
  deriveAddress, encodeTransfer, keccak256, parseArgs, sweepChain,
} from "../ops/sweep-hot-wallet-to-cold.mjs";

function rpcMock({chainId=8453,balance=2_000_000n,nativeBalance=10n**18n}={}) {
  const calls=[];
  const fetchImpl=async (_url,options)=>{
    const request=JSON.parse(options.body);
    calls.push(request);
    let result;
    if (request.method==="eth_chainId") result="0x"+chainId.toString(16);
    else if (request.method==="eth_call") result="0x"+balance.toString(16);
    else if (request.method==="eth_getBalance") result="0x"+nativeBalance.toString(16);
    else if (request.method==="eth_estimateGas") result="0x5208";
    else if (request.method==="eth_gasPrice") result="0x3b9aca00";
    else throw new Error("Unexpected RPC method: "+request.method);
    return {ok:true,json:async()=>({jsonrpc:"2.0",id:request.id,result})};
  };
  return {fetchImpl,calls};
}

test("destination stays hardcoded in ERC-20 transfer calldata",()=>{
  const amount=1_234_567n;
  const calldata=encodeTransfer(amount);
  assert.equal(LOCKED_COLD_WALLET,"0xF98c18231ceFBD6d11154DEc14b3Aec6D74dC4B0");
  assert.equal(calldata,"0xa9059cbb"+LOCKED_COLD_WALLET.slice(2).toLowerCase().padStart(64,"0")+amount.toString(16).padStart(64,"0"));
  assert.equal(calldata.slice(0,10),"0xa9059cbb");
});

test("private-key address derivation uses Ethereum Keccak and secp256k1",()=>{
  assert.equal(keccak256(Buffer.alloc(0)),"0xc5d2460186f7233c927e7db2dcc703c0e500b653ca82273b7bfad8045d85a470");
  assert.equal(deriveAddress("0x"+"0".repeat(63)+"1"),"0x7e5f4552091a69125d5dfcb7b8c2659029395bdf");
});

test("live execution fails closed when key does not derive the expected hot wallet",async()=>{
  const {fetchImpl,calls}=rpcMock();
  const result=await sweepChain(CHAINS[0],{rpcUrl:"https://rpc.invalid",privateKey:"0x"+"0".repeat(63)+"1",dryRun:false,fetchImpl});
  assert.equal(result.status,"failed");
  assert.equal(result.reason,"HOT_WALLET_MISMATCH");
  assert.deepEqual(calls.map(call=>call.method),["eth_chainId"]);
  assert.equal(result.hot_wallet,EXPECTED_HOT_WALLET);
});

test("below-minimum token balance is skipped without a transaction",async()=>{
  const {fetchImpl,calls}=rpcMock({balance:DEFAULT_MIN_USDC_ATOMIC-1n});
  const result=await sweepChain(CHAINS[0],{rpcUrl:"https://rpc.invalid",dryRun:true,fetchImpl});
  assert.equal(result.status,"skipped");
  assert.equal(result.reason,"BELOW_MINIMUM");
  assert.equal(result.usdc_atomic,(DEFAULT_MIN_USDC_ATOMIC-1n).toString());
  assert.equal(calls.some(call=>call.method==="eth_sendRawTransaction"),false);
});

test("dry-run reads balances without a signing key or transaction",async()=>{
  const {fetchImpl,calls}=rpcMock();
  const result=await sweepChain(CHAINS[0],{rpcUrl:"https://rpc.invalid",dryRun:true,fetchImpl});
  assert.equal(result.status,"dry_run");
  assert.equal(result.destination_locked,true);
  assert.equal(result.usdc_atomic,"2000000");
  assert.deepEqual(calls.map(call=>call.method),["eth_chainId","eth_call","eth_getBalance"]);
});

test("CLI accepts only dry-run or execute modes and no destination override",()=>{
  assert.deepEqual(parseArgs(["--dry-run"]),{dryRun:true});
  assert.deepEqual(parseArgs(["--execute"]),{dryRun:false});
  assert.throws(()=>parseArgs(["--recipient",EXPECTED_HOT_WALLET]),/ARGUMENTS_INVALID/);
  assert.throws(()=>parseArgs(["--dry-run","--execute"]),/ARGUMENTS_INVALID/);
});
