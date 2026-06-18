import { SAMPLE_EVENTS } from "./arc";

export type AgentSide = "HAWK" | "DOVE";

export const AGENTS = {
  HAWK: {
    id: "HAWK",
    name: "Agent Hawk",
    tagline: "Escalation maximalist",
    address: "0xH4WK000000000000000000000000000000000001",
    color: "destructive",
    bias: "Predicts risk will INTENSIFY. Stakes USDC on severity rising / ceasefires breaking.",
  },
  DOVE: {
    id: "DOVE",
    name: "Agent Dove",
    tagline: "De-escalation seeker",
    address: "0xD0VE000000000000000000000000000000000002",
    color: "primary",
    bias: "Predicts risk will COOL. Stakes USDC on de-escalation, mediation, ceasefire holding.",
  },
} as const;

export type Market = {
  id: string;
  eventId: string;
  question: string;
  threshold: number; // severity threshold for YES
  pool: { hawk: number; dove: number }; // USDC
  status: "open" | "resolving" | "resolved";
  winner?: AgentSide;
  reasoning?: string;
};

export const SAMPLE_MARKETS: Market[] = [
  {
    id: "mkt_001",
    eventId: SAMPLE_EVENTS[0].id,
    question: "Will Hormuz incident escalate to severity ≥ 80 within 24h?",
    threshold: 80,
    pool: { hawk: 4200, dove: 3100 },
    status: "open",
  },
  {
    id: "mkt_002",
    eventId: SAMPLE_EVENTS[1].id,
    question: "Will US sanctions widen to a new entity list this week?",
    threshold: 65,
    pool: { hawk: 2800, dove: 5400 },
    status: "open",
  },
  {
    id: "mkt_003",
    eventId: SAMPLE_EVENTS[3].id,
    question: "Will Cairo ceasefire hold past 72 hours (severity ≤ 40)?",
    threshold: 40,
    pool: { hawk: 6100, dove: 7900 },
    status: "resolving",
  },
];