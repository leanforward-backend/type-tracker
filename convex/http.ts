import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import type { AiKind } from "./entitlements";

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

/**
 * Background quote refills (quoteGenerator.js) are non-streaming, JSON-mode
 * calls with no tools. They keep the shared pools stocked on every page load,
 * so they come out of a daily cap instead of the user's AI credits. Everything
 * else (the chat) spends credits.
 *
 * The client controls the body, so a free user could dress a chat-style
 * request up as a refill. The daily cap bounds that, and JSON-only output
 * without search makes it a poor chatbot.
 */
function classify(path: string, body: string): AiKind {
  if (!path.endsWith(":generateContent")) return "chat";
  try {
    const parsed = JSON.parse(body);
    const jsonOnly = parsed?.generationConfig?.responseMimeType === "application/json";
    const noTools = !parsed?.tools || parsed.tools.length === 0;
    return jsonOnly && noTools ? "quotes" : "chat";
  } catch {
    return "chat";
  }
}

const LIMIT_MESSAGES: Record<AiKind, string> = {
  chat: "You've used all your AI uses. Upgrade to Pro for more.",
  quotes: "Today's quote refills are used up. Try again tomorrow.",
};

/**
 * A stream can answer 200 and carry the real error (often 503 "high demand")
 * in its first event, so a 200 alone doesn't mean the call worked. Read until
 * the first event shows candidates or an error, then hand back a stream that
 * replays what was read followed by the rest.
 */
async function peekStream(body: ReadableStream<Uint8Array>) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const buffered: Uint8Array[] = [];
  let text = "";
  let succeeded = false;
  while (true) {
    const { value, done } = await reader.read();
    if (done) break;
    buffered.push(value);
    text += decoder.decode(value, { stream: true });
    if (text.includes('"candidates"')) {
      succeeded = true;
      break;
    }
    if (text.includes('"error"') || text.length > 64 * 1024) break;
  }
  const replay = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of buffered) controller.enqueue(chunk);
    },
    async pull(controller) {
      const { value, done } = await reader.read();
      if (done) controller.close();
      else controller.enqueue(value);
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });
  return { succeeded, body: replay };
}

async function recordUse(
  ctx: ActionCtx,
  who: { userId: string; email?: string; emailVerified?: boolean },
  kind: AiKind
) {
  try {
    await ctx.runMutation(internal.entitlements.recordAiUse, { ...who, kind });
  } catch (err) {
    // Metering failing must not eat an answer the user is already receiving.
    console.error("Failed to record AI use:", err);
  }
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
  let kind: AiKind | null = null;
  const who = {
    userId: identity.subject,
    email: identity.email,
    emailVerified: identity.emailVerified,
  };
  if (request.method === "POST") {
    body = await request.text();
    if (body.length > MAX_BODY_BYTES) {
      return errorResponse(request, 413, "INVALID_ARGUMENT", "Request too large.");
    }
    kind = classify(path, body);
    const allowedToRun = await ctx.runQuery(internal.entitlements.canUseAi, { ...who, kind });
    if (!allowedToRun) {
      // 402, not 429: the client parks a model on 429, and this says nothing
      // about the model.
      return errorResponse(request, 402, "AI_LIMIT", LIMIT_MESSAGES[kind]);
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

  // Only answers that worked are charged, so the client's model-fallback
  // retries don't spend a credit per failed attempt.
  let responseBody: ReadableStream<Uint8Array> | null = upstream.body;
  if (kind && upstream.ok && upstream.body) {
    if (path.endsWith(":streamGenerateContent")) {
      const peeked = await peekStream(upstream.body);
      responseBody = peeked.body;
      if (peeked.succeeded) await recordUse(ctx, who, kind);
    } else {
      await recordUse(ctx, who, kind);
    }
  }
  // Pass the body through as a stream so chat answers still arrive token by token.
  return new Response(responseBody, { status: upstream.status, headers });
});

const preflight = httpAction(async (_ctx, request) => {
  return new Response(null, { status: 204, headers: corsHeaders(request) });
});

/** Stripe events. The signature is checked against the raw body in stripe.ts. */
const stripeWebhook = httpAction(async (ctx, request) => {
  const signature = request.headers.get("stripe-signature");
  if (!signature) return new Response("Missing signature", { status: 400 });
  const payload = await request.text();
  const { ok } = await ctx.runAction(internal.stripe.fulfill, { payload, signature });
  return new Response(null, { status: ok ? 200 : 400 });
});

const http = httpRouter();
http.route({ pathPrefix: PREFIX, method: "GET", handler: proxy });
http.route({ pathPrefix: PREFIX, method: "POST", handler: proxy });
http.route({ pathPrefix: PREFIX, method: "OPTIONS", handler: preflight });
http.route({ path: "/stripe/webhook", method: "POST", handler: stripeWebhook });

export default http;
