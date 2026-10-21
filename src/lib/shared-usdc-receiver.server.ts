const ADDRESS=/^0x[0-9a-fA-F]{40}$/u;
const ZERO=/^0x0{40}$/iu;
const NAMES=["GEOMACRO_USDC_RECEIVER","COINBASE_X402_PAY_TO","CIRCLE_X402_SELLER_ADDRESS"] as const;

/** One merchant address across the three EVM mainnets. This checks configuration
 * equality only; it is not wallet-control proof or settlement acceptance. */
export function resolveSharedUsdcReceiver(env:Record<string,string|undefined>=process.env){
 const entries=NAMES.map(name=>({name,value:env[name]?.trim()})).filter(x=>x.value);
 if(!entries.length)throw Error("SHARED_USDC_RECEIVER_MISSING");
 if(entries.some(x=>!ADDRESS.test(x.value!)||ZERO.test(x.value!)))
  throw Error("SHARED_USDC_RECEIVER_INVALID");
 const unique=new Set(entries.map(x=>x.value!.toLowerCase()));
 if(unique.size!==1)throw Error("SHARED_USDC_RECEIVER_MISMATCH");
 return entries[0].value!.toLowerCase() as `0x${string}`;
}

export function assertSharedUsdcReceiver(recipient:string,env:Record<string,string|undefined>=process.env){
 const expected=resolveSharedUsdcReceiver(env);
 if(recipient.toLowerCase()!==expected)throw Error("SHARED_USDC_RECEIVER_MISMATCH");
 return expected;
}
