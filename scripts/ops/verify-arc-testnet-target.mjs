import {
  JsonRpcProvider,
  ZeroAddress,
  getAddress,
  isAddress,
} from "ethers";

const EXPECTED_CHAIN_ID = 5042002n;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the Arc Testnet safety preflight.`);
  }
  return value;
}

async function main() {
  const rpcUrl = requiredEnv("ARC_RPC_URL");
  const contractInput = requiredEnv("CONTRACT_ADDRESS");

  if (!isAddress(contractInput)) {
    throw new Error("CONTRACT_ADDRESS is not a valid EVM address.");
  }

  const contractAddress = getAddress(contractInput);
  if (contractAddress === ZeroAddress) {
    throw new Error("CONTRACT_ADDRESS must not be the zero address.");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();

  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Wrong network. Expected Arc Testnet chain ${EXPECTED_CHAIN_ID}, got ${network.chainId}.`,
    );
  }

  const code = await provider.getCode(contractAddress);
  if (code === "0x") {
    throw new Error("CONTRACT_ADDRESS has no deployed bytecode on Arc Testnet.");
  }

  console.log(
    `Arc Testnet target verified: chain=${network.chainId} contract=${contractAddress}`,
  );
}

main().catch((error) => {
  console.error(
    "Arc Testnet target preflight failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
