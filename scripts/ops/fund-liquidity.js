import "dotenv/config";
import { ethers } from "ethers";

const rpc = process.env.ARC_RPC_URL;
const address = process.env.CONTRACT_ADDRESS;
const key = process.env.LIQUIDITY_PRIVATE_KEY;
const amount = process.env.LIQUIDITY_AMOUNT;
if (!rpc || !address || !key || !amount) {
  throw new Error("ARC_RPC_URL, CONTRACT_ADDRESS, LIQUIDITY_PRIVATE_KEY and LIQUIDITY_AMOUNT are required");
}

const provider = new ethers.JsonRpcProvider(rpc);
const signer = new ethers.Wallet(key, provider);
const abi = [
  "function provideLiquidity() payable returns (uint256)",
  "function liquidityReserve() view returns (uint256)",
  "function availableLiquidityReserve() view returns (uint256)"
];
const arena = new ethers.Contract(address, abi, signer);
const value = ethers.parseEther(amount);
console.log(`Funding ${address} from ${signer.address} with ${amount} native units`);
const tx = await arena.provideLiquidity({ value });
console.log("tx:", tx.hash);
await tx.wait();
console.log("liquidityReserve:", (await arena.liquidityReserve()).toString());
console.log("availableLiquidityReserve:", (await arena.availableLiquidityReserve()).toString());
