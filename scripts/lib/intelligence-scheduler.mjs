export const DEFAULT_MAX_TASKS_PER_TICK = 8;
export const DEFAULT_HEARTBEAT_BUDGET_MS = 50 * 60 * 1000;
export const DEFAULT_HEARTBEAT_RESERVE_MS = 5 * 60 * 1000;

export function taskFitsWithinBudget(taskTimeoutMs, remainingMs, reserveMs = DEFAULT_HEARTBEAT_RESERVE_MS) {
  return Number.isFinite(taskTimeoutMs)
    && Number.isFinite(remainingMs)
    && Number.isFinite(reserveMs)
    && remainingMs >= taskTimeoutMs + reserveMs;
}

export function orderDueTasks(dueItems) {
  return [...dueItems].sort((a, b) => {
    const aDueAt = Date.parse(a?.state?.cursor?.next_due_at ?? "");
    const bDueAt = Date.parse(b?.state?.cursor?.next_due_at ?? "");

    if (Number.isFinite(aDueAt) && Number.isFinite(bDueAt) && aDueAt !== bDueAt) {
      return aDueAt - bDueAt;
    }
    if (Number.isFinite(aDueAt) !== Number.isFinite(bDueAt)) {
      return Number.isFinite(aDueAt) ? -1 : 1;
    }

    return Number(a?.task?.priority ?? Number.MAX_SAFE_INTEGER)
      - Number(b?.task?.priority ?? Number.MAX_SAFE_INTEGER);
  });
}
