export function AnimatedBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden bg-background">
      <div className="absolute inset-x-0 top-0 h-px bg-border/60" />
      <div className="absolute left-1/2 top-[-20rem] h-[34rem] w-[68rem] -translate-x-1/2 rounded-full bg-primary/[0.025] blur-3xl" />
    </div>
  );
}
