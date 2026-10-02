import process from "node:process";

export type GeomacroSupabaseRuntimeMode = "primary" | "standby" | "standby_read";

export function geomacroSupabaseRuntimeMode(
  env: NodeJS.ProcessEnv = process.env,
): GeomacroSupabaseRuntimeMode {
  const configured = String(env.GEOMACRO_SUPABASE_RUNTIME_MODE ?? "")
    .trim()
    .toLowerCase();

  if (configured) {
    if (configured === "primary" || configured === "standby" || configured === "standby_read") {
      return configured;
    }
    throw new Error("GEOMACRO_SUPABASE_RUNTIME_MODE must be primary, standby, or standby_read");
  }

  // Customer-facing production runtimes default to Supabase cold-standby.
  // Operators and CI that intentionally use Supabase can opt in explicitly.
  return env.NODE_ENV === "production" ? "standby" : "primary";
}

export function supabasePrimaryTrafficAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return geomacroSupabaseRuntimeMode(env) === "primary";
}

export function supabaseReadFallbackAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  const mode = geomacroSupabaseRuntimeMode(env);
  return mode === "primary" || mode === "standby_read";
}

export function supabaseWriteTrafficAllowed(
  env: NodeJS.ProcessEnv = process.env,
): boolean {
  return geomacroSupabaseRuntimeMode(env) === "primary";
}
