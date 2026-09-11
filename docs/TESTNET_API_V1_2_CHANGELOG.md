# Geomacro Testnet API v1.2

This document applies only to the Geomacro Testnet environment. It does not define mainnet or production pricing.

The Testnet usage cap is 500 credits per 30 days. The Testnet rate is 0.5 Testnet USDC per consumed credit. Credits are paid per API call and there is no upfront Testnet USDC activation payment. The previous interpretation of 500 credits as a prepaid 250 Testnet USDC purchase is retired.

Wallet verification provisions Testnet developer access. Developer credentials are issued as a paired API Key and API Secret. The API Secret is shown once and only its hash is stored by Geomacro.

For metered external Testnet routes, the intended flow is request → HTTP 402 quote → pay the exact Testnet USDC amount for that capability → retry the same request ID with payment proof → verified response. Settlement remains Testnet-only and non-revenue.
