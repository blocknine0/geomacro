import { JsonRpcProvider } from "ethers";

const RPC = "https://rpc.testnet.arc.network/";
const MULTICALL3 = "0xcA11bde05977b3631167028862bE2a173976CA11";

const provider = new JsonRpcProvider(RPC);
const code = await provider.getCode(MULTICALL3);

console.log("Multicall3 address:", MULTICALL3);
console.log("Code length:", code.length);
console.log("Deployed:", code !== "0x" ? "YES ✅" : "NO ❌");
