import {describe,it,expect} from "vitest";
import {resolveSharedUsdcReceiver,assertSharedUsdcReceiver} from "./shared-usdc-receiver.server";
describe("single mainnet merchant receiving address",()=>{
 const a="0x1111111111111111111111111111111111111111";
 const b="0x2222222222222222222222222222222222222222";
 it("accepts the same receiver across native three-chain and existing provider settings",()=>{
  const env={GEOMACRO_USDC_RECEIVER:a,COINBASE_X402_PAY_TO:a,CIRCLE_X402_SELLER_ADDRESS:a};
  expect(resolveSharedUsdcReceiver(env)).toBe(a);
  expect(assertSharedUsdcReceiver(a,env)).toBe(a);
  expect(resolveSharedUsdcReceiver({COINBASE_X402_PAY_TO:a})).toBe(a);
 });
 it("blocks recipient drift before any payment offer",()=>{
  expect(()=>resolveSharedUsdcReceiver({GEOMACRO_USDC_RECEIVER:a,CIRCLE_X402_SELLER_ADDRESS:b})).toThrow("MISMATCH");
  expect(()=>assertSharedUsdcReceiver(b,{GEOMACRO_USDC_RECEIVER:a})).toThrow("MISMATCH");
  for(const value of [undefined,"","0x"+"0".repeat(40),"0xshort","private-key"])
   expect(()=>resolveSharedUsdcReceiver({GEOMACRO_USDC_RECEIVER:value})).toThrow();
 });
});
