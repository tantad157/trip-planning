export interface Env {
  SHORTENER_KV: KVNamespace;
  HOST_URL: string;
}

function randomSlug(): string {
  return btoa(Math.random().toString(36)).slice(0, 8).replace(/[/+=]/g, "a");
}

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type",
};

export default {
  async fetch(request: Request, env: Env, ctx: ExecutionContext): Promise<Response> {
    if (request.method === "OPTIONS") {
      return new Response(null, { headers: corsHeaders });
    }
    const url = new URL(request.url);
    const path = url.pathname.slice(1);
    const isPost = request.method === "POST";
    const isGet = request.method === "GET";

    if (isPost && (path === "" || path === "shorten")) {
      try {
        const json = (await request.json()) as { url?: string };
        const longUrl = json?.url?.trim();
        if (!longUrl || !longUrl.startsWith("http://") && !longUrl.startsWith("https://")) {
          return new Response(JSON.stringify({ error: "Invalid url" }), {
            status: 400,
            headers: { "Content-Type": "application/json" },
          });
        }
        let slug = randomSlug();
        while (await env.SHORTENER_KV.get(slug)) {
          slug = randomSlug();
        }
        await env.SHORTENER_KV.put(slug, longUrl);
        const shortUrl = `${env.HOST_URL}/${slug}`;
        return new Response(JSON.stringify({ url: shortUrl, slug }), {
          headers: { "Content-Type": "application/json", ...corsHeaders },
        });
      } catch (e) {
        return new Response(JSON.stringify({ error: "Failed to shorten" }), {
          status: 500,
          headers: { "Content-Type": "application/json" },
        });
      }
    }

    if (isGet && path && !path.includes("/")) {
      const redirectTo = await env.SHORTENER_KV.get(path);
      if (redirectTo) {
        return Response.redirect(redirectTo, 302);
      }
      return new Response("Not found", { status: 404 });
    }

    if (isGet && path === "") {
      return Response.redirect("https://tantad157.github.io/trip-planning/", 302);
    }

    return new Response("Not found", { status: 404 });
  },
};
