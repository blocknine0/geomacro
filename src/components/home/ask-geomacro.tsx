import { AskPreview } from "@/components/home/ask-preview";
import { AskWorkspace } from "@/components/ask/ask-workspace";

/**
 * Keep the homepage concise while preserving /ask-geomacro as a real product
 * workspace. Existing callers keep the same component API.
 */
export function AskGeomacroSection({ standalone = false }: { standalone?: boolean }) {
  return standalone ? <AskWorkspace /> : <AskPreview />;
}
