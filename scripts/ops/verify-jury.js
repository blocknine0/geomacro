import "dotenv/config";
import { ethers } from "ethers";

const rpc = process.env.ARC_RPC_URL;
const address = process.env.CONTRACT_ADDRESS;
if (!rpc || !address) throw new Error("ARC_RPC_URL and CONTRACT_ADDRESS are required");
const provider = new ethers.JsonRpcProvider(rpc);
const abi = ["function getJuryMembers() view returns (address[5])"];
const arena = new ethers.Contract(address, abi, provider);
const members = await arena.getJuryMembers();
const normalized = members.map((x) => ethers.getAddress(x));
if (new Set(normalized.map((x) => x.toLowerCase())).size !== 5) throw new Error("jury contains duplicate addresses");
if (normalized.some((x) => x === ethers.ZeroAddress)) throw new Error("jury contains zero address");
console.log(JSON.stringify({ contract: address, juryMembers: normalized }, null, 2));
