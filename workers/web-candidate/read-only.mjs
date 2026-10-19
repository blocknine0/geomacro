// Deployment candidate for the canonical app, never a second data engine.
// No payment retry, private authorization or state-changing route may run here.
export function readOnlyCandidate(app) {
  return {
    async fetch(request, env, ctx) {
      const forbidden = ["authorization", "payment-signature", "x-payment",
        "x-payment-signature", "payment-response"];
      if (!["GET", "HEAD"].includes(request.method) ||
          forbidden.some(name => request.headers.has(name))) {
        return Response.json({ok:false,error:"READ_ONLY_DEPLOYMENT_CANDIDATE",
          execution_authorized:false,chargeable:false}, {
          status:405,headers:{Allow:"GET, HEAD","Cache-Control":"no-store",
            "X-Geomacro-Candidate-Mode":"read-only-no-funds"},
        });
      }
      // The receipt is stamped after Nitro's asset manifest is compiled.
      // Serve the marker and pinned public images through the real asset binding.
      // Otherwise Nitro can route the new file to its SSR 404 page.
      const path = new URL(request.url).pathname;
      const publicBuildAsset = path === "/.well-known/geomacro-build.json" ||
        path.startsWith("/__l5e/assets-v1/");
      const response = publicBuildAsset && env?.ASSETS
        ? await env.ASSETS.fetch(request)
        : await app.fetch(request, env, ctx);
      const headers = new Headers(response.headers);
      headers.set("X-Geomacro-Candidate-Mode", "read-only-no-funds");
      headers.set("X-Robots-Tag", "noindex, nofollow");
      return new Response(request.method === "HEAD" ? null : response.body, {
        status:response.status,statusText:response.statusText,headers,
      });
    },
  };
}
