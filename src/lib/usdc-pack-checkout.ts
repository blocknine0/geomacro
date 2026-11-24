export const USDC_PACK_RECIPIENT="0x95ba71d21c41bda8bba9533f96d25f793e4137b5" as const;

export function encodeUsdcPackTransferCalldata(amountUsd:number){
 if(!Number.isSafeInteger(amountUsd)||amountUsd<=0)throw new Error("USDC_PACK_AMOUNT_INVALID");
 const amount=BigInt(amountUsd)*1_000_000n;
 return "0xa9059cbb"+USDC_PACK_RECIPIENT.slice(2).toLowerCase().padStart(64,"0")+
  amount.toString(16).padStart(64,"0");
}
