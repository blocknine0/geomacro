import { ethers } from "ethers";

const { ARC_RPC_URL, OWNER_PRIVATE_KEY, CONTRACT_ADDRESS } = process.env;
if (!ARC_RPC_URL || !OWNER_PRIVATE_KEY || !CONTRACT_ADDRESS) {
  throw new Error("Missing ARC_RPC_URL, OWNER_PRIVATE_KEY, or CONTRACT_ADDRESS");
}
const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
const signer = new ethers.Wallet(OWNER_PRIVATE_KEY, provider);
const arena = new ethers.Contract(CONTRACT_ADDRESS, [
  "function initializeFixedOddsV3() external",
  "function fixedOddsEnabled() view returns (bool)",
  "function winnerFeeBps() view returns (uint256)",
  "function lossTreasuryBps() view returns (uint256)",
  "function FIXED_PROFIT_BPS() view returns (uint256)",
], signer);

if (await arena.fixedOddsEnabled()) {
  console.log("Fixed-odds model already initialized; no transaction sent.");
} else {
  const tx = await arena.initializeFixedOddsV3();
  console.log("initializeFixedOddsV3 tx:", tx.hash);
  await tx.wait();
}
console.log({
  fixedOddsEnabled: await arena.fixedOddsEnabled(),
  fixedProfitBps: Number(await arena.FIXED_PROFIT_BPS()),
  winnerFeeBps: Number(await arena.winnerFeeBps()),
  lossTreasuryBps: Number(await arena.lossTreasuryBps()),
});
