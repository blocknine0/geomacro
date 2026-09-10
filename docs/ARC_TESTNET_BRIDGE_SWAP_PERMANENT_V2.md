# Geomacro Arc Testnet Bridge & Swap permanent architecture

Status: implementation source of truth for the Arc Testnet technical-proof surface.

## Product boundary

This surface is a technical proof / Labs capability. It does not change Geomacro's intelligence-first commercial identity.

## Current Circle / Arc implementation target

Use Circle Arc App Kit as the primary bridge/swap abstraction instead of maintaining a Geomacro-specific second fee transaction.

### Bridge

- Bridge USDC on Arc Testnet using App Kit Bridge / CCTP.
- The Geomacro fee must be passed through App Kit `config.customFee` so it is collected as part of the bridge operation, not through a later `chargeProtocolFee()` transaction.
- The fee is added on top of the bridge amount, in USDC.
- Display total source debit and the complete known fee breakdown before confirmation.
- Use Standard/Fast/Forwarding behavior only where Circle officially supports it. Do not claim Fast Transfer where the source chain does not support it.
- Keep Arc Testnet as the Geomacro destination in this testnet surface for now, while allowing every officially supported App Kit testnet source that the available wallet adapters can actually execute.

### Swap

- On testnet, Swap remains Arc Testnet only because Arc is the only App Kit testnet that currently supports Swap.
- Arc Testnet token set remains USDC, EURC and cirBTC.
- The Geomacro fee must be passed through App Kit `config.customFee.percentageBps = 15` with the configured fee recipient address.
- Remove the post-swap Geomacro fee transaction. The user must never be prompted for a second Geomacro-fee transaction after a successful swap.
- Provider fees and the Geomacro custom fee must be quoted before confirmation.

## Supported testnet bridge source universe

Track Circle Arc App Kit's official testnet Bridge support as the authority. Current documented set includes:

- Ethereum Sepolia
- Base Sepolia
- Arbitrum Sepolia
- Avalanche Fuji
- OP Sepolia
- Polygon PoS Amoy
- Linea Sepolia
- Unichain Sepolia
- Codex Testnet
- EDGE Testnet
- HyperEVM Testnet
- Injective Testnet
- Ink Testnet
- Monad Testnet
- Morph Testnet
- Pharos Atlantic
- Plume Testnet
- Sei Testnet
- Solana Devnet
- Sonic Testnet
- World Chain Sepolia
- XDC Apothem
- Arc Testnet

Do not expose a chain as executable merely because Circle lists it. The UI must only enable a chain when Geomacro has the required official adapter and wallet integration wired and acceptance-tested.

## Non-EVM support

Solana Devnet is the first non-EVM browser-wallet integration target because Circle App Kit officially supports it for Bridge and provides a dedicated Solana adapter for Phantom/Solflare/Wallet Standard providers.

Other non-EVM networks must only be added when both App Kit Bridge support and a usable supported wallet adapter exist in the current SDK. Do not fake EVM-style wallet switching for non-EVM chains.

## Fee recipient

Use one dedicated public receiving address supplied by the Geomacro owner. Never request or store its private key or seed phrase.

The fee-recipient value is public configuration, but the application must fail closed for fee-enabled bridge/swap if the address is absent or invalid. The old AgentArena treasury address must not silently remain the permanent Bridge/Swap fee destination.

## Security and testing gate

Before live rollout:

1. Quote/execute parity for bridge and swap custom fees.
2. No separate Geomacro fee transaction after the primary operation.
3. Wrong fee-recipient configuration fails closed.
4. Insufficient-balance checks include bridge amount plus custom fee.
5. Every enabled source chain gets a real testnet acceptance transaction.
6. Non-EVM wallet/provider mismatch fails safely.
7. Interrupted/retry flows are idempotent and do not double charge.
8. CodeQL, Product CI and migration/schema safety remain green.
9. Full negative/security/resilience/stress evidence is retained before public launch.

## Parallel work directive

Continue the previously planned Testnet Tester registration/payment/API-key/AI-agent/social-card/dedicated-page work and remaining CodeQL cleanup in parallel. Do not make this Bridge & Swap refactor block those workstreams.