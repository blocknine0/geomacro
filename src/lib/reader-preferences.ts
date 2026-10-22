export const READER_PREFERENCES_KEY = "geomacro.reader.v1";
export type ReaderCategory = "geopolitics" | "macro" | "rare_earth";
export type ReaderPreferences = {
  category: ReaderCategory;
  savedIds: string[];
  lastVisit: number | null;
};
export function parseReaderPreferences(raw: string | null, now = Date.now()): ReaderPreferences {
  const fallback: ReaderPreferences = { category: "geopolitics", savedIds: [], lastVisit: null };
  try {
    const value: unknown = JSON.parse(raw ?? "null");
    if (!value || typeof value !== "object" || Array.isArray(value)) return fallback;
    const data = value as Record<string, unknown>;
    return {
      category:
        data.category === "macro" || data.category === "rare_earth" ? data.category : "geopolitics",
      savedIds: Array.isArray(data.savedIds)
        ? [
            ...new Set(
              data.savedIds.filter(
                (id): id is string => typeof id === "string" && id.length > 0 && id.length <= 300,
              ),
            ),
          ].slice(0, 200)
        : [],
      lastVisit:
        typeof data.lastVisit === "number" &&
        Number.isFinite(data.lastVisit) &&
        data.lastVisit > 0 &&
        data.lastVisit <= now
          ? data.lastVisit
          : null,
    };
  } catch {
    return fallback;
  }
}
