import "dotenv/config";
import { ethers } from "ethers";

const rpc = process.env.ARC_RPC_URL;
const address = process.env.CONTRACT_ADDRESS;
if (!rpc || !address) throw new Error("ARC_RPC_URL and CONTRACT_ADDRESS are required");

const provider = new ethers.JsonRpcProvider(rpc);
const abi = [
  "function fixedOddsEnabled() view returns (bool)",
  "function winnerFeeBps() view returns (uint256)",
  "function fixedOddsWinnerFeeBps() view returns (uint256)",
  "function lossTreasuryBps() view returns (uint256)",
  "function liquidityReserve() view returns (uint256)",
  "function totalReservedLiquidity() view returns (uint256)",
  "function availableLiquidityReserve() view returns (uint256)",
  "function quoteFixedPayout(uint256) view returns (uint256,uint256,uint256,uint256)"
];
const arena = new ethers.Contract(address, abi, provider);

const [enabled, winnerFeeBps, fixedOddsWinnerFeeBps, lossTreasuryBps, reserve, reserved, available, quote] = await Promise.all([
  arena.fixedOddsEnabled(), arena.winnerFeeBps(), arena.fixedOddsWinnerFeeBps(), arena.lossTreasuryBps(), arena.liquidityReserve(),
  arena.totalReservedLiquidity(), arena.availableLiquidityReserve(), arena.quoteFixedPayout(ethers.parseEther("1"))
]);

console.log(JSON.stringify({
  contract: address,
  fixedOddsEnabled: enabled,
  winnerFeeBps: Number(winnerFeeBps),
  fixedOddsWinnerFeeBps: Number(fixedOddsWinnerFeeBps),
  lossTreasuryBps: Number(lossTreasuryBps),
  liquidityReserve: reserve.toString(),
  totalReservedLiquidity: reserved.toString(),
  availableLiquidityReserve: available.toString(),
  oneUnitQuote: {
    principal: quote[0].toString(), grossProfit: quote[1].toString(), winnerFee: quote[2].toString(), netPayout: quote[3].toString()
  }
}, null, 2));

if (Number(winnerFeeBps) !== 200) throw new Error(`legacy winnerFeeBps expected 200, got ${winnerFeeBps}`);
if (Number(fixedOddsWinnerFeeBps) !== 150) throw new Error(`fixedOddsWinnerFeeBps expected 150, got ${fixedOddsWinnerFeeBps}`);
if (Number(lossTreasuryBps) !== 500) throw new Error(`lossTreasuryBps expected 500, got ${lossTreasuryBps}`);
if (!enabled) throw new Error("fixed odds are not enabled");
