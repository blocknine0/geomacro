export function GlobalSignalMap() {
  return (
    <div
      aria-hidden="true"
      className="relative mx-auto w-full max-w-[38rem] overflow-hidden [mask-image:linear-gradient(to_right,transparent,black_9%,black_91%,transparent)]"
    >
      <style>{`
        @keyframes geomacro-map-drift {
          0%, 100% { transform: translate3d(-3px, 2px, 0); }
          50% { transform: translate3d(5px, -3px, 0); }
        }
        @keyframes geomacro-route-flow {
          to { stroke-dashoffset: -44; }
        }
        @keyframes geomacro-node-breathe {
          0%, 100% { opacity: .45; transform: scale(.94); }
          50% { opacity: .9; transform: scale(1.08); }
        }
        .geomacro-map-drift {
          animation: geomacro-map-drift 30s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        .geomacro-route-flow {
          animation: geomacro-route-flow 14s linear infinite;
        }
        .geomacro-node-breathe {
          animation: geomacro-node-breathe 7s ease-in-out infinite;
          transform-box: fill-box;
          transform-origin: center;
        }
        @media (prefers-reduced-motion: reduce) {
          .geomacro-map-drift,
          .geomacro-route-flow,
          .geomacro-node-breathe {
            animation: none !important;
          }
        }
      `}</style>

      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_55%_44%,hsl(var(--primary)/0.055),transparent_47%)]" />

      <svg
        viewBox="0 0 720 440"
        role="presentation"
        className="relative h-auto w-full select-none"
      >
        <defs>
          <linearGradient id="geomacro-map-stroke" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0" stopColor="currentColor" stopOpacity="0.12" />
            <stop offset="0.48" stopColor="currentColor" stopOpacity="0.34" />
            <stop offset="1" stopColor="currentColor" stopOpacity="0.11" />
          </linearGradient>
          <linearGradient id="geomacro-route-stroke" x1="0" y1="0" x2="1" y2="0">
            <stop offset="0" stopColor="hsl(var(--foreground))" stopOpacity="0.1" />
            <stop offset="0.55" stopColor="hsl(var(--primary))" stopOpacity="0.7" />
            <stop offset="1" stopColor="hsl(var(--foreground))" stopOpacity="0.08" />
          </linearGradient>
          <radialGradient id="geomacro-node-glow">
            <stop offset="0" stopColor="hsl(var(--primary))" stopOpacity="0.3" />
            <stop offset="1" stopColor="hsl(var(--primary))" stopOpacity="0" />
          </radialGradient>
        </defs>

        <g opacity="0.38" stroke="hsl(var(--foreground))" strokeWidth="0.7" fill="none">
          <path d="M50 118H670" opacity="0.12" />
          <path d="M36 220H684" opacity="0.09" />
          <path d="M64 322H656" opacity="0.12" />
          <path d="M180 54V384" opacity="0.08" />
          <path d="M360 38V402" opacity="0.1" />
          <path d="M540 54V384" opacity="0.08" />
        </g>

        <g
          className="geomacro-map-drift text-foreground"
          fill="hsl(var(--foreground))"
          fillOpacity="0.018"
          stroke="url(#geomacro-map-stroke)"
          strokeWidth="1.45"
          strokeLinejoin="round"
        >
          <path d="M93 144l22-25 38-14 35 8 27 20 16 30-8 18-19 3-6 27-17 17-15 35-26 12-17-18-2-27-22-13-17-27 7-29-8-15 12-6z" />
          <path d="M185 269l20 8 16 20 2 25 14 24-9 31-20 30-14-3-4-31-13-23 8-28-10-27 10-26z" />
          <path d="M301 133l18-18 30-7 19 11 22-8 29 9 26-6 35 10 26-6 34 13 19 21 31-3 34 16 15 26-8 15-34 2-18-12-21 8-20-9-22 14-15 22-30 1-15 20-23-4-20-28-21-9-17-18-28-4-19-17-27 5-18-15 7-24z" />
          <path d="M361 229l23 3 20 15 13 26-8 34-18 22-10 36-18 12-16-17 1-35-17-27 2-29 16-23 12-17z" />
          <path d="M569 299l22-10 30 5 18 20-5 24-22 10-27-5-19-18 3-26z" />
          <path d="M641 238l12-8 13 6-4 13-12 6-11-7 2-10z" />
        </g>

        <g fill="none" strokeLinecap="round">
          <path
            d="M157 176C250 113 363 126 463 190"
            stroke="url(#geomacro-route-stroke)"
            strokeWidth="1.5"
            strokeDasharray="4 9"
            className="geomacro-route-flow"
          />
          <path
            d="M451 193C505 171 553 184 602 218"
            stroke="hsl(var(--foreground))"
            strokeOpacity="0.22"
            strokeWidth="1.1"
            strokeDasharray="2 10"
            className="geomacro-route-flow"
          />
          <path
            d="M211 290C286 248 351 253 420 282"
            stroke="hsl(var(--foreground))"
            strokeOpacity="0.16"
            strokeWidth="1.1"
            strokeDasharray="2 11"
            className="geomacro-route-flow"
          />
        </g>

        <g>
          <circle cx="157" cy="176" r="18" fill="url(#geomacro-node-glow)" opacity="0.55" />
          <circle cx="157" cy="176" r="3.4" fill="hsl(var(--foreground))" fillOpacity="0.55" />

          <circle cx="463" cy="190" r="24" fill="url(#geomacro-node-glow)" className="geomacro-node-breathe" />
          <circle cx="463" cy="190" r="4" fill="hsl(var(--primary))" />
          <circle cx="463" cy="190" r="8.5" fill="none" stroke="hsl(var(--primary))" strokeOpacity="0.32" />

          <circle cx="602" cy="218" r="17" fill="url(#geomacro-node-glow)" opacity="0.35" />
          <circle cx="602" cy="218" r="3.2" fill="hsl(var(--foreground))" fillOpacity="0.5" />

          <circle cx="420" cy="282" r="3" fill="hsl(var(--foreground))" fillOpacity="0.38" />
          <circle cx="211" cy="290" r="2.8" fill="hsl(var(--foreground))" fillOpacity="0.3" />
        </g>

        <g fill="none" stroke="hsl(var(--foreground))" strokeOpacity="0.08">
          <ellipse cx="463" cy="190" rx="92" ry="54" />
          <ellipse cx="463" cy="190" rx="144" ry="86" />
        </g>
      </svg>
    </div>
  );
}
