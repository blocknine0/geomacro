import { Link, useRouterState } from "@tanstack/react-router";
import { useEffect, useState, type ReactNode } from "react";
import { ChevronDown, Languages, Menu, Pause, Play, Twitter } from "lucide-react";
import { IntelligenceBackground } from "@/components/intelligence-background";
import { Wordmark } from "@/components/wordmark";
import { Button } from "@/components/ui/button";
import { ProductionCoverageProof } from "@/components/production-coverage-proof";
import {
  Sheet,
  SheetContent,
  SheetHeader,
  SheetTitle,
  SheetDescription,
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
  { to: "/", label: "Home" },
  { to: "/intelligence", label: "Intelligence" },
  { to: "/risk-indices", label: "Risk Indices" },
  { to: "/ask-geomacro", label: "Ask Geomacro" },
  { to: "/pricing", label: "Store & API" },
] as const;

const EXPLORE_NAV = [
  { to: "/institutional", label: "For teams", description: "Risk, treasury and supply-chain workflows" },
  { to: "/ecosystem", label: "Ecosystem & Partnerships", description: "Integrations, partnerships and commercial ecosystem" },
  { to: "/research", label: "Research & Evidence", description: "Methodology, coverage evidence and limitations" },
  { to: "/docs", label: "Documentation", description: "Product architecture and technical reference" },
  { to: "/about", label: "About & Trust", description: "Product boundaries, privacy and trust disclosures" },
  { to: "/roadmap", label: "Roadmap", description: "Live, Private Pilot and future commercial capabilities" },
] as const;

const REFERENCE_NAV = [{ to: "/contact", label: "Contact" }] as const;
const PRODUCTION_EVIDENCE_ROUTES = new Set(["/risk-gate", "/research"]);


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
    if (!SITE_LANGUAGES.some((language) => language.code === code)) return;
    const controller = (window as Window & {
      GeomacroLanguage?: { navigate: (language: string) => void };
    }).GeomacroLanguage;
    if (controller?.navigate) {
      try {
        controller.navigate(code);
        return;
      } catch {
        // Keep the menu functional if the optional static controller failed.
      }
    }

    // A failed/missing public script must never turn the language selector into
    // a silent no-op. Rebuild the canonical URL first so switching languages
    // cannot nest a previous Translate URL or lose the current route.
    let source = new URL(window.location.href);
    if (source.hostname === "translate.google.com") {
      const embedded = source.searchParams.get("u");
      if (embedded) {
        try {
          source = new URL(embedded);
        } catch {
          for (const key of ["sl", "tl", "hl", "u"]) source.searchParams.delete(key);
        }
      } else {
        for (const key of ["sl", "tl", "hl", "u"]) source.searchParams.delete(key);
      }
    } else if (source.hostname.endsWith(".translate.goog")) {
      const original = new URL(`https://geomacro.live${source.pathname}${source.search}`);
      original.hash = source.hash;
      source = original;
    }
    for (const key of [...source.searchParams.keys()]) {
      if (key.startsWith("_x_tr_")) source.searchParams.delete(key);
    }
    try {
      window.localStorage.setItem("geomacro.website_language", code);
    } catch {
      // Browsers with blocked storage can still translate this visit.
    }
    if (code === "en") {
      window.location.assign(source.toString());
      return;
    }
    const translated = new URL("https://translate.google.com/translate");
    translated.searchParams.set("sl", "auto");
    translated.searchParams.set("tl", code);
    translated.searchParams.set("hl", "en");
    translated.searchParams.set("u", source.toString());
    window.location.assign(translated.toString());
  };

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-11 min-w-11 gap-1.5 px-2.5 text-xs text-muted-foreground hover:text-foreground"
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

function ExploreMenu({ active }: { active: boolean }) {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <button type="button" aria-label="Explore more pages" data-active={active || undefined} className="inline-flex min-h-11 items-center gap-1 whitespace-nowrap rounded-md px-1 py-2 transition hover:text-foreground data-[active=true]:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary">
          Explore <ChevronDown className="h-3.5 w-3.5" aria-hidden />
        </button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-80 max-w-[calc(100vw-2rem)] max-h-[min(75dvh,36rem)] overflow-y-auto">
        <DropdownMenuLabel className="font-mono text-[10px] uppercase tracking-[0.16em] text-muted-foreground">
          Product, evidence and company
        </DropdownMenuLabel>
        {EXPLORE_NAV.map((item) => (
          <DropdownMenuItem key={item.to} asChild>
            <Link to={item.to} activeProps={{ className: "bg-muted text-foreground" }} className="flex min-h-11 flex-col items-start gap-0.5 py-2.5">
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
              activeOptions={{ exact: item.to === "/" }}
              className="min-h-11 rounded-lg px-3 py-2.5 text-sm text-muted-foreground transition hover:bg-muted hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
              activeProps={{ className: "rounded-lg px-3 py-2.5 text-sm bg-muted text-foreground", "aria-current": "page" }}
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
  const [motionPaused, setMotionPaused] = useState(false);
  useEffect(() => {
    try { setMotionPaused(window.localStorage.getItem("geomacro.background-paused") === "true"); } catch { /* Storage is optional. */ }
  }, []);
  const toggleMotion = () => {
    setMotionPaused((previous) => {
      const next = !previous;
      try { window.localStorage.setItem("geomacro.background-paused", String(next)); } catch { /* Keep this visit functional. */ }
      return next;
    });
  };
  const pathname = useRouterState({ select: (state) => state.location.pathname });
  const exploreMobile = EXPLORE_NAV.map(({ to, label }) => ({ to, label }));
  const showProductionEvidence = PRODUCTION_EVIDENCE_ROUTES.has(pathname);
  const exploreActive = EXPLORE_NAV.some(({ to }) => pathname === to || pathname.startsWith(`${to}/`));

  return (
    <div className="gm-site relative isolate min-h-screen bg-background text-foreground">
      <IntelligenceBackground paused={motionPaused} />
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:left-4 focus:top-4 focus:z-[60] focus:rounded-md focus:bg-primary focus:px-4 focus:py-2 focus:text-primary-foreground"
      >
        Skip to content
      </a>

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
                    <SheetTitle>Geomacro navigation</SheetTitle>
                    <SheetDescription>Choose a product, explore Geomacro or contact the team.</SheetDescription>
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

            <nav aria-label="Primary" className="hidden items-center gap-3 text-sm text-muted-foreground xl:flex">
              {PRIMARY_NAV.map((item) => (
                <Link
                  key={item.to}
                  to={item.to}
                  activeOptions={{ exact: item.to === "/" }}
                  className="inline-flex min-h-11 items-center whitespace-nowrap rounded-md px-1 py-2 transition hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                  activeProps={{ className: "text-foreground font-medium", "aria-current": "page" }}
                >
                  {item.label}
                </Link>
              ))}
              <ExploreMenu active={exploreActive} />
              <Button asChild size="sm" className="ml-1 h-9 px-4 text-xs">
                <Link to="/contact">Contact</Link>
              </Button>
            </nav>

            <div className="flex min-w-[44px] items-center justify-end gap-1">
              <Button type="button" variant="ghost" size="icon" onClick={toggleMotion}
                aria-label={motionPaused ? "Enable background animation" : "Pause background animation"}
                aria-pressed={motionPaused} title={motionPaused ? "Enable background animation" : "Pause background animation"}
                className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground">
                {motionPaused ? <Play className="h-3.5 w-3.5" aria-hidden /> : <Pause className="h-3.5 w-3.5" aria-hidden />}
              </Button>
              <LanguageMenu />
            </div>
          </div>
        </header>

        {showProductionEvidence ? <ProductionCoverageProof /> : null}

        <div id="main-content" tabIndex={-1} className="flex-1 scroll-mt-20 outline-none">{children}</div>



        <footer className="border-t border-border/60 bg-background/45 backdrop-blur-sm">
          <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 text-sm text-muted-foreground sm:px-6 lg:grid-cols-[1.15fr_2fr] lg:py-14">
            <div>
              <Wordmark height={32} />
              <p className="mt-4 max-w-sm text-sm leading-6">
                What changed. Why it matters. Geopolitics, Macro / FX and Critical Minerals.
              </p>
              <p className="mt-4 font-mono text-[11px]">© {new Date().getFullYear()} Geomacro</p>
            </div>

            <div className="grid grid-cols-2 gap-x-6 gap-y-8 sm:grid-cols-4">
              <div>
                <p className="font-medium text-foreground">Product</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  <Link to="/" className="hover:text-foreground">Home</Link>
                  <Link to="/intelligence" className="hover:text-foreground">Intelligence</Link>
                  <Link to="/risk-indices" className="hover:text-foreground">Risk Indices</Link>
                  <Link to="/ask-geomacro" className="hover:text-foreground">Ask Geomacro</Link>
                  <Link to="/pricing" className="hover:text-foreground">Store & API</Link>
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">Commercial</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  <Link to="/institutional" className="hover:text-foreground">Institutions</Link>
                  <Link to="/contact" className="hover:text-foreground">Contact</Link>
                </div>
              </div>
              <div>
                <p className="font-medium text-foreground">Evidence</p>
                <div className="mt-3 flex flex-col gap-2.5">
                  <Link to="/research" className="hover:text-foreground">Research & Evidence</Link>
                  <Link to="/docs" className="hover:text-foreground">Documentation</Link>
                  <Link to="/roadmap" className="hover:text-foreground">Roadmap</Link>
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
            <div className="mx-auto flex max-w-7xl flex-wrap items-center justify-between gap-x-6 gap-y-3 px-4 py-4 font-mono text-[10px] text-muted-foreground sm:px-6">
              <span className="min-w-0 max-w-full leading-relaxed">Intelligence findings have no added publication delay · Risk Indices retain their 60-minute delay · API keys coming soon</span>
              <nav aria-label="Legal and trust information" className="flex min-w-0 flex-wrap items-center gap-x-4 gap-y-2">
                <Link to="/about" hash="privacy" className="whitespace-nowrap hover:text-foreground">Privacy</Link>
                <Link to="/about" hash="product-use" className="whitespace-nowrap hover:text-foreground">Product use</Link>
                <Link to="/about" className="whitespace-nowrap hover:text-foreground">Trust</Link>
              </nav>
            </div>
          </div>
        </footer>
      </div>
    </div>
  );
}
