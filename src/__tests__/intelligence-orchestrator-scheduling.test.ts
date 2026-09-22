import { describe, expect, it } from "vitest";
import {
  DEFAULT_HEARTBEAT_BUDGET_MS,
  DEFAULT_HEARTBEAT_RESERVE_MS,
  DEFAULT_MAX_TASKS_PER_TICK,
  orderDueTasks,
  taskFitsWithinBudget,
} from "../../scripts/lib/intelligence-scheduler.mjs";

describe("intelligence orchestrator scheduling fairness", () => {
  it("defaults to eight task slots so the recurring production mesh has enough scheduler capacity", () => {
    expect(DEFAULT_MAX_TASKS_PER_TICK).toBe(8);
  });

  it("keeps one five-minute reserve inside a fifty-minute heartbeat budget", () => {
    expect(DEFAULT_HEARTBEAT_BUDGET_MS).toBe(50 * 60 * 1000);
    expect(DEFAULT_HEARTBEAT_RESERVE_MS).toBe(5 * 60 * 1000);
    expect(taskFitsWithinBudget(40 * 60 * 1000, 45 * 60 * 1000)).toBe(true);
    expect(taskFitsWithinBudget(40 * 60 * 1000, 44 * 60 * 1000)).toBe(false);
  });

  it("services the oldest overdue task before a newer higher-priority task", () => {
    const ordered = orderDueTasks([
      { task: { key: "gdelt_gal", priority: 10 }, state: { cursor: { next_due_at: "2026-09-22T08:53:00.000Z" } } },
      { task: { key: "country_raw_mesh", priority: 20 }, state: { cursor: { next_due_at: "2026-09-22T08:38:00.000Z" } } },
    ]);

    expect(ordered.map((x) => x.task.key)).toEqual(["country_raw_mesh", "gdelt_gal"]);
  });

  it("uses task priority only as the tie-breaker", () => {
    const ordered = orderDueTasks([
      { task: { key: "country_raw_mesh", priority: 20 }, state: { cursor: { next_due_at: "2026-09-22T08:53:00.000Z" } } },
      { task: { key: "gdelt_gal", priority: 10 }, state: { cursor: { next_due_at: "2026-09-22T08:53:00.000Z" } } },
    ]);

    expect(ordered.map((x) => x.task.key)).toEqual(["gdelt_gal", "country_raw_mesh"]);
  });
});
