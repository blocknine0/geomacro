import { defineConfig } from "nitro/config";

// Server deployment only: resolve fixed control-plane Worker URLs through
// public HTTPS routing. Authentication and receipt validation stay in clients.
export default defineConfig({
  cloudflare: {
    wrangler: {
      compatibility_flags: ["global_fetch_strictly_public"],
    },
  },
});
