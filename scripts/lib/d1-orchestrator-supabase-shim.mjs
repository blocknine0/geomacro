import { createD1ControlPlaneStateClient } from "./d1-control-plane-state.mjs";

const TABLE = "live_intelligence_scheduler_state";
const PREFIX = "orchestrator:";

function scopeFromSourceId(value) {
  const raw = String(value ?? "").trim();
  if (!raw.startsWith(PREFIX) || raw.length <= PREFIX.length) {
    throw new Error("D1_ORCHESTRATOR_SOURCE_ID_INVALID");
  }
  return raw.slice(PREFIX.length);
}

export function createClient() {
  const state = createD1ControlPlaneStateClient();

  return {
    from(table) {
      if (table !== TABLE) {
        throw new Error(`D1_ORCHESTRATOR_TABLE_UNSUPPORTED:${String(table)}`);
      }
      return {
        select() {
          return {
            async like(column, pattern) {
              if (column !== "source_id" || pattern !== "orchestrator:%") {
                return { data: null, error: new Error("D1_ORCHESTRATOR_SELECT_SCOPE_INVALID") };
              }
              try {
                const rows = await state.loadRows();
                return { data: [...rows.values()], error: null };
              } catch (error) {
                return { data: null, error };
              }
            },
          };
        },
        async upsert(row, options = {}) {
          try {
            if (options?.onConflict && options.onConflict !== "source_id") {
              throw new Error("D1_ORCHESTRATOR_UPSERT_CONFLICT_INVALID");
            }
            const scope = scopeFromSourceId(row?.source_id);
            const payload = row?.payload && typeof row.payload === "object" ? row.payload : {};
            await state.persist(scope, payload, {
              cursor: payload?.cursor ?? {},
              last_attempt_at: row?.last_attempt_at ?? null,
              last_success_at: row?.last_success_at ?? null,
            });
            return { data: null, error: null };
          } catch (error) {
            return { data: null, error };
          }
        },
      };
    },
  };
}
