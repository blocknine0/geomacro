const PRODUCTION_HOSTS = new Set(["geomacro.live", "www.geomacro.live"]);

function withDeploymentHeaders(response, host) {
  const headers = new Headers(response.headers);
  if (!PRODUCTION_HOSTS.has(host)) {
    headers.set("X-Robots-Tag", "noindex, nofollow");
    headers.set("X-Geomacro-Deployment-Mode", "production-capable-staging-no-funds");
  }
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

function publicProductionHealthRequest(request) {
  const url = new URL(request.url);
  url.pathname = "/api/health";
  url.search = "?deep=1";
  return new Request(url, request);
}

export function productionWebsite(app) {
  return {
    async fetch(request, env, ctx) {
      const url = new URL(request.url);
      const host = url.hostname.toLowerCase();

      if (host === "www.geomacro.live") {
        url.hostname = "geomacro.live";
        url.protocol = "https:";
        return Response.redirect(url, 308);
      }

      if (url.pathname === "/.well-known/geomacro-build.json" && env?.ASSETS) {
        return withDeploymentHeaders(await env.ASSETS.fetch(request), host);
      }

      const forwarded = url.pathname === "/api/public-production-health"
        ? publicProductionHealthRequest(request)
        : request;
      const response = await app.fetch(forwarded, env, ctx);
      return withDeploymentHeaders(response, host);
    },
  };
}

export default productionWebsite;
