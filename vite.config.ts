// @lovable.dev/vite-tanstack-config already includes the following — do NOT add them manually
// or the app will break with duplicate plugins:
//   - tanstackStart, viteReact, tailwindcss, tsConfigPaths, nitro (build-only using cloudflare as a default target),
//     componentTagger (dev-only), VITE_* env injection, @ path alias, React/TanStack dedupe,
//     error logger plugins, and sandbox detection (port/host/strictPort).
// You can pass additional config via defineConfig({ vite: { ... }, etc... }) if needed.
import { defineConfig } from "@lovable.dev/vite-tanstack-config";
import { fileURLToPath } from "node:url";

const netStub = fileURLToPath(new URL("./src/lib/polyfills/empty-net.js", import.meta.url));
const bufferShim = fileURLToPath(new URL("./src/lib/polyfills/buffer-shim.js", import.meta.url));
const eventsShim = fileURLToPath(new URL("./src/lib/polyfills/events-shim.js", import.meta.url));

// rpc-websockets (pulled in transitively by @solana/web3.js via @circle-fin/app-kit)
// only declares "browser" and "node" export conditions, so the Worker/edge build
// ("workerd"/"worker") cannot resolve it. Point it straight at the browser ESM build.
const rpcWebsockets = fileURLToPath(
  new URL("./node_modules/rpc-websockets/dist/index.browser.mjs", import.meta.url),
);

// Vite's vite:resolve plugin externalizes Node built-ins (events, buffer, net,
// node:events, ...) before resolve.alias runs in the client/Worker builds, so
// downstream alias entries never match. This pre-plugin runs with enforce:'pre'
// to short-circuit the resolution to our browser shims.
const polyfillResolver = () => {
  const map = new Map([
    ["events", eventsShim],
    ["node:events", eventsShim],
    ["buffer", bufferShim],
    ["node:buffer", bufferShim],
    ["net", netStub],
    ["node:net", netStub],
    ["rpc-websockets", rpcWebsockets],
  ]);
  return {
    name: "lovable-node-polyfill-resolver",
    enforce: "pre" as const,
    resolveId(source: string) {
      const hit = map.get(source);
      return hit ? hit : null;
    },
  };
};

export default defineConfig({
  tanstackStart: {
    // Redirect TanStack Start's bundled server entry to src/server.ts (our SSR error wrapper).
    // nitro/vite builds from this
    server: { entry: "server" },
  },
  vite: {
    plugins: [polyfillResolver()],
    resolve: {
      alias: {
        net: netStub,
        "node:net": netStub,
        buffer: bufferShim,
        "node:buffer": bufferShim,
        events: eventsShim,
        "node:events": eventsShim,
        "rpc-websockets": rpcWebsockets,
      },
    },
  },
});
