import logoAsset from "@/assets/geomacro-logo.png.asset.json";

// Source image is ~589x186 (≈3.16:1). The orange background is part of the
// mark, so it reads strongly on both light and dark themes without recoloring.
const LOGO_RATIO = 589 / 186;

export function Wordmark({ className, height = 32 }: { className?: string; height?: number }) {
  const width = Math.round(height * LOGO_RATIO);
  return (
    <img
      src={logoAsset.url}
      alt="Geomacro"
      width={width}
      height={height}
      className={className}
      style={{ height, width, display: "block" }}
      draggable={false}
    />
  );
}