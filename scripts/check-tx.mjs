import { JsonRpcProvider } from "ethers";

const RPC = "https://rpc.testnet.arc.network/";
const TX_HASH = "0x752baa21c04fda505369764788ed0c27014933fdcace7597069509d9c204b5fa";

const provider = new JsonRpcProvider(RPC);

console.log("Checking tx:", TX_HASH);
console.log("---");

try {
  const receipt = await provider.getTransactionReceipt(TX_HASH);
  if (!receipt) {
    console.log("NOT FOUND — transaction was never mined (likely never broadcast successfully).");
  } else {
    console.log("FOUND!");
    console.log("  status:", receipt.status === 1 ? "SUCCESS ✅" : "FAILED ❌");
    console.log("  blockNumber:", receipt.blockNumber);
    console.log("  gasUsed:", receipt.gasUsed.toString());
    console.log("  from:", receipt.from);
    console.log("  to:", receipt.to);
  }
} catch (e) {
  console.log("Error checking receipt:", e.message);
}

try {
  const tx = await provider.getTransaction(TX_HASH);
  if (tx) {
    console.log("---");
    console.log("Transaction details:");
    console.log("  value:", tx.value.toString());
    console.log("  blockNumber:", tx.blockNumber);
  } else {
    console.log("getTransaction: not found either.");
  }
} catch (e) {
  console.log("Error checking tx:", e.message);
}
