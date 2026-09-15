import { AskPreview } from "@/components/home/ask-preview";
import { AskWorkspace } from "@/components/ask/ask-workspace";
import { IndustryReadinessSection } from "@/components/home/industry-readiness-section";

/**
 * Keep the homepage concise while preserving /ask-geomacro as a real product
 * workspace. Existing callers keep the same component API.
 */
export function AskGeomacroSection({ standalone = false }: { standalone?: boolean }) {
  if (standalone) return <AskWorkspace />;

  return (
    <>
      <AskPreview />
      <IndustryReadinessSection />
    </>
  );
}
