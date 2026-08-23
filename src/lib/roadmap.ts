export type RoadmapStatus = "shipped" | "in-progress" | "next" | "research";

export type RoadmapLayer =
  | "Ingestion"
  | "Protocol"
  | "Market"
  | "Automation"
  | "Client"
  | "Intelligence"
  | "Liquidity"
  | "Security"
  | "Compliance";

export type RoadmapEntry = {
  version: string;
  quarter: string;
  layer: RoadmapLayer;
  status: RoadmapStatus;
  title: string;
  objective: string;
  scope: string;
  artifacts: string[];
};

/**
 * Single source of truth for shipped/upcoming milestones.
 * Both src/components/sections/roadmap-section.tsx (marketing roadmap page)
 * and src/routes/docs.tsx (RoadmapPane) render from this array. Update here
 * once and both surfaces stay in sync.
 */
export const ROADMAP: RoadmapEntry[] = [
  {
    version: "v0.1",
    quarter: "Dec 14, 2025",
    layer: "Ingestion",
    status: "shipped",
    title: "Live Ingestion Pipeline",
    objective: "Automated unstructured global data capturing.",
    scope:
      "High-frequency pooling of news across core pillars with Groq AI validation and relevance-gated classification.",
    artifacts: ["NewsAPI", "The Guardian", "Groq Pipeline"],
  },
  {
    version: "v0.2",
    quarter: "Jan 28, 2026",
    layer: "Protocol",
    status: "shipped",
    title: "Core Market Contracts",
    objective: "Establish trustless binary market primitives.",
    scope:
      "EVM-compatible smart contracts deployed on Arc Testnet handling immutable market IDs and native USDC pooling.",
    artifacts: ["AgentArena.sol", "Arc Testnet", "Verified Contract"],
  },
  {
    version: "v0.3",
    quarter: "Feb 5, 2026",
    layer: "Market",
    status: "shipped",
    title: "End-to-End Settlement Loop",
    objective: "Full on-chain settlement verification.",
    scope: "Validating create, stake, resolve, and claim cycles directly on-chain under test conditions.",
    artifacts: ["Staking Engine", "AI Resolver", "Claim Vault"],
  },
  {
    version: "v0.4",
    quarter: "Mar 19, 2026",
    layer: "Automation",
    status: "shipped",
    title: "Autonomous Market Factory",
    objective: "Zero-human platform operations.",
    scope:
      "Cron-scheduled GitHub Actions triggers running isolated workflows to parse news severity and auto-initialize market positions.",
    artifacts: ["GitHub Actions", "Cron Automation", "Market Factory"],
  },
  {
    version: "v0.5",
    quarter: "Apr 2, 2026",
    layer: "Client",
    status: "shipped",
    title: "Dynamic Arena",
    objective: "Remove hardcoded market listings from the client.",
    scope: "Fully onchain market discovery. All listings read live from contract state instead of a static list.",
    artifacts: ["Onchain Discovery", "Dynamic UI"],
  },
  {
    version: "v0.6",
    quarter: "May 30, 2026",
    layer: "Intelligence",
    status: "shipped",
    title: "AI Duel",
    objective: "Give traders visibility into both sides of a market before they commit capital.",
    scope: "Market-specific Hawk and Dove arguments surfaced before staking, so users see the case for both outcomes.",
    artifacts: ["Hawk/Dove", "Pre-Stake Context"],
  },
  {
    version: "v0.65",
    quarter: "Jul 23, 2026",
    layer: "Liquidity",
    status: "shipped",
    title: "Cross-Chain Bridge via CCTP V2",
    objective:
      "Let users move USDC into Arc Testnet from the chains they already hold it on, without a custodian in the middle.",
    scope:
      "Native USDC bridging from multiple Circle-supported testnets into Arc Testnet, built on Circle's CCTP V2 burn-and-mint. Fast Transfer mode settles in under 20 seconds, so a deposit feels closer to a wallet transfer than a bridge.",
    artifacts: ["CCTP V2", "Fast Transfer", "Circle Iris"],
  },
  {
    version: "v0.7",
    quarter: "Pending Arc mainnet launch",
    layer: "Protocol",
    status: "next",
    title: "Mainnet Deployment",
    objective: "Production-grade deployment on Arc Mainnet.",
    scope:
      "Audited contracts promoted to Arc mainnet with production USDC liquidity and resolver bonding. Timeline depends on Circle's own Arc mainnet launch, which is publicly targeted for summer 2026, though there's no confirmed date yet.",
    artifacts: ["Audit", "Arc Mainnet", "USDC"],
  },
  {
    version: "v0.8",
    quarter: "Roughly 3 months after mainnet",
    layer: "Protocol",
    status: "next",
    title: "Dispute-Based Resolution",
    objective: "Decentralized dispute-based resolution for market outcomes.",
    scope:
      "Escrowed challenge window on resolver verdicts with slashing for malicious attestations. Targeted for roughly 3 months after mainnet deployment (v0.7).",
    artifacts: ["Challenge Window", "Slashing", "Bond"],
  },
  {
    version: "v0.9",
    quarter: "Following v0.8",
    layer: "Intelligence",
    status: "next",
    title: "Public Analyst Track Record",
    objective: "Public agent track record and on-chain forecasting transparency.",
    scope: "Per-agent forecast accuracy, calibration curves, and PnL exposed as a queryable onchain dataset.",
    artifacts: ["Calibration", "Brier Score", "Onchain Index"],
  },
  {
    version: "v1.0",
    quarter: "Following v0.9",
    layer: "Client",
    status: "next",
    title: "iOS Wallet Support",
    objective: "Full iPhone wallet support via WalletConnect for external browsers.",
    scope:
      "WalletConnect v2 session flow for Safari and Chrome on iOS, so mobile users can take positions without an injected provider.",
    artifacts: ["WalletConnect v2", "iOS Safari", "Deep Link"],
  },
  {
    version: "v1.1",
    quarter: "Following v1.0",
    layer: "Liquidity",
    status: "next",
    title: "Multi-Currency Asset Support",
    objective: "Expand protocol liquidity infrastructure beyond native gas tokens.",
    scope:
      "Introducing support for reliable stablecoins, like USDC and USDT, and multi-token asset tracking for cross-border deposits and withdrawals.",
    artifacts: ["Stablecoins", "Asset Support", "Deposit Engine"],
  },
  {
    version: "v1.2",
    quarter: "Following v1.1",
    layer: "Security",
    status: "next",
    title: "Privacy-Preserving KYC Compliance",
    objective: "Mitigate systemic platform risk, protocol exploits, and illicit capital flows.",
    scope:
      "Implementing lightweight identity-verification gates and strict Anti-Money Laundering (AML) monitoring layers without compromising decentralization.",
    artifacts: ["ZK-KYC Integrations", "AML Compliance Middleware"],
  },
  {
    version: "v1.3",
    quarter: "Following v1.2",
    layer: "Compliance",
    status: "next",
    title: "Regulatory Compliance Framework",
    objective: "Establish formal legal alignment and protect protocol integrity.",
    scope:
      "Architecting an adaptive regulatory compliance structure tailored specifically for decentralized, AI-driven risk-prediction and global narrative markets.",
    artifacts: ["Compliance Whitepaper", "Legal Framework Audits"],
  },
];