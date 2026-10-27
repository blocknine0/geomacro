import { GEOMACRO_LOGO_DATA_URI, GEOMACRO_LOGO_INTRINSIC_WIDTH, GEOMACRO_LOGO_INTRINSIC_HEIGHT } from "@/lib/geomacro-logo-embedded";

// Keep the official mark self-contained and preserve its actual proportions.
// Platform-specific asset URLs are not available on every host or preview.
const LOGO_RATIO = GEOMACRO_LOGO_INTRINSIC_WIDTH / GEOMACRO_LOGO_INTRINSIC_HEIGHT;

export function Wordmark({ className, height = 32 }: { className?: string; height?: number }) {
  const width = Math.round(height * LOGO_RATIO);
  return (
    <img
      src={GEOMACRO_LOGO_DATA_URI}
      alt="Geomacro"
      width={width}
      height={height}
      className={className}
      style={{ height, width, display: "block" }}
      draggable={false}
    />
  );
}