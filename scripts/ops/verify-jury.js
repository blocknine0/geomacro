import "dotenv/config";
import { ethers } from "ethers";

const contractAddress = process.env.CONTRACT_ADDRESS;
const rpc = process.env.ARC_RPC_URL || "https://rpc.testnet.arc.network";
const keys = [1,2,3,4,5].map((i) => process.env[`JURY_PRIVATE_KEY_${i}`]);
if (!contractAddress) throw new Error("Missing CONTRACT_ADDRESS");
if (keys.some((k) => !k)) throw new Error("Missing one or more JURY_PRIVATE_KEY_1..5");

const provider = new ethers.JsonRpcProvider(rpc);
const contract = new ethers.Contract(contractAddress, ["function getJuryMembers() view returns (address[5])"], provider);
const configured = Array.from(await contract.getJuryMembers()).map((a) => ethers.getAddress(String(a)));
const supplied = keys.map((k) => new ethers.Wallet(k).address);

let ok = true;
console.log("5-AI jury configuration check");
for (let i = 0; i < 5; i++) {
  const match = configured[i].toLowerCase() === supplied[i].toLowerCase();
  ok &&= match;
  console.log(`Seat ${i + 1}: ${match ? "OK" : "MISMATCH"} | on-chain ${configured[i]} | secret wallet ${supplied[i]}`);
}
if (!ok) process.exit(1);
console.log("PASS: all five GitHub jury secrets match the on-chain V2 jury seats in order.");
