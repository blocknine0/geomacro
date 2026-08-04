import { useEffect, useRef } from "react";
import networkBg from "@/assets/network-bg.png.asset.json";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  hue: "amber" | "blue";
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const lastTimeRef = useRef<number>(0);
  const imgLoadedRef = useRef<boolean>(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    // preload background image so we don't rely on <img> load timing
    const bgImage = new Image();
    bgImage.src = networkBg.url;
    bgImage.onload = () => { imgLoadedRef.current = true; };
    bgImage.onerror = () => { imgLoadedRef.current = false; };

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.5);

    const initNodes = () => {
      const area = width * height;
      // ~1 node per 22000 css px², capped
      const count = Math.max(30, Math.min(90, Math.round(area / 22000)));
      const nodes: Node[] = [];
      for (let i = 0; i < count; i++) {
        nodes.push({
          x: Math.random() * width,
          y: Math.random() * height,
          vx: (Math.random() - 0.5) * 0.06,
          vy: (Math.random() - 0.5) * 0.06,
          r: 1 + Math.random() * 1.8,
          phase: Math.random() * Math.PI * 2,
          hue: Math.random() < 0.35 ? "amber" : "blue",
        });
      }
      nodesRef.current = nodes;
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.5);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes();
    };

    resize();
    window.addEventListener("resize", resize);

    const MAX_DIST = 140;
    const MAX_DIST_SQ = MAX_DIST * MAX_DIST;

    const draw = (t: number) => {
      if (!canvasRef.current || !ctx) return;
      const dt = lastTimeRef.current ? Math.min(64, t - lastTimeRef.current) : 16;
      lastTimeRef.current = t;

      ctx.clearRect(0, 0, width, height);

      const nodes = nodesRef.current;

      // update
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        n.x += n.vx * (dt / 16);
        n.y += n.vy * (dt / 16);
        n.phase += 0.008 * (dt / 16);
        if (n.x < -20) n.x = width + 20;
        else if (n.x > width + 20) n.x = -20;
        if (n.y < -20) n.y = height + 20;
        else if (n.y > height + 20) n.y = -20;
      }

      // lines
      ctx.lineWidth = 0.6;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 < MAX_DIST_SQ) {
            const alpha = (1 - d2 / MAX_DIST_SQ) * 0.28;
            const amber = a.hue === "amber" || b.hue === "amber";
            ctx.strokeStyle = amber
              ? `rgba(240, 170, 70, ${alpha * 0.9})`
              : `rgba(120, 170, 220, ${alpha})`;
            ctx.beginPath();
            ctx.moveTo(a.x, a.y);
            ctx.lineTo(b.x, b.y);
            ctx.stroke();
          }
        }
      }

      // nodes
      for (let i = 0; i < nodes.length; i++) {
        const n = nodes[i];
        const pulse = 0.55 + 0.45 * Math.sin(n.phase);
        const r = n.r + pulse * 0.8;
        const color =
          n.hue === "amber"
            ? `rgba(245, 175, 80, ${0.55 + pulse * 0.35})`
            : `rgba(140, 190, 235, ${0.5 + pulse * 0.35})`;
        // glow
        const glow = ctx.createRadialGradient(n.x, n.y, 0, n.x, n.y, r * 6);
        glow.addColorStop(0, color);
        glow.addColorStop(1, "rgba(0,0,0,0)");
        ctx.fillStyle = glow;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r * 6, 0, Math.PI * 2);
        ctx.fill();
        // core
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(n.x, n.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    if (!prefersReduced) {
      rafRef.current = requestAnimationFrame(draw);
    }

    // pause when tab hidden
    const onVisibility = () => {
      if (document.hidden) {
        if (rafRef.current) cancelAnimationFrame(rafRef.current);
        rafRef.current = null;
      } else if (!rafRef.current && !prefersReduced) {
        lastTimeRef.current = 0;
        rafRef.current = requestAnimationFrame(draw);
      }
    };
    document.addEventListener("visibilitychange", onVisibility);

    return () => {
      window.removeEventListener("resize", resize);
      document.removeEventListener("visibilitychange", onVisibility);
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, []);

  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
      <img
        src={networkBg.url}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full object-cover animate-bg-drift"
      />
      <canvas
        ref={canvasRef}
        className="absolute inset-0 h-full w-full"
      />
      <div
        className="absolute inset-0 backdrop-blur-[2px]"
        style={{ backgroundColor: "rgba(11, 15, 25, 0.75)" }}
      />
    </div>
  );
}