# Production Website Scope

Customer-facing production surfaces are the Geomacro intelligence, risk, agent/API, institutional and contact experiences. Testnet and experimental routes remain historical/technical proof and are not production-serving dependencies.

Production hardening must prioritize:

- reliable public reads from verified B2 snapshots;
- same-origin browser/server boundaries;
- explicit failure states instead of indefinite loading;
- no direct browser Supabase dependency;
- clear separation between current production product surfaces and technical proof;
- exact-deployment verification and recurring live smoke tests.

Moving toward production does not itself authorize real-money activation. Payment/mainnet activation remains governed by its separate launch gates and owner authorization.
