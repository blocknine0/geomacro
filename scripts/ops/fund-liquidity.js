import { ethers } from "ethers";

const { ARC_RPC_URL, LIQUIDITY_PRIVATE_KEY, CONTRACT_ADDRESS, LIQUIDITY_AMOUNT_USDC } = process.env;
if (!ARC_RPC_URL || !LIQUIDITY_PRIVATE_KEY || !CONTRACT_ADDRESS || !LIQUIDITY_AMOUNT_USDC) {
  throw new Error("Missing ARC_RPC_URL, LIQUIDITY_PRIVATE_KEY, CONTRACT_ADDRESS, or LIQUIDITY_AMOUNT_USDC");
}
const provider = new ethers.JsonRpcProvider(ARC_RPC_URL);
const signer = new ethers.Wallet(LIQUIDITY_PRIVATE_KEY, provider);
const arena = new ethers.Contract(CONTRACT_ADDRESS, [
  "function provideLiquidity() payable returns (uint256)",
  "function liquidityReserve() view returns (uint256)",
  "function totalReservedLiquidity() view returns (uint256)",
  "function availableLiquidityReserve() view returns (uint256)",
], signer);
const amount = ethers.parseUnits(LIQUIDITY_AMOUNT_USDC, 18);
const tx = await arena.provideLiquidity({ value: amount });
console.log("provideLiquidity tx:", tx.hash);
await tx.wait();
console.log({
  liquidityReserve: ethers.formatUnits(await arena.liquidityReserve(), 18),
  totalReservedLiquidity: ethers.formatUnits(await arena.totalReservedLiquidity(), 18),
  availableLiquidityReserve: ethers.formatUnits(await arena.availableLiquidityReserve(), 18),
});
