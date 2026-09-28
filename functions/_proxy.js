/**
 * Shared proxy used by /auth/* and /admin/* Pages Functions.
 *
 * The static pages (login.html, register.html) call relative paths like
 * /auth/register. Cloudflare Pages only serves static files for GET, so
 * those POSTs used to come back as 405. These Functions forward the
 * request to the real Worker so the browser stays on a single origin
 * (no CORS, no hardcoded Worker URL inside the HTML).
 *
 * The Worker address comes from the WORKER_URL environment variable
 * (Pages project -> Settings -> Variables and secrets), e.g.
 * https://multi-tenant.<your-subdomain>.workers.dev
 */
export async function proxyToWorker(context) {
  const { request, env } = context;

  if (!env.WORKER_URL) {
    return new Response(
      JSON.stringify({
        error: {
          code: "PROXY_NOT_CONFIGURED",
          message: "WORKER_URL is not set on this Pages project.",
        },
      }),
      { status: 503, headers: { "Content-Type": "application/json" } }
    );
  }

  const incoming = new URL(request.url);
  const target = new URL(incoming.pathname + incoming.search, env.WORKER_URL);

  // Forward the request as-is (method, headers, body). Copy the headers
  // into a new object so we don't try to mutate the immutable originals.
  const headers = new Headers(request.headers);
  headers.delete("host");

  try {
    return await fetch(target.toString(), {
      method: request.method,
      headers,
      body: ["GET", "HEAD"].includes(request.method) ? undefined : request.body,
      redirect: "manual",
    });
  } catch (err) {
    return new Response(
      JSON.stringify({
        error: {
          code: "WORKER_UNREACHABLE",
          message: "Could not reach the API. Please try again in a moment.",
        },
      }),
      { status: 502, headers: { "Content-Type": "application/json" } }
    );
  }
}
