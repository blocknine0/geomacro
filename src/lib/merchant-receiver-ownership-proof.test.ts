import {describe,expect,it} from "vitest";
import {getAddress,hashMessage,verifyMessage} from "ethers";
import approvedRecipient from "../../config/mainnet-usdc-recipient.json";

/**
 * Permanently reproducible independent EIP-191 ownership test.
 * Public signature is a wallet CONTROL proof only. It is not a transfer,
 * allowance, EIP-3009 payment, merchant activation ACK or commercial right.
 * Screenshot record: Etherscan Verified Signatures #340876 (2026-10-30).
 */
const expected="0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5";
const message=[
 "GeoMacro Merchant Wallet Ownership Verification",
 "Domain: geomacro.live",
 "Wallet: 0x95ba71d21C41bDa8bBA9533f96D25f793E4137b5",
 "Networks: Base Mainnet (8453), Polygon PoS (137)",
 "Nonce: a4d27b1c95096160bee7a1c07866057d",
 "Date: 2026-10-30",
 "Purpose: Wallet ownership proof only. No payment, transfer, approval or transaction authorization.",
].join("\n");
// Etherscan publishes signed messages; never treat this public proof as an API bearer secret.
const signature="0x4308e24a6224ec4333fbe6b5ca012c9b6372b5cf91be6644a5971b35eed5bb450c89ebbda7a24e7dc2923695dbdbad69b7a7eff06da41ccea33847155d2558421c";
describe("Owner-signed mainnet merchant address — no funds",()=>{
 it("independently recovers the exact EIP-55 merchant recipient from EIP-191 signature",()=>{
   expect(getAddress(expected)).toBe(expected);
   expect(verifyMessage(message,signature)).toBe(expected);
   expect(hashMessage(message)).toBe(
     "0x3e2c7657487ab3bee8f602a7c20a8254a016aeeae37e3bb1b29ca030e4e8389b");
 });
 it("pins the verified recipient and retains explicit no-settlement authorization",()=>{
   expect(approvedRecipient.receiver).toBe(expected);
   expect(approvedRecipient.wallet_control_verified).toBe(true);
   expect(approvedRecipient.merchant_settlement_verified).toBe(false);
   expect(approvedRecipient.ownership_proof.scheme).toBe("EIP191_PERSONAL_SIGN");
   expect(approvedRecipient.ownership_proof.recovered_address).toBe(expected);
   expect(approvedRecipient.ownership_proof.original_message_keccak256)
     .toBe(hashMessage(message));
   expect(approvedRecipient.ownership_proof.authorization_scope)
     .toBe("WALLET_OWNERSHIP_PROOF_ONLY");
   expect(approvedRecipient.ownership_proof.payment_or_transfer_authorized).toBe(false);
 });
});
