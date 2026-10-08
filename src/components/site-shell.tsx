import { Link, useRouterState } from "@tanstack/react-router";
import type { ReactNode } from "react";
import { ChevronDown, Github, Languages, Menu, Twitter } from "lucide-react";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { AnimatedBackground } from "@/components/animated-background";
import { ProductionCoverageProof } from "@/components/production-coverage-proof";
import { CommercialAccessGuide } from "@/components/commercial-access-guide";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetTrigger,
  SheetClose,
} from "@/components/ui/sheet";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuTrigger,
} from "@/components/ui/dropdown-menu";

const PRIMARY_NAV = [
  { to: "/intelligence", label: "Intelligence" },
  { to: "/risk-indices", label: "Risk Indices" },
  { to: "/ask-geomacro", label: "Ask Geomacro" },
  { to: "/data-api", label: "API & Agents" },
  { to: "/institutional", label: "Institutions" },
  { to: "/pricing", label: "Pricing" },
] as const;

const EXPLORE_NAV = [
  { to: "/global-risk", label: "Global Risk History", description: "Historical global risk conditions and context" },
  { to: "/risk-gate", label: "Risk Gate · Private Pilot", description: "Controlled country and corridor decision context" },
  { to: "/ecosystem", label: "Ecosystem & Partnerships", description: "Integrations, partnerships and commercial ecosystem" },
  { to: "/research", label: "Research & Evidence", description: "Methodology, coverage evidence and limitations" },
  { to: "/docs", label: "Documentation", description: "Product architecture and technical reference" },
  { to: "/about", label: "About & Trust", description: "Product boundaries, privacy and trust disclosures" },
  { to: "/roadmap", label: "Roadmap", description: "Live, Private Pilot and future commercial capabilities" },
] as const;

const REFERENCE_NAV = [{ to: "/contact", label: "Contact" }] as const;
const PRODUCTION_EVIDENCE_ROUTES = new Set(["/risk-gate", "/research"]);
const GITHUB_URL = "https://github.com/blocknine0/geomacro";

const SITE_LANGUAGES = [
  { code: "en", label: "English" },
  { code: "es", label: "Español" },
  { code: "fr", label: "Français" },
  { code: "de", label: "Deutsch" },
  { code: "pt", label: "Português" },
  { code: "zh-CN", label: "简体中文" },
  { code: "zh-TW", label: "繁體中文" },
  { code: "ja", label: "日本語" },
  { code: "ko", label: "한국어" },
  { code: "hi", label: "हिन्दी" },
  { code: "bn", label: "বাংলা" },
  { code: "ar", label: "العربية" },
  { code: "ru", label: "Русский" },
  { code: "tr", label: "Türkçe" },
  { code: "id", label: "Bahasa Indonesia" },
] as const;

function LanguageMenu() {
  const translatePage = (code: string) => {
    if (code === "en") {
      window.location.reload();
      return;
    }
    const target = encodeURIComponent(window.location.href);
    window.location.assign(`https://translate.google.com/translate?sl=auto&tl=${encodeURIComponent(code)}&u=${target}`);
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-9 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
          aria-label="Choose website language"
        >
          <Languages className="h-3.5 w-3.5" />
          <span className="hidden 2xl:inline">Language</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-52">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Read Geomacro in your language
        </DropdownMenuLabel>
        {SITE_LANGUAGES.map((language) => (
          <DropdownMenuItem key={language.code} onSelect={() => translatePage(language.code)} className="cursor-pointer">
            {language.label}
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function ExploreMenu() {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" className="inline-flex items-center gap-1 whitespace-nowrap py-2 transition hover:text-foreground">
          Explore <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Product, evidence and company
        </DropdownMenuLabel>
        {EXPLORE_NAV.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <Link to={item.to} className="flex flex-col items-start gap-0.5 py-2.5">
              <span>{item.label}</span>
              <span className="text-xs text-muted-foreground">{item.description}</span>
            </Link>
          </DropdownMenuItem>
        ))}
      </DropdownMenuContent>
    </DropdownMenu>
  );
}

function MobileGroup({ title, items }: { title: string; items: ReadonlyArray<{ to: string; label: string }> }) {
  return (
    <div>
      <p className="px-3 font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground/70">{title}</p>
      <div className="mt-1 flex flex-col gap-0.5">
        {items.map((item) => (
          <SheetClose asChild key={item.to}>
            <Link
              to={item.to}
              className="rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground"
              activeProps={{ className: "rounded-lg px-3 py-2.5 text-sm bg-muted text-foreground" }}
            >
              {item.label}
            </Link>
          </SheetClose>
        ))}
      </div>
    </div>
  );
}

export function SiteShell({ children }: { children: ReactNode }) {
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const exploreMobile = EXPLORE_NAV.map(({ to, label }) => ({ to, label }));
  const showProductionEvidence = PRODUCTION_EVIDENCE_ROUTES.has(pathname);

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
        <header className="sticky top-0 z-50 border-b border-border/55 bg-background/78 backdrop-blur-2xl supports-[backdrop-filter]:bg-background/68">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-2 px-4 sm:h-[68px] sm:px-6">
            <div className="flex min-w-0 items-center gap-1.5">
              <Sheet>
                <SheetTrigger asChild>
                  <Button variant="ghost" size="icon" className="xl:hidden" aria-label="Open navigation menu">
                    <Menu className="h-5 w-5" />
                  </Button>
                </SheetTrigger>
                <SheetContent side="left" className="w-[88vw] max-w-sm overflow-y-auto border-border/70 bg-background/98 px-4">
                  <SheetHeader className="px-2">
                    <SheetTitle><Wordmark height={28} /></SheetTitle>
                  </SheetHeader>
                  <nav className="mt-7 space-y-6 pb-8" aria-label="Mobile navigation">
                    <MobileGroup title="Core" items={PRIMARY_NAV} />
                    <MobileGroup title="Explore" items={exploreMobile} />
                    <MobileGroup title="Reference" items={REFERENCE_NAV} />
                  </nav>
                </SheetContent>
              </Sheet>
              <Link to="/" className="flex min-w-0 items-center py-1" aria-label="Geomacro home">
                <Wordmark height={40} className="shrink-0" />
              </Link>
            </div>

            <nav aria-label="Primary" className="hidden items-center gap-3 text-xs text-muted-foreground xl:flex 2xl:gap-4">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  className="whitespace-nowrap py-2 transition hover:text-foreground"
                  activeProps={{ className: "text-foreground" }}
                >
                  {item.label}
                </Link>
              ))}
              <ExploreMenu />
              <Button asChild size="sm" className="ml-1 h-9 px-4 text-xs">
                <Link to="/contact">Contact</Link>
              </Button>
            </nav>

            <div className="flex min-w-[44px] items-center justify-end gap-1">
              <LanguageMenu />
            </div>
          </div>
        </header>

        {showProductionEvidence ? <ProductionCoverageProof /> : null}

        <div id="main-content" className="flex-1">{children}</div>

        {pathname === "/pricing" ? null : <CommercialAccessGuide />}

        <footer className="border-t border-border/60 bg-background/45 backdrop-blur-sm">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 text-sm text-muted-foreground sm:px-6 lg:grid-cols-[1.15fr_2fr] lg:py-14">
            <div>
              <Wordmark height={32} />
              <p className="mt-4 max-w-sm text-sm leading-6">
                Decision-ready geopolitical, macroeconomic and critical-mineral risk intelligence for humans and machines.
              </p>
              <p className="mt-4 font-mono text-[11px]">© 2026 Geomacro</p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
              <div>
                <p className="font-medium text-foreground">Product</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  <Link to="/intelligence" className="hover:text-foreground">Intelligence</Link>
                  <Link to="/risk-indices" className="hover:text-foreground">Risk Indices</Link>
                  <Link to="/ask-geomacro" className="hover:text-foreground">Ask Geomacro</Link>
                  <Link to="/global-risk" className="hover:text-foreground">Global Risk History</Link>
                  <Link to="/pricing" className="hover:text-foreground">Pricing</Link>
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">Commercial</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  <Link to="/data-api" className="hover:text-foreground">API & Agents</Link>
                  <Link to="/institutional" className="hover:text-foreground">Institutions</Link>
                  <Link to="/risk-gate" className="hover:text-foreground">Risk Gate · Private Pilot</Link>
                  <Link to="/contact" className="hover:text-foreground">Contact</Link>
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">Evidence</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  <Link to="/research" className="hover:text-foreground">Research & Evidence</Link>
                  <Link to="/docs" className="hover:text-foreground">Documentation</Link>
                  <Link to="/roadmap" className="hover:text-foreground">Roadmap</Link>
                  <a href={GITHUB_URL} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <Github className="h-3.5 w-3.5" /> GitHub
                  </a>
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">Company & Trust</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  <Link to="/ecosystem" className="hover:text-foreground">Ecosystem</Link>
                  <Link to="/about" className="hover:text-foreground">About & Trust</Link>
                  <Link to="/contact" className="hover:text-foreground">Contact</Link>
                  <a href="https://x.com/GeomacroLive" target="_blank" rel="noreferrer" className="inline-flex items-center gap-1.5 hover:text-foreground">
                    <Twitter className="h-3.5 w-3.5" /> X
                  </a>
                </div>
              </div>
            </div>
          </div>

          <div className="border-t border-border/50">
            <div className="mx-auto flex max-w-7xl flex-col gap-2 px-4 py-4 font-mono text-[10px] text-muted-foreground sm:px-6 lg:flex-row lg:items-center lg:justify-between">
              <span>Public intelligence & risk indices · Risk Gate by invitation · Paid API access subject to availability</span>
              <Link to="/about" className="hover:text-foreground">Privacy · Product use · Trust</Link>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
