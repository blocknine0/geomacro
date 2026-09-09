# Arena Technical-Proof Copy Follow-up

The `/arena` route is already labelled as a secondary Arc Testnet technical-proof surface at the route level. A future copy-only cleanup should further remove legacy commercial framing inside the large `ArenaSection` component without changing its market, wallet, contract, lifecycle or dispute logic.

Target copy changes only:

- describe the market surface as an experimental Arc Testnet application built on top of Geomacro intelligence;
- replace "Narrative Economy" framing with "Technical Proof · Event Markets";
- remove language such as "financializes every headline" and institutional hedging implications;
- describe Hawk/Dove briefings as opposing experimental analysis/calibration artifacts, while preserving the technical `HAWK` / `DOVE` identifiers used by current application state and contracts;
- state that test USDC settlement proves integration mechanics and is not production execution, custody or institutional hedging.

This follow-up is deliberately isolated because `src/components/sections/arena-section.tsx` contains substantial live wallet and contract behavior. A copy-only change should be applied and reviewed as a minimal patch rather than by replacing the entire file through a tooling path that cannot guarantee a narrow diff.
