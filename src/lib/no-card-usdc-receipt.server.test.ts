import {describe,it,expect} from "vitest";
import {validateNoCardNativeUsdcReceipt} from "./no-card-usdc-receipt.server";

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
