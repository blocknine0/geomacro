import { JsonRpcProvider, Contract } from "ethers";

const RPC = "https://rpc.testnet.arc.network/";
const CONTRACT = "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const MARKET_ID = "mkt_333dee7c-f349-4caa-ad5a-533930cb6d33";

const ABI = [
  "function getMarket(string marketId) view returns (uint8 status, uint256 hawkTotal, uint256 doveTotal, bool exists)",
  "function getMarketFullDetails(string marketId) view returns (uint8 status, uint8 winner, uint8 tentativeWinner, uint256 stakingEndTime, uint256 resolutionTime, uint256 aiResolutionTime, address disputer)",
];

const provider = new JsonRpcProvider(RPC);
const contract = new Contract(CONTRACT, ABI, provider);

console.log("Querying market:", MARKET_ID);
console.log("Current time:", new Date().toISOString(), "/ unix:", Math.floor(Date.now() / 1000));
console.log("---");

try {
  const result = await contract.getMarket(MARKET_ID);
  console.log("getMarket():");
  console.log("  status:", result[0].toString());
  console.log("  hawkTotal:", result[1].toString());
  console.log("  doveTotal:", result[2].toString());
  console.log("  exists:", result[3]);
} catch (e) {
  console.log("getMarket() FAILED:", e.message);
}

console.log("---");

try {
  const r = await contract.getMarketFullDetails(MARKET_ID);
  console.log("getMarketFullDetails():");
  console.log("  status:", r[0].toString());
  console.log("  stakingEndTime:", r[3].toString(), "/", new Date(Number(r[3]) * 1000).toISOString());
  console.log("  resolutionTime:", r[4].toString(), "/", new Date(Number(r[4]) * 1000).toISOString());
  console.log("  stakingEndTime passed?:", Math.floor(Date.now() / 1000) > Number(r[3]));
} catch (e) {
  console.log("getMarketFullDetails() FAILED:", e.message);
}
