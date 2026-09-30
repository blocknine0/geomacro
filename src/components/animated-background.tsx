import { useEffect, useRef } from "react";
import networkBg from "@/assets/network-bg.png.asset.json";

interface Node {
  x: number;
  y: number;
  vx: number;
  vy: number;
  r: number;
  phase: number;
  warm: boolean;
}

export function AnimatedBackground() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const rafRef = useRef<number | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const lastTimeRef = useRef(0);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d", { alpha: true });
    if (!ctx) return;

    const prefersReduced =
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches;

    let width = 0;
    let height = 0;
    let dpr = Math.min(window.devicePixelRatio || 1, 1.35);

    const initNodes = () => {
      const area = width * height;
      const mobile = width < 768;
      const base = Math.round(area / (mobile ? 38000 : 30000));
      const count = mobile
        ? Math.max(12, Math.min(28, base))
        : Math.max(24, Math.min(62, base));

      nodesRef.current = Array.from({ length: count }, () => ({
        x: Math.random() * width,
        y: Math.random() * height,
        vx: (Math.random() - 0.5) * (mobile ? 0.028 : 0.045),
        vy: (Math.random() - 0.5) * (mobile ? 0.028 : 0.045),
        r: 0.8 + Math.random() * 1.25,
        phase: Math.random() * Math.PI * 2,
        warm: Math.random() < 0.58,
      }));
    };

    const resize = () => {
      width = window.innerWidth;
      height = window.innerHeight;
      dpr = Math.min(window.devicePixelRatio || 1, 1.35);
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      initNodes();
    };

    resize();
    window.addEventListener("resize", resize);

    const draw = (t: number) => {
      const dt = lastTimeRef.current ? Math.min(48, t - lastTimeRef.current) : 16;
      lastTimeRef.current = t;
      ctx.clearRect(0, 0, width, height);

      const nodes = nodesRef.current;
      const maxDist = width < 768 ? 105 : 132;
      const maxDistSq = maxDist * maxDist;

      for (const node of nodes) {
        node.x += node.vx * (dt / 16);
        node.y += node.vy * (dt / 16);
        node.phase += 0.0045 * (dt / 16);
        if (node.x < -20) node.x = width + 20;
        else if (node.x > width + 20) node.x = -20;
        if (node.y < -20) node.y = height + 20;
        else if (node.y > height + 20) node.y = -20;
      }

      ctx.lineWidth = 0.5;
      for (let i = 0; i < nodes.length; i++) {
        const a = nodes[i];
        for (let j = i + 1; j < nodes.length; j++) {
          const b = nodes[j];
          const dx = a.x - b.x;
          const dy = a.y - b.y;
          const d2 = dx * dx + dy * dy;
          if (d2 >= maxDistSq) continue;

          const alpha = (1 - d2 / maxDistSq) * 0.15;
          ctx.strokeStyle = a.warm || b.warm
            ? `rgba(242, 170, 72, ${alpha})`
            : `rgba(224, 229, 238, ${alpha * 0.72})`;
          ctx.beginPath();
          ctx.moveTo(a.x, a.y);
          ctx.lineTo(b.x, b.y);
          ctx.stroke();
        }
      }

      for (const node of nodes) {
        const pulse = 0.5 + 0.5 * Math.sin(node.phase);
        const r = node.r + pulse * 0.35;
        const color = node.warm
          ? `rgba(247, 180, 82, ${0.38 + pulse * 0.22})`
          : `rgba(225, 230, 238, ${0.2 + pulse * 0.16})`;
        ctx.fillStyle = color;
        ctx.beginPath();
        ctx.arc(node.x, node.y, r, 0, Math.PI * 2);
        ctx.fill();
      }

      rafRef.current = requestAnimationFrame(draw);
    };

    if (!prefersReduced) rafRef.current = requestAnimationFrame(draw);

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
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <img
        src={networkBg.url}
        alt=""
        aria-hidden
        className="absolute inset-0 h-full w-full scale-[1.04] object-cover opacity-25 grayscale-[35%] sm:opacity-35 animate-bg-drift"
      />
      <canvas ref={canvasRef} className="absolute inset-0 h-full w-full opacity-75" />
      <div className="absolute inset-0 bg-[radial-gradient(circle_at_50%_-10%,rgba(245,175,80,0.08),transparent_38%),linear-gradient(to_bottom,rgba(8,11,17,0.74),rgba(8,11,17,0.9))] backdrop-blur-[1px]" />
    </div>
  );
}
