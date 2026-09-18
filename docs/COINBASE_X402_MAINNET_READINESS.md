# Coinbase x402 Base mainnet readiness

Status: PREPARED, REAL-FUNDS GATE LOCKED.

## Approved production configuration

- Network: Base mainnet (`eip155:8453`)
- Settlement asset: canonical USDC on Base
- Launch price: `0.02 USDC` per successful paid intelligence delivery for the first 10,000 deliveries (`20000` atomic units); later reference price `0.10 USDC` after adoption evidence
- Risk Gate output never authorizes execution: `execution_authorized=false`

## Activation boundary

Coinbase production now requires **two independent owner-controlled acknowledgements**:

1. `GEOMACRO_COMMERCIAL_LAUNCH_ACK=I_AUTHORIZE_COORDINATED_GEOMACRO_LAUNCH`
2. `COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC`

The global acknowledgement coordinates the official Geomacro commercial launch across payment/distribution rails. The Coinbase-specific acknowledgement authorizes this provider only. Neither value may substitute for the other.

Keep both acknowledgements blank throughout pre-launch preparation and acceptance testing. Production credentials, a receiver address, the approved price, or a provider-specific production setting do not by themselves authorize real-USDC settlement.

## Testnet evidence boundary

The successful Base Sepolia acceptance evidence remains historical testnet evidence at `0.05` test USDC. Do not rewrite it to the production price and do not count it as commercial revenue.

## Final owner-controlled inputs before activation

- dedicated Base mainnet receiver address with ownership and recovery verified
- production Coinbase Developer Platform credentials stored server-side
- production deployment environment configured but not activated
- settlement monitoring and reconciliation owner assigned
- commercial data/source licensing confirmed for paid responses
- exact frozen release-candidate commit has green Product CI, CodeQL/security, schema, source-rights, resilience, and x402 acceptance/readiness checks
- the coordinated launch manifest records every enabled provider/marketplace and its exact tested release candidate
- explicit owner authorization to set the global coordinated-launch acknowledgement
- explicit owner authorization to set `COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC`

Until **both** acknowledgements are explicitly authorized during the coordinated official launch, Base mainnet settlement remains disabled.
