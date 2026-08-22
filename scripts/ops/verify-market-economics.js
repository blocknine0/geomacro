import { ethers } from "ethers";

const {
  ARC_RPC_URL,
  CONTRACT_ADDRESS,
  MARKET_ID,
  SAMPLE_STAKE_USDC = "10",
} = process.env;

if (!ARC_RPC_URL || !CONTRACT_ADDRESS) {
  throw new Error("Missing ARC_RPC_URL or CONTRACT_ADDRESS");
}

const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);

const legacyAbi = [
  "function winnerFeeBps() view returns (uint256)",
  "function getJuryMembers() view returns (address[5])",
];

const fixedOddsAbi = [
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
];

const legacy = new ethers.Contract(CONTRACT_ADDRESS, legacyAbi, provider);

try {
  await legacy.winnerFeeBps();
} catch {
  throw new Error(
    `Proxy ${CONTRACT_ADDRESS} is not responding as AgentArenaV2. Check ARC_RPC_URL and CONTRACT_ADDRESS.`
  );
}

const arena = new ethers.Contract(CONTRACT_ADDRESS, fixedOddsAbi, provider);

let fixedOddsSupported = true;

try {
  await arena.fixedOddsEnabled();
  await arena.FIXED_PROFIT_BPS();
  await arena.lossTreasuryBps();
  await arena.quoteFixedPayout(ethers.parseUnits(SAMPLE_STAKE_USDC, 18));
} catch {
  fixedOddsSupported = false;
}

if (!fixedOddsSupported) {
  console.log({
    status: "NEEDS_UPGRADE",
    proxy: CONTRACT_ADDRESS,
    message:
      "The proxy is live, but its current implementation does not expose the fixed-odds V3 interface yet.",
    nextSteps: [
      "Deploy the new AgentArenaV2 implementation.",
      "Run the existing 48h timelocked UUPS upgrade flow.",
      "After upgrade, call initializeFixedOddsV3() exactly once.",
      "Fund liquidity before enabling new fixed-odds markets.",
      "Re-run economics:verify.",
    ],
  });

  process.exit(2);
}

const stake = ethers.parseUnits(SAMPLE_STAKE_USDC, 18);
const q = await arena.quoteFixedPayout(stake);

const fixedOddsEnabled = await arena.fixedOddsEnabled();
const fixedProfitBps = Number(await arena.FIXED_PROFIT_BPS());
const winnerFeeBps = Number(await arena.winnerFeeBps());
const lossTreasuryBps = Number(await arena.lossTreasuryBps());

const out = {
  status: fixedOddsEnabled ? "READY" : "NEEDS_INITIALIZATION",
  proxy: CONTRACT_ADDRESS,

  fixedOddsEnabled,

  fixedProfitBps,
  fixedProfitPct: fixedProfitBps / 100,

  winnerFeeBps,
  winnerFeePctOfProfit: winnerFeeBps / 100,

  lossTreasuryBps,
  lossTreasuryPct: lossTreasuryBps / 100,

  sampleStake: SAMPLE_STAKE_USDC,
  principal: ethers.formatUnits(q.principal, 18),
  grossProfit: ethers.formatUnits(q.grossProfit, 18),
  winnerFee: ethers.formatUnits(q.winnerFee, 18),
  netPayout: ethers.formatUnits(q.netPayout, 18),

  liquidityReserve: ethers.formatUnits(await arena.liquidityReserve(), 18),
  reservedLiquidity: ethers.formatUnits(await arena.totalReservedLiquidity(), 18),
  availableLiquidity: ethers.formatUnits(
    await arena.availableLiquidityReserve(),
    18
  ),
};

if (MARKET_ID) {
  out.marketId = MARKET_ID;
  out.fixedOddsMarket = await arena.fixedOddsMarket(MARKET_ID);
  out.marketReserveRequirement = ethers.formatUnits(
    await arena.marketReserveRequirement(MARKET_ID),
    18
  );
}

console.log(out);

const expected =
  fixedProfitBps === 10000 &&
  winnerFeeBps === 150 &&
  lossTreasuryBps === 500;

if (!expected) {
  console.error(
    "FAIL: economics values do not match the intended Geomacro configuration."
  );
  process.exit(3);
}

if (!fixedOddsEnabled) {
  console.error(
    "NEEDS_INITIALIZATION: implementation is upgraded but initializeFixedOddsV3() has not been run."
  );
  process.exit(4);
}

console.log("PASS: V2 fixed-odds economics configuration is correct.");
