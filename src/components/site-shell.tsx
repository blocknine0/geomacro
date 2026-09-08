import { Link } from "@tanstack/react-router";
import type { ReactNode } from "react";
import {
  ChevronDown,
  Copy,
  Github,
  LogOut,
  Menu,
  Twitter,
  Wallet,
  Zap,
} from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { AnimatedBackground } from "@/components/animated-background";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import { useWallet } from "@/hooks/WalletProvider";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";
import { preferredNetwork } from "@/lib/arc";
import { shortAddr } from "@/components/section-ui";

function ConnectButton() {
  const { address, onArc, network, connect, switchToArc, connecting, error, disconnect, isSignedIn } =
    useWallet();

  if (!address) {
    return (
      <div className="flex flex-col items-end gap-1">
        <Button
          onClick={connect}
          disabled={connecting}
          size="sm"
          variant="ghost"
          className="gap-2 border border-border/50 px-3 text-muted-foreground hover:text-foreground sm:h-10 sm:px-4"
        >
          <Wallet className="h-4 w-4" />
          <span className="hidden sm:inline">{connecting ? "Connecting…" : "Connect wallet"}</span>
          <span className="sm:hidden">{connecting ? "…" : "Connect"}</span>
        </Button>
        {error && (
          <span className="max-w-[220px] text-right text-[11px] text-destructive sm:max-w-xs sm:text-xs">
            {error}
          </span>
        )}
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
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button type="button" aria-label="Wallet menu">
            <Badge
              variant={onArc ? "default" : "secondary"}
              className="cursor-pointer gap-1.5 px-2 py-1 font-mono text-[10px] sm:px-3 sm:py-1.5 sm:text-xs"
            >
              <span className={`h-1.5 w-1.5 rounded-full ${onArc ? "bg-primary" : "bg-muted-foreground"}`} />
              <span className="hidden md:inline">{network ? network.chainName : "Wrong network"} · </span>
              {shortAddr(address)}
            </Badge>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuLabel className="font-mono text-xs font-normal">
            {shortAddr(address)}
            <span className="mt-1 block text-[10px] text-muted-foreground">
              {isSignedIn ? "Signed in with wallet" : "Not signed in"}
            </span>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={() => void navigator.clipboard?.writeText(address)} className="gap-2">
            <Copy className="h-3.5 w-3.5" /> Copy address
          </DropdownMenuItem>
          <DropdownMenuItem onClick={disconnect} className="gap-2 text-destructive focus:text-destructive">
            <LogOut className="h-3.5 w-3.5" /> Disconnect wallet
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

const PRIMARY_NAV = [
  { to: "/intelligence", label: "Intelligence" },
  { to: "/global-risk", label: "Global Risk Index" },
  { to: "/risk-gate", label: "Risk Gate" },
  { to: "/ask-geomacro", label: "Ask Geomacro" },
  { to: "/data-api", label: "Data & API" },
  { to: "/research", label: "Research" },
  { to: "/institutional", label: "For Institutions" },
] as const;

const TECHNICAL_NAV = [
  { to: "/pipeline", label: "Data Pipeline", description: "Technical data-processing surface" },
  { to: "/arena", label: "Prediction Markets", description: "Testnet application and feedback layer" },
  { to: "/onchain", label: "Arc / Onchain", description: "Programmable-finance technical proof" },
  { to: "/bridge-swap", label: "Bridge & Swap", description: "Circle / Arc testnet implementation" },
] as const;

const COMPANY_NAV = [
  { to: "/about", label: "About" },
  { to: "/roadmap", label: "Roadmap" },
  { to: "/contact", label: "Contact" },
] as const;

const GITHUB_URL = "https://github.com/blocknine0/geomacro";

function TechnicalProofMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap transition hover:text-foreground">
          Technical Proof <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Secondary application layer
        </DropdownMenuLabel>
        {TECHNICAL_NAV.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <Link to={item.to} className="flex flex-col items-start gap-0.5 py-2">
              <span>{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const { network, address } = useWallet();
  const activeNet = network ?? preferredNetwork();
  const mobileLinks = [
    ...PRIMARY_NAV,
    ...TECHNICAL_NAV.map(({ to, label }) => ({ to, label })),
    ...(address ? [{ to: "/portfolio" as const, label: "Portfolio" }] : []),
    ...COMPANY_NAV,
  ];

  return (
    <div className="relative min-h-screen text-foreground">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>
      <AnimatedBackground />
      <div className="relative z-10 flex min-h-screen flex-col">
        <header className="sticky top-0 z-50 border-b border-border/60 bg-background/75 backdrop-blur-xl">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:px-6">
            <div className="flex min-w-0 items-center gap-2">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="lg:hidden" aria-label="Open navigation menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-72 overflow-y-auto">
                  <SheetHeader>
                    <SheetTitle><Wordmark height={26} /></SheetTitle>
                  </SheetHeader>
                  <nav className="mt-6 flex flex-col gap-1">
                    {mobileLinks.map((item) => (
                      <SheetClose asChild key={item.to}>
                        <Link
                          to={item.to}
                          className="rounded-md px-3 py-2.5 text-base text-muted-foreground transition hover:bg-muted hover:text-foreground"
                          activeProps={{ className: "rounded-md px-3 py-2.5 text-base bg-muted text-foreground" }}
                        >
                          {item.label}
                        </Link>
                      </SheetClose>
                    ))}
                  </nav>
                </SheetContent>
              </Sheet>
              <Link to="/" className="flex min-w-0 items-center py-1" aria-label="Geomacro home">
                <Wordmark height={40} className="shrink-0" />
              </Link>
            </div>

            <nav aria-label="Primary" className="hidden items-center gap-3 text-xs text-muted-foreground lg:flex xl:gap-4">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="whitespace-nowrap transition hover:text-foreground"
                  activeProps={{ className: "text-foreground" }}
                >
                  {item.label}
                </Link>
              ))}
              <TechnicalProofMenu />
            </nav>

            <div className="flex items-center gap-2">
              {address && (
                <Link
                  to="/portfolio"
                  className="hidden text-sm text-muted-foreground transition hover:text-foreground 2xl:inline-flex"
                  activeProps={{ className: "text-foreground" }}
                >
                  Portfolio
                </Link>
              )}
              <ConnectButton />
            </div>
          </div>
        </header>

        <main id="main-content" className="flex-1">
          {children}
        </main>

        <footer className="border-t border-border/60 bg-background/30">
          <div className="mx-auto grid max-w-7xl gap-8 px-4 py-10 text-sm text-muted-foreground sm:px-6 md:grid-cols-[1.2fr_2fr]">
            <div>
              <Wordmark height={30} />
              <p className="mt-3 max-w-sm text-sm leading-relaxed">
                Explainable geopolitical and macro risk intelligence for human and machine decisions.
              </p>
              <p className="mt-3 font-mono text-xs">© 2026 Geomacro</p>
            </div>
            <div className="grid grid-cols-2 gap-6 sm:grid-cols-4">
              <div>
                <p className="font-medium text-foreground">Product</p>
                <div className="mt-3 flex flex-col gap-2">
                  <Link to="/intelligence" className="hover:text-foreground">Intelligence</Link>
                  <Link to="/global-risk" className="hover:text-foreground">Global Risk Index</Link>
                  <Link to="/ask-geomacro" className="hover:text-foreground">Ask Geomacro</Link>
                  <Link to="/risk-gate" className="hover:text-foreground">Risk Gate</Link>
                  <Link to="/data-api" className="hover:text-foreground">Data & API</Link>
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">Solutions</p>
                <div className="mt-3 flex flex-col gap-2">
                  <Link to="/institutional" className="hover:text-foreground">For Institutions</Link>
                  <Link to="/research" className="hover:text-foreground">Research</Link>
                  <Link to="/docs" className="hover:text-foreground">Docs</Link>
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">Technical Proof</p>
                <div className="mt-3 flex flex-col gap-2">
                  <Link to="/arena" className="hover:text-foreground">Markets</Link>
                  <Link to="/onchain" className="hover:text-foreground">Arc / Onchain</Link>
                  <Link to="/bridge-swap" className="hover:text-foreground">Bridge & Swap</Link>
                  <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <Github className="h-3.5 w-3.5" /> GitHub
                  </a>
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">Company</p>
                <div className="mt-3 flex flex-col gap-2">
                  <Link to="/about" className="hover:text-foreground">About</Link>
                  <Link to="/roadmap" className="hover:text-foreground">Roadmap</Link>
                  <Link to="/contact" className="hover:text-foreground">Contact</Link>
                  <a href="https://x.com/GeomacroLive" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <Twitter className="h-3.5 w-3.5" /> X
                  </a>
                </div>
              </div>
            </div>
          </div>
          <div className="border-t border-border/50">
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-3 px-4 py-4 font-mono text-[10px] text-muted-foreground sm:px-6">
              <span>Public intelligence · Private Pilot Risk Gate · Technical proof labelled separately</span>
              <details>
                <summary className="cursor-pointer">Arc technical context</summary>
                <span className="mt-1 block">{activeNet.chainName} · Chain {activeNet.chainIdDec}</span>
              </details>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
