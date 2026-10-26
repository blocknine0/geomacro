export default {
  async fetch(request, env) {
    if (request.method !== "GET" && request.method !== "HEAD") {
      return new Response(JSON.stringify({ok:false,error:"METHOD_NOT_ALLOWED"}), {
        status:405,
        headers:{"Content-Type":"application/json; charset=utf-8","Cache-Control":"no-store",
          "Access-Control-Allow-Origin":"*","X-Content-Type-Options":"nosniff"},
      });
    }
    return env.ASSETS.fetch(request);
  },
};
