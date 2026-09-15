import {
  JsonRpcProvider,
  ZeroAddress,
  getAddress,
  isAddress,
} from "ethers";

const EXPECTED_CHAIN_ID = 5042002n;
const RPC_ENV_NAMES = [
  "ARC_RPC_URL",
  "ARC_RPC_URL_2",
  "ARC_RPC_URL_3",
  "ARC_RPC_URL_4",
  "ARC_RPC_URL_5",
];
const VERIFY_TIMEOUT_MS = 12_000;

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required for the Arc Testnet safety preflight.`);
  }
  return value;
}

function withTimeout(promise, label) {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(
      () => reject(new Error(`${label} timed out after ${VERIFY_TIMEOUT_MS}ms`)),
      VERIFY_TIMEOUT_MS,
    );
  });

  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

async function verifyRpcTarget({ envName, rpcUrl, contractAddress }) {
  const provider = new JsonRpcProvider(rpcUrl);
  const network = await withTimeout(provider.getNetwork(), `${envName} network check`);

  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `${envName} points to the wrong network. Expected Arc Testnet chain ${EXPECTED_CHAIN_ID}, got ${network.chainId}.`,
    );
  }

  const code = await withTimeout(
    provider.getCode(contractAddress),
    `${envName} contract bytecode check`,
  );

  if (code === "0x") {
    throw new Error(
      `${envName} cannot see CONTRACT_ADDRESS bytecode on Arc Testnet. Refusing to continue.`,
    );
  }

  return network.chainId;
}

async function main() {
  requiredEnv("ARC_RPC_URL");
  const contractInput = requiredEnv("CONTRACT_ADDRESS");

  if (!isAddress(contractInput)) {
    throw new Error("CONTRACT_ADDRESS is not a valid EVM address.");
  }

  const contractAddress = getAddress(contractInput);
  if (contractAddress === ZeroAddress) {
    throw new Error("CONTRACT_ADDRESS must not be the zero address.");
  }

  const configured = RPC_ENV_NAMES
    .map((envName) => ({ envName, rpcUrl: process.env[envName]?.trim() }))
    .filter((entry) => Boolean(entry.rpcUrl));

  if (configured.length === 0) {
    throw new Error("At least ARC_RPC_URL must be configured for the Arc Testnet safety preflight.");
  }

  const seen = new Set();
  const uniqueTargets = configured.filter(({ rpcUrl }) => {
    if (seen.has(rpcUrl)) return false;
    seen.add(rpcUrl);
    return true;
  });

  for (const target of uniqueTargets) {
    const chainId = await verifyRpcTarget({
      envName: target.envName,
      rpcUrl: target.rpcUrl,
      contractAddress,
    });
    console.log(
      `Arc Testnet target verified: ${target.envName} chain=${chainId} contract=${contractAddress}`,
    );
  }

  console.log(
    `Prediction-market safety boundary verified across ${uniqueTargets.length} configured RPC target(s). Mainnet is not permitted.`,
  );
}

main().catch((error) => {
  console.error(
    "Arc Testnet target preflight failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
