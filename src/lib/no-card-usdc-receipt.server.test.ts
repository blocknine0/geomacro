import {describe,it,expect,vi,afterEach,beforeEach} from "vitest";
import {validateNoCardNativeUsdcReceipt,confirmNoCardNativeUsdcChainSettlement} from "./no-card-usdc-receipt.server";
import type {PreparedCapabilityQuote} from "./capability-prepared-quote.server";

const TX="0x"+"a".repeat(64);
const BLOCK="0x"+"b".repeat(64);
const RECIPIENT="0x"+"1".repeat(40);
const PAYER="0x"+"2".repeat(40);
const USDC="0x833589fCD6eDb6E08f4C7C32D4f71b54bdA02913";
const TOPIC="0xddf252ad1be2c89b69c2b068fc378daa952ba7f163c4a11628f55a4df523b3ef";
const topic=(address:string)=>"0x"+address.slice(2).toLowerCase().padStart(64,"0");
const good=()=>({
  network:"eip155:8453",asset:USDC,recipient:RECIPIENT,amountAtomic:"20000",
  payer:PAYER,txHash:TX,
  receipt:{transactionHash:TX,status:"0x1",blockNumber:"0x64",blockHash:BLOCK,
    logs:[{address:USDC,topics:[TOPIC,topic(PAYER),topic(RECIPIENT)],data:"0x4e20"}]},
  block:{hash:BLOCK,number:"0x64"},latestBlock:"0x70",
  reportedChainId:"0x2105",minConfirmations:10,
});
describe("no-card independent native USDC settlement proof, no RPC or funds",()=>{
  it("requires native USDC transfer to the exact wallet and sufficient confirmations",()=>{
    expect(validateNoCardNativeUsdcReceipt(good()).confirmed).toBe(true);
    expect(validateNoCardNativeUsdcReceipt(good()).amountAtomic).toBe("20000");
  });
  it("rejects wrong chain / reorg / missing confirmations / reverted tx",()=>{
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),reportedChainId:"0x89"})).toThrow();
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),
      block:{hash:"0x"+"c".repeat(64),number:"0x64"}})).toThrow();
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),latestBlock:"0x65"})).toThrow();
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),
      receipt:{...good().receipt,status:"0x0"}})).toThrow();
  });
  it("rejects wrong token, payee, payer, amount and no transfer logs",()=>{
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),asset:"0x"+"3".repeat(40)})).toThrow();
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),recipient:"0x"+"3".repeat(40)})).toThrow();
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),payer:"0x"+"4".repeat(40)})).toThrow();
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),amountAtomic:"30000"})).toThrow();
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),
      receipt:{...good().receipt,logs:[]}})).toThrow();
  });
  it("rejects multiple matching transfers to prevent ambiguous attribution",()=>{
    const x=good();
    expect(()=>validateNoCardNativeUsdcReceipt({...x,
      receipt:{...x.receipt,logs:[...x.receipt.logs,...x.receipt.logs]}})).toThrow();
  });
  it("rejects zero- or maliciously-small confirmation settings",()=>{
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),minConfirmations:0})).toThrow();
    expect(()=>validateNoCardNativeUsdcReceipt({...good(),minConfirmations:2049})).toThrow();
  });
});


/** Network-free tests. No mainnet settlement or wallet signature is created. */
describe("bounded Base/Polygon RPC alternatives for independent receipt verification",()=>{
  const primary="https://primary-rpc.example/v2/private";
  const backup="https://independent-rpc.example/rpc";
  const quote=()=>({
    network:"eip155:8453",asset_contract:USDC,recipient:RECIPIENT,
    amount_atomic:"20000",
  }) as PreparedCapabilityQuote;
  const jsonResult=(result:unknown)=>new Response(JSON.stringify({
    jsonrpc:"2.0",id:1,result,
  }),{status:200,headers:{"Content-Type":"application/json"}});
  const result=(method:string,network="eip155:8453",invalidTransfer=false)=>{
    const original=good();
    switch(method){
      case "eth_chainId":return network==="eip155:8453"?"0x2105":"0x89";
      case "eth_getTransactionReceipt":{
        const receipt=original.receipt;
        const polygonAsset="0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359";
        return {...receipt,logs:invalidTransfer?[]:receipt.logs.map(log=>({
          ...log,address:network==="eip155:8453"?USDC:polygonAsset,
        }))};
      }
      case "eth_getBlockByNumber":return original.block;
      case "eth_blockNumber":return original.latestBlock;
      default:throw Error("UNKNOWN_TEST_METHOD");
    }
  };
  beforeEach(()=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE",primary);
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES",JSON.stringify([backup]));
    vi.stubEnv("GEOMACRO_NO_CARD_CONFIRMATIONS_BASE","10");
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_POLYGON",primary);
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_POLYGON_ALTERNATES",JSON.stringify([backup]));
    vi.stubEnv("GEOMACRO_NO_CARD_CONFIRMATIONS_POLYGON","10");
  });
  afterEach(()=>vi.unstubAllEnvs());

  it("uses the entire successful primary RPC proof with no backup calls",async()=>{
    const origins:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      origins.push(String(input));
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method));
    }) as typeof fetch;
    const x=await confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    });
    expect(x.confirmed).toBe(true);
    expect(origins).toEqual([primary,primary,primary,primary]);
  });

  it("restarts the whole proof with the next provider on a 429",async()=>{
    const origins:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      const url=String(input);origins.push(url);
      if(url===primary)return new Response(null,{status:429});
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method));
    }) as typeof fetch;
    const proof=await confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    });
    expect(proof.confirmed).toBe(true);
    expect(origins).toEqual([primary,backup,backup,backup,backup]);
  });

  it("retries a malformed/unavailable receipt from the primary without mixing fields",async()=>{
    const calls:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      const url=String(input);
      const method=JSON.parse(String(init?.body)).method as string;
      calls.push(url+":"+method);
      if(url===primary&&method==="eth_getTransactionReceipt")
        return jsonResult(null);
      return jsonResult(result(method));
    }) as typeof fetch;
    const proof=await confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    });
    expect(proof.confirmed).toBe(true);
    expect(calls.filter(x=>x.startsWith(backup))).toHaveLength(4);
  });

  it("uses directly saved raw Ankr _ALTERNATES URL after Alchemy 429",async()=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES",backup);
    const urls:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      const url=String(input);urls.push(url);
      if(url===primary)return new Response(null,{status:429});
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method));
    }) as typeof fetch;
    const proof=await confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    });
    expect(proof.confirmed).toBe(true);
    expect(urls).toEqual([primary,backup,backup,backup,backup]);
  });
  it("preserves legacy JSON arrays as well as JSON-string single URLs",async()=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_POLYGON_ALTERNATES",JSON.stringify(backup));
    const q={...quote(),network:"eip155:137",
      asset_contract:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    } as PreparedCapabilityQuote;
    const calls:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      const url=String(input);calls.push(url);
      if(url===primary)return new Response(null,{status:503});
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method,"eip155:137"));
    }) as typeof fetch;
    expect((await confirmNoCardNativeUsdcChainSettlement({
      quote:q,transaction:TX,payer:PAYER,fetcher,
    })).confirmed).toBe(true);
    expect(calls).toEqual([primary,backup,backup,backup,backup]);
  });

  it("uses Worker-supported redirect:manual on every verification subrequest",async()=>{
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      if(init?.redirect==="error")throw new TypeError("workerd rejects redirect:error");
      expect(init?.redirect).toBe("manual");
      expect(init?.cache).toBe("no-store");
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method));
    }) as typeof fetch;
    const proof=await confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    });
    expect(proof.confirmed).toBe(true);
  });
  it("never follows redirected provider RPC calls; fails over to independent endpoint",async()=>{
    const called:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      expect(init?.redirect).toBe("manual");
      called.push(String(input));
      if(String(input)===primary)
        return new Response(null,{status:302,headers:{location:"https://untrusted.example/"}});
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method));
    }) as typeof fetch;
    expect((await confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    })).confirmed).toBe(true);
    expect(called).toEqual([primary,backup,backup,backup,backup]);
    expect(called).not.toContain("https://untrusted.example/");
  });

  it("does not fallback on wrong-chain replies even if a backup could pass",async()=>{
    const origins:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      const url=String(input);origins.push(url);
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(url===primary&&method==="eth_chainId"?"0x89":result(method));
    }) as typeof fetch;
    await expect(confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    })).rejects.toThrow("NO_CARD_RPC_WRONG_CHAIN");
    expect(origins).toEqual([primary]);
  });

  it("does not promote an invalid USDC transfer proof by trying more RPCs",async()=>{
    const origins:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      const url=String(input);origins.push(url);
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method,"eip155:8453",url===primary));
    }) as typeof fetch;
    await expect(confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    })).rejects.toThrow("NO_CARD_EXACT_USDC_TRANSFER_LOG_NOT_PROVEN");
    expect(origins).toEqual([primary,primary,primary,primary]);
  });

  it("fails closed when all RPC endpoints are unavailable",async()=>{
    const fetcher=(async()=>new Response(null,{status:503})) as typeof fetch;
    await expect(confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,fetcher,
    })).rejects.toThrow("NO_CARD_RPC_ALL_ENDPOINTS_UNAVAILABLE");
  });

  it("keeps the Polygon RPC list isolated from Base",async()=>{
    const polygonQuote={
      ...quote(),network:"eip155:137",
      asset_contract:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    } as PreparedCapabilityQuote;
    const origins:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      origins.push(String(input));
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method,"eip155:137"));
    }) as typeof fetch;
    const x=await confirmNoCardNativeUsdcChainSettlement({
      quote:polygonQuote,transaction:TX,payer:PAYER,fetcher,
    });
    expect(x.confirmed).toBe(true);
    expect(x.network).toBe("eip155:137");
    expect(origins).toEqual([primary,primary,primary,primary]);
  });

  it("refuses an unsafe alternate URL or too many endpoints before network calls",async()=>{
    const fetcher=vi.fn(async()=>new Response(null,{status:200})) as typeof fetch;
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES",JSON.stringify([
      "http://rpc.example/rpc",
    ]));
    await expect(confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,fetcher,
    })).rejects.toThrow("NO_CARD_RPC_OR_FINALITY_NOT_APPROVED");
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES",JSON.stringify(
      Array.from({length:11},(_,i)=>"https://rpc"+i+".example/rpc")
    ));
    await expect(confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,fetcher,
    })).rejects.toThrow("NO_CARD_RPC_ALTERNATES_INVALID");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("preserves the existing single-primary RPC configuration",async()=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES","");
    const origins:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      origins.push(String(input));
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method));
    }) as typeof fetch;
    expect((await confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,fetcher,
    })).confirmed).toBe(true);
    expect(origins).toHaveLength(4);
  });
  it("accepts individually saved BASE BACKUP_1 and BACKUP_2 without a JSON array",async()=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES","");
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_BACKUP_1",backup);
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_BACKUP_2","https://third-rpc.example/rpc");
    const calls:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      const endpoint=String(input);
      calls.push(endpoint);
      if(endpoint===primary||endpoint===backup)return new Response(null,{status:429});
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method));
    }) as typeof fetch;
    expect((await confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    })).confirmed).toBe(true);
    expect(calls).toEqual([
      primary,backup,"https://third-rpc.example/rpc",
      "https://third-rpc.example/rpc","https://third-rpc.example/rpc",
      "https://third-rpc.example/rpc",
    ]);
  });

  it("supports a separately saved Polygon BACKUP_1 without changing Base",async()=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_POLYGON_ALTERNATES","");
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_POLYGON_BACKUP_1",backup);
    const polygonQuote={...quote(),network:"eip155:137",
      asset_contract:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
    } as PreparedCapabilityQuote;
    const calls:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      const endpoint=String(input);calls.push(endpoint);
      if(endpoint===primary)return new Response(null,{status:503});
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method,"eip155:137"));
    }) as typeof fetch;
    expect((await confirmNoCardNativeUsdcChainSettlement({
      quote:polygonQuote,transaction:TX,payer:PAYER,fetcher,
    })).confirmed).toBe(true);
    expect(calls).toEqual([primary,backup,backup,backup,backup]);
  });

  it("preserves an existing Ankr JSON backup before a separate dRPC secret",async()=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES",JSON.stringify([backup]));
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_BACKUP_2","https://drpc-backup.example/rpc");
    const calls:string[]=[];
    const fetcher=(async(input:unknown,init?:RequestInit)=>{
      const endpoint=String(input);calls.push(endpoint);
      if(endpoint===primary || endpoint===backup)return new Response(null,{status:429});
      const method=JSON.parse(String(init?.body)).method as string;
      return jsonResult(result(method));
    }) as typeof fetch;
    const confirmed=await confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,payer:PAYER,fetcher,
    });
    expect(confirmed.confirmed).toBe(true);
    expect(calls).toEqual([primary,backup,
      "https://drpc-backup.example/rpc","https://drpc-backup.example/rpc",
      "https://drpc-backup.example/rpc","https://drpc-backup.example/rpc"]);
  });

  it("rejects unsafe individually saved RPC endpoints before making any chain calls",async()=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES","");
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_BACKUP_1","http://localhost:8545");
    const fetcher=vi.fn(async()=>new Response(null,{status:200})) as typeof fetch;
    await expect(confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,fetcher,
    })).rejects.toThrow("NO_CARD_RPC_OR_FINALITY_NOT_APPROVED");
    expect(fetcher).not.toHaveBeenCalled();
  });

  it("rejects more than ten total backup secrets and legacy array entries",async()=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_BACKUP_1",backup);
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES",JSON.stringify(
      Array.from({length:10},(_,i)=>"https://rpc"+i+".example/rpc")
    ));
    const fetcher=vi.fn(async()=>new Response(null,{status:200})) as typeof fetch;
    await expect(confirmNoCardNativeUsdcChainSettlement({
      quote:quote(),transaction:TX,fetcher,
    })).rejects.toThrow("NO_CARD_RPC_ALTERNATES_INVALID");
    expect(fetcher).not.toHaveBeenCalled();
  });


});


/**
 * Production-policy regression: no transaction is sent and no real RPC is
 * contacted. These are synthetic chain receipts, not live finality evidence.
 */
describe("Base=3 and Polygon=128 settlement finality safety (no funds)",()=>{
  const scenarios=[
    {network:"eip155:8453",chainId:"0x2105",
      asset:"0x833589fCD6eDb6E08f4C7C32D4f71b54bdA02913",
      env:"GEOMACRO_NO_CARD_CONFIRMATIONS_BASE",minimum:3},
    {network:"eip155:137",chainId:"0x89",
      asset:"0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359",
      env:"GEOMACRO_NO_CARD_CONFIRMATIONS_POLYGON",minimum:128},
  ] as const;
  afterEach(()=>vi.unstubAllEnvs());
  it.each(scenarios)("enforces exactly $minimum confirmations for $network",async s=>{
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE","https://base-test.example/rpc");
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_BASE_ALTERNATES","");
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_POLYGON","https://polygon-test.example/rpc");
    vi.stubEnv("GEOMACRO_NO_CARD_RPC_POLYGON_ALTERNATES","");
    vi.stubEnv(s.env,String(s.minimum));
    const quote={network:s.network,asset_contract:s.asset,recipient:RECIPIENT,
      amount_atomic:"20000"} as PreparedCapabilityQuote;
    const receipt={transactionHash:TX,status:"0x1",blockNumber:"0x64",blockHash:BLOCK,
      logs:[{address:s.asset,topics:[TOPIC,topic(PAYER),topic(RECIPIENT)],data:"0x4e20"}]};
    let head=100+s.minimum-2; // one confirmation short
    const methods:string[]=[];
    const fetcher=(async(_url:unknown,init?:RequestInit)=>{
      expect(init?.redirect).toBe("manual");
      const {method}=JSON.parse(String(init?.body)) as {method:string};
      methods.push(method);
      const value=method==="eth_chainId"?s.chainId:
        method==="eth_getTransactionReceipt"?receipt:
        method==="eth_getBlockByNumber"?{hash:BLOCK,number:"0x64"}:
        method==="eth_blockNumber"?"0x"+head.toString(16):null;
      return Response.json({jsonrpc:"2.0",id:1,result:value});
    }) as typeof fetch;
    await expect(confirmNoCardNativeUsdcChainSettlement({
      quote,transaction:TX,payer:PAYER,fetcher,
    })).rejects.toThrow("NO_CARD_CHAIN_CONFIRMATIONS_INSUFFICIENT");
    expect(methods).toEqual([
      "eth_chainId","eth_getTransactionReceipt","eth_getBlockByNumber","eth_blockNumber",
    ]);
    methods.length=0;
    head++; // exactly required confirmations, no extra block
    const proof=await confirmNoCardNativeUsdcChainSettlement({
      quote,transaction:TX,payer:PAYER,fetcher,
    });
    expect(proof.confirmed).toBe(true);
    expect(proof.network).toBe(s.network);
    expect(methods).toHaveLength(4);
  });
});
