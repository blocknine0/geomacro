export const DEFAULT_SUPABASE_TIMEOUT_MS = 5_000;
export const DEFAULT_SUPABASE_CIRCUIT_FAILURE_THRESHOLD = 3;
export const DEFAULT_SUPABASE_CIRCUIT_COOLDOWN_MS = 30_000;

export function isTransientSupabaseStatus(status: number): boolean {
  return (
    status === 402 ||
    status === 408 ||
    status === 425 ||
    status === 429 ||
    (status >= 500 && status <= 599)
  );
}

export function createSupabaseRequestSignal(
  upstreamSignal?: AbortSignal | null,
  timeoutMs = DEFAULT_SUPABASE_TIMEOUT_MS,
): AbortSignal {
  if (!Number.isFinite(timeoutMs) || timeoutMs < 1 || timeoutMs > 60_000) {
    throw new Error("Supabase timeout must be between 1 and 60000 milliseconds");
  }

  const timeoutSignal = AbortSignal.timeout(timeoutMs);
  return upstreamSignal
    ? AbortSignal.any([upstreamSignal, timeoutSignal])
    : timeoutSignal;
}

type SupabaseCircuitOptions = {
  failureThreshold?: number;
  cooldownMs?: number;
};

export class SupabaseCircuitBreaker {
  private consecutiveFailures = 0;
  private openedAt = 0;
  private probeInFlight = false;
  readonly failureThreshold: number;
  readonly cooldownMs: number;

  constructor(options: SupabaseCircuitOptions = {}) {
    this.failureThreshold =
      options.failureThreshold ?? DEFAULT_SUPABASE_CIRCUIT_FAILURE_THRESHOLD;
    this.cooldownMs = options.cooldownMs ?? DEFAULT_SUPABASE_CIRCUIT_COOLDOWN_MS;

    if (!Number.isInteger(this.failureThreshold) || this.failureThreshold < 1) {
      throw new Error("Supabase circuit failureThreshold must be a positive integer");
    }
    if (!Number.isFinite(this.cooldownMs) || this.cooldownMs < 1) {
      throw new Error("Supabase circuit cooldownMs must be positive");
    }
  }

  isOpen(now = Date.now()): boolean {
    return this.openedAt > 0 && now - this.openedAt < this.cooldownMs;
  }

  canRequest(now = Date.now()): boolean {
    if (!this.openedAt) return true;
    if (this.isOpen(now)) return false;
    if (this.probeInFlight) return false;
    this.probeInFlight = true;
    return true;
  }

  recordSuccess(): void {
    this.consecutiveFailures = 0;
    this.openedAt = 0;
    this.probeInFlight = false;
  }

  recordFailure(now = Date.now()): void {
    this.probeInFlight = false;
    this.consecutiveFailures += 1;
    if (this.consecutiveFailures >= this.failureThreshold) {
      this.openedAt = now;
    }
  }

  recordReachableNonTransientResponse(): void {
    this.recordSuccess();
  }

  retryAfterSeconds(now = Date.now()): number {
    if (!this.openedAt) return 0;
    return Math.max(0, Math.ceil((this.cooldownMs - (now - this.openedAt)) / 1000));
  }

  snapshot(now = Date.now()) {
    return {
      open: this.isOpen(now),
      failures: this.consecutiveFailures,
      retryAfterSeconds: this.retryAfterSeconds(now),
    };
  }
}
