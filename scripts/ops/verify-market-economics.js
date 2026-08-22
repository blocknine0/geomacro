import { ethers } from "ethers";

const { ARC_RPC_URL, CONTRACT_ADDRESS, MARKET_ID, SAMPLE_STAKE_USDC = "10" } = process.env;
if (!ARC_RPC_URL || !CONTRACT_ADDRESS) throw new Error("Missing ARC_RPC_URL or CONTRACT_ADDRESS");
const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
const arena = new ethers.Contract(CONTRACT_ADDRESS, [
  "function fixedOddsEnabled() view returns (bool)",
  "function FIXED_PROFIT_BPS() view returns (uint256)",
  "function winnerFeeBps() view returns (uint256)",
  "function lossTreasuryBps() view returns (uint256)",
  "function liquidityReserve() view returns (uint256)",
  "function totalReservedLiquidity() view returns (uint256)",
  "function availableLiquidityReserve() view returns (uint256)",
  "function quoteFixedPayout(uint256) view returns (uint256 principal,uint256 grossProfit,uint256 winnerFee,uint256 netPayout)",
  "function fixedOddsMarket(string) view returns (bool)",
  "function marketReserveRequirement(string) view returns (uint256)",
], provider);
const stake = ethers.parseUnits(SAMPLE_STAKE_USDC, 18);
const q = await arena.quoteFixedPayout(stake);
const out = {
  fixedOddsEnabled: await arena.fixedOddsEnabled(),
  fixedProfitPct: Number(await arena.FIXED_PROFIT_BPS()) / 100,
  winnerFeePctOfProfit: Number(await arena.winnerFeeBps()) / 100,
  lossTreasuryPct: Number(await arena.lossTreasuryBps()) / 100,
  sampleStake: SAMPLE_STAKE_USDC,
  principal: ethers.formatUnits(q.principal, 18),
  grossProfit: ethers.formatUnits(q.grossProfit, 18),
  winnerFee: ethers.formatUnits(q.winnerFee, 18),
  netPayout: ethers.formatUnits(q.netPayout, 18),
  liquidityReserve: ethers.formatUnits(await arena.liquidityReserve(), 18),
  reservedLiquidity: ethers.formatUnits(await arena.totalReservedLiquidity(), 18),
  availableLiquidity: ethers.formatUnits(await arena.availableLiquidityReserve(), 18),
};
if (MARKET_ID) {
  out.marketId = MARKET_ID;
  out.fixedOddsMarket = await arena.fixedOddsMarket(MARKET_ID);
  out.marketReserveRequirement = ethers.formatUnits(await arena.marketReserveRequirement(MARKET_ID), 18);
}
console.log(out);
