/** Decorative globe grid: no data fetching, canvas loop or interaction layer. */
export function IntelligenceBackground({ paused }: { paused: boolean }) {
  return (
    <div className="gm-intelligence-background" data-paused={paused} aria-hidden="true">
      <div className="gm-intelligence-grid" />
      <svg className="gm-intelligence-globe" viewBox="0 0 800 800" fill="none" focusable="false">
        <g className="gm-globe-lines" stroke="currentColor" strokeWidth="0.8">
          <circle cx="400" cy="400" r="300" />
          <ellipse cx="400" cy="400" rx="220" ry="300" />
          <ellipse cx="400" cy="400" rx="110" ry="300" />
          <path d="M400 100V700M100 400H700" />
          <ellipse cx="400" cy="400" rx="300" ry="110" />
          <ellipse cx="400" cy="400" rx="300" ry="220" />
        </g>
        <g className="gm-globe-orbit" stroke="currentColor">
          <ellipse cx="400" cy="400" rx="365" ry="135" transform="rotate(-30 400 400)" strokeDasharray="3 12" />
          <circle cx="716" cy="217" r="4" fill="currentColor" stroke="none" />
          <circle cx="84" cy="583" r="3" fill="currentColor" stroke="none" />
        </g>
      </svg>
      <div className="gm-intelligence-glow" />
    </div>
  );
}
