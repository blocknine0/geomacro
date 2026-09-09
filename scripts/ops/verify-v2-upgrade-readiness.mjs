import {
  Contract,
  JsonRpcProvider,
  ZeroAddress,
  getAddress,
  isAddress,
} from "ethers";

const EXPECTED_CHAIN_ID = 5042002n;
const EXPECTED_PROXY = "0x2F874FB07084a22D2bB314D0762Af57Cb1856868";

function requiredEnv(name) {
  const value = process.env[name]?.trim();
  if (!value) throw new Error(`${name} is required.`);
  return value;
}

function canonicalAddress(name, value) {
  if (!isAddress(value)) throw new Error(`${name} is not a valid EVM address.`);
  const address = getAddress(value);
  if (address === ZeroAddress) throw new Error(`${name} must not be the zero address.`);
  return address;
}

async function main() {
  const mode = (process.env.VERIFY_MODE || "candidate").trim();
  if (!new Set(["candidate", "execution-readiness"]).has(mode)) {
    throw new Error(`Unsupported VERIFY_MODE: ${mode}`);
  }

  const rpcUrl = requiredEnv("ARC_RPC_URL");
  const proxy = canonicalAddress("CONTRACT_ADDRESS", requiredEnv("CONTRACT_ADDRESS"));
  const candidate = canonicalAddress(
    "NEW_IMPLEMENTATION",
    requiredEnv("NEW_IMPLEMENTATION"),
  );

  if (proxy.toLowerCase() !== EXPECTED_PROXY.toLowerCase()) {
    throw new Error(
      `Unexpected proxy. Expected ${EXPECTED_PROXY}, got ${proxy}.`,
    );
  }
  if (proxy.toLowerCase() === candidate.toLowerCase()) {
    throw new Error("Implementation address cannot equal proxy address.");
  }

  const provider = new JsonRpcProvider(rpcUrl);
  const network = await provider.getNetwork();
  if (network.chainId !== EXPECTED_CHAIN_ID) {
    throw new Error(
      `Wrong network. Expected Arc Testnet ${EXPECTED_CHAIN_ID}, got ${network.chainId}.`,
    );
  }

  const [proxyCode, candidateCode] = await Promise.all([
    provider.getCode(proxy),
    provider.getCode(candidate),
  ]);
  if (proxyCode === "0x") throw new Error("Proxy has no deployed bytecode.");
  if (candidateCode === "0x") {
    throw new Error("Candidate implementation has no deployed bytecode.");
  }

  const arena = new Contract(
    proxy,
    [
      "function owner() view returns (address)",
      "function treasury() view returns (address)",
      "function guardian() view returns (address)",
      "function pendingImplementation() view returns (address)",
      "function upgradeUnlockTime() view returns (uint256)",
      "function upgradeApprovalCount() view returns (uint256)",
      "function winnerFeeBps() view returns (uint256)",
    ],
    provider,
  );

  const [owner, treasury, guardian, pending, unlock, approvals, winnerFeeBps] =
    await Promise.all([
      arena.owner(),
      arena.treasury(),
      arena.guardian(),
      arena.pendingImplementation(),
      arena.upgradeUnlockTime(),
      arena.upgradeApprovalCount(),
      arena.winnerFeeBps(),
    ]);

  canonicalAddress("proxy owner", owner);
  canonicalAddress("proxy treasury", treasury);
  canonicalAddress("proxy guardian", guardian);

  const latest = await provider.getBlock("latest");
  if (!latest) throw new Error("Unable to read the latest Arc Testnet block.");

  if (mode === "execution-readiness") {
    if (pending.toLowerCase() !== candidate.toLowerCase()) {
      throw new Error(
        `Pending implementation mismatch. Expected ${candidate}, got ${pending}.`,
      );
    }
    if (approvals < 2n) {
      throw new Error(`At least two treasury approvals are required; got ${approvals}.`);
    }
    if (unlock === 0n) throw new Error("Upgrade timelock has not been set.");
    if (BigInt(latest.timestamp) < unlock) {
      throw new Error(
        `Upgrade timelock has not elapsed. unlock=${unlock} latest=${latest.timestamp}.`,
      );
    }
  }

  console.log("Arc V2 upgrade verification passed.");
  console.log(`mode=${mode}`);
  console.log(`chain_id=${network.chainId}`);
  console.log(`proxy=${proxy}`);
  console.log(`candidate=${candidate}`);
  console.log(`candidate_runtime_bytes=${(candidateCode.length - 2) / 2}`);
  console.log(`pending_implementation=${pending}`);
  console.log(`approval_count=${approvals}`);
  console.log(`unlock_timestamp=${unlock}`);
  console.log(`latest_block_timestamp=${latest.timestamp}`);
  console.log(`legacy_winner_fee_bps=${winnerFeeBps}`);
  console.log("No transaction was signed or submitted by this verifier.");
}

main().catch((error) => {
  console.error(
    "V2 upgrade verification failed:",
    error instanceof Error ? error.message : String(error),
  );
  process.exitCode = 1;
});
