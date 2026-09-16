import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import {
  Outlet,
  Link,
  createRootRouteWithContext,
  useRouter,
  HeadContent,
  Scripts,
} from "@tanstack/react-router";
import { useEffect, type ReactNode } from "react";

import appCss from "../styles.css?url";
import { reportClientError } from "../lib/error-reporting";
import { installClipboardCompatibility } from "../lib/clipboard-compat";
import { SiteShell } from "../components/site-shell";
import { WalletProvider } from "../hooks/WalletProvider";

const DEFAULT_TITLE = "Geopolitical, Macro & Critical Minerals Risk Intelligence | Geomacro";
const DEFAULT_DESCRIPTION =
  "Geomacro turns geopolitical, macroeconomic and critical-mineral developments into explainable risk intelligence with evidence, confidence, change attribution, separate Risk Indices and machine-readable decision context.";
const DEFAULT_OG_IMAGE = "https://geomacro.live/og-image-v2.png";

function NotFoundComponent() {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-7xl font-bold text-foreground">404</h1>
        <h2 className="mt-4 text-xl font-semibold text-foreground">Page not found</h2>
        <p className="mt-2 text-sm text-muted-foreground">
          The page you're looking for doesn't exist or has been moved.
        </p>
        <div className="mt-6">
          <Link
            to="/"
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Go home
          </Link>
        </div>
      </div>
    </div>
  );
}

function ErrorComponent({ error, reset }: { error: Error; reset: () => void }) {
  console.error(error);
  const router = useRouter();
  useEffect(() => {
    reportClientError(error, { boundary: "tanstack_root_error_component" });
  }, [error]);

  return (
    <div className="flex min-h-screen items-center justify-center bg-background px-4">
      <div className="max-w-md text-center">
        <h1 className="text-xl font-semibold tracking-tight text-foreground">
          This page didn't load
        </h1>
        <p className="mt-2 text-sm text-muted-foreground">
          Something went wrong on our end. You can try refreshing or head back home.
        </p>
        <div className="mt-6 flex flex-wrap justify-center gap-2">
          <button
            onClick={() => {
              router.invalidate();
              reset();
            }}
            className="inline-flex items-center justify-center rounded-md bg-primary px-4 py-2 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
          >
            Try again
          </button>
          <a
            href="/"
            className="inline-flex items-center justify-center rounded-md border border-input bg-background px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent"
          >
            Go home
          </a>
        </div>
      </div>
    </div>
  );
}

export const Route = createRootRouteWithContext<{ queryClient: QueryClient }>()({
  head: () => ({
    meta: [
      { charSet: "utf-8" },
      { name: "viewport", content: "width=device-width, initial-scale=1, viewport-fit=cover" },
      { title: DEFAULT_TITLE },
      { name: "description", content: DEFAULT_DESCRIPTION },
      { name: "author", content: "Geomacro" },
      { name: "application-name", content: "Geomacro" },
      { name: "theme-color", content: "#0b1117" },
      { name: "format-detection", content: "telephone=no, address=no, email=no" },
      { property: "og:title", content: DEFAULT_TITLE },
      { property: "og:description", content: DEFAULT_DESCRIPTION },
      { property: "og:site_name", content: "Geomacro" },
      { property: "og:type", content: "website" },
      { property: "og:locale", content: "en_US" },
      { property: "og:image", content: DEFAULT_OG_IMAGE },
      { property: "og:image:secure_url", content: DEFAULT_OG_IMAGE },
      { property: "og:image:alt", content: "Geomacro geopolitical, macroeconomic and critical-minerals risk intelligence" },
      { name: "twitter:card", content: "summary_large_image" },
      { name: "twitter:site", content: "@GeomacroLive" },
    ],
    links: [
      {
        rel: "stylesheet",
        href: appCss,
      },
      { rel: "icon", type: "image/png", sizes: "32x32", href: "/favicon-32.png" },
      { rel: "icon", type: "image/png", sizes: "192x192", href: "/icon-192.png" },
      { rel: "icon", type: "image/png", sizes: "512x512", href: "/icon-512.png" },
      { rel: "shortcut icon", href: "/favicon.ico" },
      { rel: "apple-touch-icon", sizes: "180x180", href: "/apple-touch-icon.png" },
    ],
    scripts: [
      {
        type: "application/ld+json",
        children: JSON.stringify({
          "@context": "https://schema.org",
          "@graph": [
            {
              "@type": "Organization",
              "@id": "https://geomacro.live/#organization",
              name: "Geomacro",
              url: "https://geomacro.live/",
              logo: {
                "@type": "ImageObject",
                url: "https://geomacro.live/icon-512.png",
              },
              email: "contact@geomacro.live",
              sameAs: ["https://github.com/blocknine0/geomacro", "https://x.com/GeomacroLive"],
              description:
                "Geopolitical, macroeconomic and critical-minerals risk intelligence infrastructure for human and machine decisions.",
            },
            {
              "@type": "WebSite",
              "@id": "https://geomacro.live/#website",
              url: "https://geomacro.live/",
              name: "Geomacro",
              publisher: { "@id": "https://geomacro.live/#organization" },
              inLanguage: "en",
            },
          ],
        }),
      },
    ],
  }),
  shellComponent: RootShell,
  component: RootComponent,
  notFoundComponent: NotFoundComponent,
  errorComponent: ErrorComponent,
});

function RootShell({ children }: { children: ReactNode }) {
  return (
    <html lang="en">
      <head>
        <HeadContent />
      </head>
      <body>
        {children}
        <Scripts />
      </body>
    </html>
  );
}

function RootComponent() {
  const { queryClient } = Route.useRouteContext();

  useEffect(() => {
    installClipboardCompatibility();
  }, []);

  return (
    <QueryClientProvider client={queryClient}>
      <WalletProvider>
        {/* Shared header + footer; nested routes render inside SiteShell. */}
        <SiteShell>
          <Outlet />
        </SiteShell>
      </WalletProvider>
    </QueryClientProvider>
  );
}
