import { JsonRpcProvider, Contract, parseUnits } from "ethers";

const RPC = "https://rpc.testnet.arc.network/";
const CONTRACT = "0xC026fDFC40Dcd8F07b6ecFA21b2BF8400Db0FADe";
const MARKET_ID = "mkt_333dee7c-f349-4caa-ad5a-533930cb6d33";
const WALLET = "0x91557b1FfB1a483D2446b46816d63CdF3720704f"; // from the failing tx

const ABI = [
  "function stake(string marketId, uint8 side) payable",
];

const provider = new JsonRpcProvider(RPC);
const contract = new Contract(CONTRACT, ABI, provider);

const amount = parseUnits("1", 18); // 1 USDC, 18 decimals

console.log("Simulating stake() call...");
console.log("  marketId:", MARKET_ID);
console.log("  side: 1 (HAWK)");
console.log("  value:", amount.toString());
console.log("  from:", WALLET);
console.log("---");

try {
  const result = await contract.stake.staticCall(MARKET_ID, 1, {
    value: amount,
    from: WALLET,
  });
  console.log("SUCCESS (would not revert):", result);
} catch (e) {
  console.log("REVERTED.");
  console.log("Message:", e.message);
  console.log("Reason:", e.reason);
  console.log("Code:", e.code);
  console.log("ShortMessage:", e.shortMessage);
  if (e.data) console.log("Raw data:", e.data);
  if (e.info) console.log("Info:", JSON.stringify(e.info, null, 2));
}
