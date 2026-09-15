# Coinbase x402 Base mainnet readiness

Status: PREPARED, REAL-FUNDS GATE LOCKED.

## Approved production configuration

- Network: Base mainnet (`eip155:8453`)
- Settlement asset: canonical USDC on Base
- Launch price: `0.02 USDC` per paid intelligence call (`20000` atomic units)
- Risk Gate output never authorizes execution: `execution_authorized=false`

## Activation boundary

Production must fail closed unless `COINBASE_X402_MAINNET_ACK` exactly equals `I_ACCEPT_REAL_USDC` and all required production configuration is present. Keep that acknowledgement blank while preparing mainnet. Production credentials, a receiver address, and the approved price do not by themselves authorize real-USDC settlement.

## Testnet evidence boundary

The successful Base Sepolia acceptance evidence remains historical testnet evidence at `0.05` test USDC. Do not rewrite it to the production price and do not count it as commercial revenue.

## Final owner-controlled inputs before activation

- dedicated Base mainnet receiver address with ownership and recovery verified
- production Coinbase Developer Platform credentials stored server-side
- production deployment environment configured
- settlement monitoring and reconciliation owner assigned
- commercial data/source licensing confirmed for paid responses
- exact deployment commit has green Product CI, CodeQL/security, and x402 acceptance/readiness checks
- explicit owner authorization to set `COINBASE_X402_MAINNET_ACK=I_ACCEPT_REAL_USDC`

Until the final acknowledgement is explicitly authorized, Base mainnet settlement remains disabled.
