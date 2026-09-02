import { GoatFlowClient } from "goatflow-sdk-server";

export type GoatFlowRuntimeConfig = {
  configured: boolean;
  apiUrl: string | null;
  apiKey: string | null;
  apiSecret: string | null;
  chainId: number | null;
  tokenSymbol: string | null;
  tokenContract: string | null;
  receiveAddress: string | null;
};

function env(name: string): string | null {
  const value = process.env[name];
  return value && value.trim() ? value.trim() : null;
}

export function getGoatFlowRuntimeConfig(): GoatFlowRuntimeConfig {
  const apiUrl = env("GOATX402_API_URL");
  const apiKey = env("GOATX402_API_KEY");
  const apiSecret = env("GOATX402_API_SECRET");
  const chainIdRaw = env("GOATX402_CHAIN_ID");
  const tokenSymbol = env("GOATX402_TOKEN_SYMBOL");
  const tokenContract = env("GOATX402_TOKEN_CONTRACT");
  const receiveAddress = env("GOATX402_RECEIVE_ADDRESS");

  const chainId =
    chainIdRaw && /^\d+$/.test(chainIdRaw)
      ? Number(chainIdRaw)
      : null;

  const configured = Boolean(
    apiUrl &&
      apiKey &&
      apiSecret &&
      chainId &&
      Number.isSafeInteger(chainId) &&
      chainId > 0 &&
      tokenSymbol &&
      tokenContract &&
      /^0x[a-fA-F0-9]{40}$/.test(tokenContract) &&
      receiveAddress &&
      /^0x[a-fA-F0-9]{40}$/.test(receiveAddress),
  );

  return {
    configured,
    apiUrl,
    apiKey,
    apiSecret,
    chainId,
    tokenSymbol,
    tokenContract,
    receiveAddress,
  };
}

export function getGoatFlowClient(): GoatFlowClient | null {
  const config = getGoatFlowRuntimeConfig();
  if (
    !config.configured ||
    !config.apiUrl ||
    !config.apiKey ||
    !config.apiSecret
  ) {
    return null;
  }

  return new GoatFlowClient({
    baseUrl: config.apiUrl,
    apiKey: config.apiKey,
    apiSecret: config.apiSecret,
  });
}
