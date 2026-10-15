import { httpRouter } from "convex/server";
import { httpAction } from "./_generated/server";

/**
 * Gemini proxy. The browser SDK points its baseUrl at `<site>/gemini`, so a
 * request for `v1beta/models/gemini-3.6-flash:streamGenerateContent` arrives
 * here unchanged. We check the Clerk session, attach the key from the Convex
 * environment (`npx convex env set GEMINI_API_KEY ...`) and stream Google's
 * response straight back. The key never reaches the browser.
 */

const GEMINI_ORIGIN = "https://generativelanguage.googleapis.com";
const PREFIX = "/gemini/";

// Only the calls the app makes: ListModels (GET) and generateContent /
// streamGenerateContent on a Flash model (POST). Anything else is refused so a
// signed-in user can't use the key for files, tuning, embeddings and so on.
const LIST_PATH = /^v1beta\/models$/;
const GENERATE_PATH =
  /^v1beta\/models\/gemini-[a-z0-9.-]*flash[a-z0-9.-]*:(generateContent|streamGenerateContent)$/;

// Chat history is resent every turn, so this has to allow a long conversation.
const MAX_BODY_BYTES = 512 * 1024;

function corsHeaders(request: Request): Record<string, string> {
  return {
    // Auth is a bearer token, not a cookie, so any origin is safe to allow.
    "Access-Control-Allow-Origin": request.headers.get("Origin") ?? "*",
    "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
    "Access-Control-Allow-Headers":
      request.headers.get("Access-Control-Request-Headers") ??
      "Authorization, Content-Type",
    "Access-Control-Max-Age": "86400",
    Vary: "Origin",
  };
}

/** An error in Google's own shape, so the client's parseApiError reads it. */
function errorResponse(
  request: Request,
  code: number,
  status: string,
  message: string
) {
  return new Response(JSON.stringify({ error: { code, status, message } }), {
    status: code,
    headers: { ...corsHeaders(request), "Content-Type": "application/json" },
  });
}

const proxy = httpAction(async (ctx, request) => {
  // A malformed or expired token throws rather than returning null.
  const identity = await ctx.auth.getUserIdentity().catch(() => null);
  if (!identity) {
    return errorResponse(request, 401, "UNAUTHENTICATED", "Sign in to use the AI features.");
  }

  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    return errorResponse(
      request,
      500,
      "INTERNAL",
      "GEMINI_API_KEY is not set on this Convex deployment."
    );
  }

  const url = new URL(request.url);
  const path = url.pathname.slice(PREFIX.length);
  const allowed =
    request.method === "GET" ? LIST_PATH.test(path) : GENERATE_PATH.test(path);
  if (!allowed) {
    return errorResponse(request, 403, "PERMISSION_DENIED", `Not allowed: ${request.method} ${path}`);
  }

  let body: string | undefined;
  if (request.method === "POST") {
    body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return errorResponse(request, 413, "INVALID_ARGUMENT", "Request too large.");
    }
  }

  // The SDK never sends a key, but drop one if a caller tries to supply its own.
  url.searchParams.delete("key");
  const upstream = await fetch(`${GEMINI_ORIGIN}/${path}${url.search}`, {
    method: request.method,
    headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
    body,
  });

  const headers = new Headers(corsHeaders(request));
  const contentType = upstream.headers.get("Content-Type");
  if (contentType) headers.set("Content-Type", contentType);
  // Pass the body through as a stream so chat answers still arrive token by token.
  return new Response(upstream.body, { status: upstream.status, headers });
});

const preflight = httpAction(async (_ctx, request) => {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
});

const http = httpRouter();
http.route({ pathPrefix: PREFIX, method: "GET", handler: proxy });
http.route({ pathPrefix: PREFIX, method: "POST", handler: proxy });
http.route({ pathPrefix: PREFIX, method: "OPTIONS", handler: preflight });

export default http;
