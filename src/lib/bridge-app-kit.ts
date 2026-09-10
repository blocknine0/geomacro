import { AppKit, BridgeChain } from "@circle-fin/app-kit";
import { createEthersAdapterFromProvider } from "@circle-fin/adapter-ethers-v6";
import { parseUnits, type Eip1193Provider } from "ethers";
import { TREASURY_ADDRESS, computeProtocolFeeWei, formatFeeUsdc } from "./protocol-fee";

const kit = new AppKit();

export const BRIDGE_SOURCE_CHAINS = {
  ethSepolia: { label: "Ethereum Sepolia", chain: BridgeChain.Ethereum_Sepolia },
  baseSepolia: { label: "Base Sepolia", chain: BridgeChain.Base_Sepolia },
  avalancheFuji: { label: "Avalanche Fuji", chain: BridgeChain.Avalanche_Fuji },
  arbitrumSepolia: { label: "Arbitrum Sepolia", chain: BridgeChain.Arbitrum_Sepolia },
  opSepolia: { label: "OP Sepolia", chain: BridgeChain.Optimism_Sepolia },
  polygonAmoy: { label: "Polygon Amoy", chain: BridgeChain.Polygon_Amoy_Testnet },
  unichainSepolia: { label: "Unichain Sepolia", chain: BridgeChain.Unichain_Sepolia },
  lineaSepolia: { label: "Linea Sepolia", chain: BridgeChain.Linea_Sepolia },
} as const;

export type BridgeSourceKey = keyof typeof BRIDGE_SOURCE_CHAINS;

export type BridgeFeeEntry = {
  token: string;
  amount: string | null;
  type: string;
};

export type BridgeEstimate = {
  geomacroFeeUsdc: string;
  fees: BridgeFeeEntry[];
};

export type BridgeExecutionResult = {
  state: "pending" | "success" | "error";
  amount: string;
  burnTxHash?: string;
  mintTxHash?: string;
  steps: Array<{
    name: string;
    state: string;
    txHash?: string;
    explorerUrl?: string;
    batched?: boolean;
    forwarded?: boolean;
    errorMessage?: string;
  }>;
};

function getEthereumProvider(): Eip1193Provider {
  const provider = typeof window !== "undefined"
    ? (window.ethereum as Eip1193Provider | undefined)
    : undefined;
  if (!provider) throw new Error("No EVM wallet detected. Connect a browser wallet first.");
  return provider;
}

function feeForAmount(amount: string): string {
  if (!amount || Number(amount) <= 0) throw new Error("Enter an amount greater than 0.");
  return formatFeeUsdc(computeProtocolFeeWei(parseUnits(amount, 18)));
}

async function buildParams(sourceKey: BridgeSourceKey, amount: string, recipientAddress: string) {
  const provider = getEthereumProvider();
  const adapter = await createEthersAdapterFromProvider({ provider });
  const source = BRIDGE_SOURCE_CHAINS[sourceKey];
  if (!source) throw new Error("Unsupported bridge source chain.");
  const geomacroFeeUsdc = feeForAmount(amount);

  return {
    geomacroFeeUsdc,
    params: {
      from: { adapter, chain: source.chain },
      to: {
        chain: BridgeChain.Arc_Testnet,
        recipientAddress,
        useForwarder: true,
      },
      token: "USDC" as const,
      amount,
      config: {
        transferSpeed: "FAST" as const,
        batchTransactions: true,
        customFee: {
          value: geomacroFeeUsdc,
          recipientAddress: TREASURY_ADDRESS,
        },
      },
    },
  };
}

export async function estimateBridgeToArc(
  sourceKey: BridgeSourceKey,
  amount: string,
  recipientAddress: string,
): Promise<BridgeEstimate> {
  const { geomacroFeeUsdc, params } = await buildParams(sourceKey, amount, recipientAddress);
  const estimate = await kit.estimateBridge(params);
  const fees = (estimate.fees ?? []).map((fee) => ({
    token: String(fee.token ?? "USDC"),
    amount: fee.amount == null ? null : String(fee.amount),
    type: String(fee.type ?? "provider"),
  }));
  return { geomacroFeeUsdc, fees };
}

export async function executeBridgeToArc(
  sourceKey: BridgeSourceKey,
  amount: string,
  recipientAddress: string,
): Promise<BridgeExecutionResult> {
  const { params } = await buildParams(sourceKey, amount, recipientAddress);
  const result = await kit.bridge(params);
  const steps = result.steps.map((step) => ({
    name: step.name,
    state: step.state,
    txHash: step.txHash,
    explorerUrl: step.explorerUrl,
    batched: step.batched,
    forwarded: step.forwarded,
    errorMessage: step.errorMessage,
  }));
  const burnTxHash = steps.find((step) => step.name === "burn")?.txHash;
  const mintTxHash = steps.find((step) => step.name === "mint")?.txHash;
  return {
    state: result.state,
    amount: result.amount,
    burnTxHash,
    mintTxHash,
    steps,
  };
}
