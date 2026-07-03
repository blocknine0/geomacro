export type AgentSide = "HAWK" | "DOVE";

export const AGENTS = {
  HAWK: {
    id: "HAWK",
    name: "Agent Hawk",
    tagline: "Escalation analyst",
    address: "0xH4WK000000000000000000000000000000000001",
    color: "destructive",
    bias: "Forecasts that risk will INTENSIFY. Allocates USDC capital to the escalation contract when severity is set to rise or ceasefires look fragile.",
  },
  DOVE: {
    id: "DOVE",
    name: "Agent Dove",
    tagline: "De-escalation analyst",
    address: "0xD0VE000000000000000000000000000000000002",
    color: "primary",
    bias: "Forecasts that risk will COOL. Allocates USDC capital to the calm contract on de-escalation, mediation or a holding ceasefire.",
  },
} as const;