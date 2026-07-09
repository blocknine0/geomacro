import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { Wallet, Zap, Github, Twitter, Menu } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import heroBg from "@/assets/hero-bg.jpg";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { useWallet } from "@/hooks/WalletProvider";
import { preferredNetwork } from "@/lib/arc";
import { shortAddr } from "@/components/section-ui";
import { ThemeToggle } from "@/components/theme-toggle";

function ConnectButton() {
  const { address, onArc, network, connect, switchToArc, connecting, error } = useWallet();
  if (!address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button onClick={connect} disabled={connecting} size="sm" className="gap-2 px-3 sm:h-10 sm:px-4">
          <Wallet className="h-4 w-4" />
          <span className="hidden sm:inline">{connecting ? "Connecting…" : "Connect Wallet"}</span>
          <span className="sm:hidden">{connecting ? "…" : "Connect"}</span>
        </Button>
        {error && <span className="max-w-[220px] text-right text-[11px] text-destructive sm:max-w-xs sm:text-xs">{error}</span>}
      </div>
    );
  }
  return (
    <div className="flex items-center gap-2">
      {!onArc && (
        <Button variant="outline" size="sm" onClick={() => void switchToArc()} className="gap-1">
          <Zap className="h-3.5 w-3.5" />
          <span className="hidden sm:inline">Switch to Arc</span>
          <span className="sm:hidden">Switch</span>
        </Button>
      )}
      <Badge variant={onArc ? "default" : "secondary"} className="gap-1.5 px-2 py-1 font-mono text-[10px] sm:px-3 sm:py-1.5 sm:text-xs">
        <span className={`h-1.5 w-1.5 rounded-full ${onArc ? "bg-primary" : "bg-muted-foreground"}`} />
        <span className="hidden md:inline">{network ? network.chainName : "Wrong network"} · </span>
        {shortAddr(address)}
      </Badge>
    </div>
  );
}

const NAV_LINKS = [
  { to: "/feed", label: "Active Narratives" },
  { to: "/arena", label: "Analyst Panel" },
  { to: "/pipeline", label: "Data Pipeline" },
  { to: "/onchain", label: "Onchain" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/contact", label: "Contact" },
] as const;

const PORTFOLIO_LINK = { to: "/portfolio", label: "Portfolio" } as const;

const GITHUB_URL = "https://github.com/blocknine0/geomacro-oracle";

export function SiteShell({ children }: { children: ReactNode }) {
  const { network, address } = useWallet();
  const activeNet = network ?? preferredNetwork();
  const navLinks = address ? [...NAV_LINKS, PORTFOLIO_LINK] : NAV_LINKS;
  return (
    <div className="relative min-h-screen bg-background text-foreground">
      <div aria-hidden className="pointer-events-none fixed inset-0 -z-10">
        <img
          src={heroBg}
          alt=""
          aria-hidden
          className="absolute inset-0 h-full w-full object-cover opacity-50 animate-bg-drift"
        />
        <div className="absolute inset-0 bg-gradient-to-b from-background/40 via-background/70 to-background" />
      </div>
      <header className="sticky top-0 z-50 border-b border-border/60 bg-background/70 backdrop-blur-xl">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
          <div className="flex min-w-0 items-center gap-2">
            <Sheet>
              <SheetTrigger asChild>
                <Button
                  variant="ghost"
                  size="icon"
                  className="md:hidden"
                  aria-label="Open navigation menu"
                >
                  <Menu className="h-5 w-5" />
                </Button>
              </SheetTrigger>
              <SheetContent side="left" className="w-72">
                <SheetHeader>
                  <SheetTitle>
                    <Wordmark height={26} />
                  </SheetTitle>
                </SheetHeader>
                <nav className="mt-6 flex flex-col gap-1">
                  {navLinks.map((l) => (
                    <SheetClose asChild key={l.to}>
                      <Link
                        to={l.to}
                        className="rounded-md px-3 py-2.5 text-base text-muted-foreground transition hover:bg-muted hover:text-foreground"
                        activeProps={{ className: "rounded-md px-3 py-2.5 text-base bg-muted text-foreground" }}
                      >
                        {l.label}
                      </Link>
                    </SheetClose>
                  ))}
                  <SheetClose asChild>
                    <Link
                      to="/about"
                      className="rounded-md px-3 py-2.5 text-base text-muted-foreground transition hover:bg-muted hover:text-foreground"
                      activeProps={{ className: "rounded-md px-3 py-2.5 text-base bg-muted text-foreground" }}
                    >
                      About
                    </Link>
                  </SheetClose>
                </nav>
                <div className="mt-6 flex items-center justify-between border-t border-border/60 pt-4">
                  <span className="text-sm text-muted-foreground">Theme</span>
                  <ThemeToggle />
                </div>
              </SheetContent>
            </Sheet>
            <Link to="/" className="flex min-w-0 items-center" aria-label="Geomacro home">
              <Wordmark height={32} className="shrink-0" />
            </Link>
          </div>
          <nav className="hidden gap-8 text-sm text-muted-foreground md:flex">
            {navLinks.map((l) => (
              <Link
                key={l.to}
                to={l.to}
                className="transition hover:text-foreground"
                activeProps={{ className: "text-foreground" }}
              >
                {l.label}
              </Link>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <ThemeToggle />
            <ConnectButton />
          </div>
        </div>
      </header>

      {children}

      <footer className="border-t border-border/60">
        <div className="mx-auto flex max-w-7xl flex-col items-center justify-between gap-4 px-4 py-8 text-center text-xs text-muted-foreground sm:px-6 md:flex-row md:text-left">
          <span className="font-mono">© 2026 Geomacro · schema: geomacro.event.v1</span>
          <div className="flex flex-wrap items-center justify-center gap-x-4 gap-y-2 font-mono">
            <Link to="/about" className="transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>
              About
            </Link>
            <Link to="/docs" className="transition hover:text-foreground" activeProps={{ className: "text-foreground" }}>
              Docs
            </Link>
            <a
              href={GITHUB_URL}
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition hover:text-foreground"
            >
              <Github className="h-3.5 w-3.5" /> View on GitHub
            </a>
            <a
              href="https://x.com/GeomacroLive"
              target="_blank"
              rel="noreferrer"
              className="inline-flex items-center gap-1.5 transition hover:text-foreground"
            >
              <Twitter className="h-3.5 w-3.5" /> X
            </a>
            <span>
              {activeNet.chainName} · Chain {activeNet.chainIdDec}
            </span>
          </div>
        </div>
      </footer>
    </div>
  );
}
