import { httpRouter } from "convex/server";
import { internal } from "./_generated/api";
import { httpAction, type ActionCtx } from "./_generated/server";
import { defaultAiChoice } from "./aiConfig";
import { OPENROUTER_MODELS } from "./aiModels";
import { isAdmin, type AiKind } from "./entitlements";

/**
 * AI proxies: Gemini below, OpenRouter further down.
 *
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

/** Reads the start of a stream: true = it worked, false = it failed, null = can't tell yet. */
type StreamJudge = (text: string) => boolean | null;

const judgeGemini: StreamJudge = (text) =>
  text.includes('"candidates"') ? true : text.includes('"error"') ? false : null;

// OpenRouter's error chunks also carry `choices` (finish_reason "error"), so
// check for the error first.
const judgeOpenRouter: StreamJudge = (text) =>
  /"error"\s*:/.test(text) ? false : text.includes('"choices"') ? true : null;

/**
 * A stream can answer 200 and carry the real error (often 503 "high demand")
 * in its first event, so a 200 alone doesn't mean the call worked. Read until
 * the first event shows an answer or an error, then hand back a stream that
 * replays what was read followed by the rest.
 */
async function peekStream(body: ReadableStream<Uint8Array>, judge: StreamJudge) {
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
    const verdict = judge(text);
    if (verdict !== null) {
      succeeded = verdict;
      break;
    }
    if (text.length > 64 * 1024) break;
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
      const peeked = await peekStream(upstream.body, judgeGemini);
      responseBody = peeked.body;
      if (peeked.succeeded) await recordUse(ctx, who, kind);
    } else {
      await recordUse(ctx, who, kind);
    }
  }
  // Pass the body through as a stream so chat answers still arrive token by token.
  return new Response(responseBody, { status: upstream.status, headers });
});

/**
 * OpenRouter proxy, for the models in aiModels.ts. The browser posts an
 * OpenAI-style chat completion to `<site>/openrouter/chat/completions`; we
 * check the session and the user's AI allowance exactly as for Gemini, then
 * forward it with the key from `npx convex env set OPENROUTER_API_KEY ...`.
 */
const OPENROUTER_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_PATH = "/openrouter/chat/completions";
const MAX_OUTPUT_TOKENS = 8192;
const MESSAGE_ROLES = new Set(["system", "user", "assistant"]);

type CleanRequest = { body: Record<string, unknown>; stream: boolean; kind: AiKind };

/**
 * Rebuilds the request from only the fields the app uses. The model must be
 * one of ours, and routing, reasoning and the output cap come from here, so a
 * caller can't choose a pricier provider, add web search or list fallback
 * models of their own.
 */
function cleanOpenRouterRequest(raw: unknown): CleanRequest | string {
  if (!raw || typeof raw !== "object") return "The body must be a JSON object.";
  const req = raw as Record<string, unknown>;
  const model = typeof req.model === "string" ? req.model : "";
  const spec = OPENROUTER_MODELS[model];
  if (!spec) return `Model not allowed: ${model || "(none)"}`;
  if (!Array.isArray(req.messages) || req.messages.length === 0) return "messages is required.";

  const messages: { role: string; content: string }[] = [];
  for (const m of req.messages as { role?: unknown; content?: unknown }[]) {
    if (!m || typeof m.role !== "string" || !MESSAGE_ROLES.has(m.role) || typeof m.content !== "string") {
      return "Each message needs a role (system, user or assistant) and text content.";
    }
    messages.push({ role: m.role, content: m.content });
  }

  const stream = req.stream === true;
  const json = (req.response_format as { type?: unknown } | undefined)?.type === "json_object";
  const requested = Number(req.max_tokens);
  const body: Record<string, unknown> = {
    model,
    messages,
    stream,
    max_tokens: Number.isFinite(requested) && requested > 0
      ? Math.min(requested, MAX_OUTPUT_TOKENS)
      : MAX_OUTPUT_TOKENS,
    provider: spec.provider,
    reasoning: spec.reasoning,
  };
  if (typeof req.temperature === "number" && spec.acceptsTemperature !== false) {
    body.temperature = Math.min(Math.max(req.temperature, 0), 2);
  }
  if (json) body.response_format = { type: "json_object" };
  // Same rule as classify() for Gemini: non-streaming JSON calls are quote refills.
  return { body, stream, kind: !stream && json ? "quotes" : "chat" };
}

const openRouterProxy = httpAction(async (ctx, request) => {
  const identity = await ctx.auth.getUserIdentity().catch(() => null);
  if (!identity) {
    return errorResponse(request, 401, "UNAUTHENTICATED", "Sign in to use the AI features.");
  }

  const apiKey = process.env.OPENROUTER_API_KEY;
  if (!apiKey) {
    return errorResponse(
      request,
      500,
      "PROVIDER_ERROR",
      "OPENROUTER_API_KEY is not set on this Convex deployment."
    );
  }

  const text = await request.text();
  if (text.length > MAX_BODY_BYTES) {
    return errorResponse(request, 413, "INVALID_ARGUMENT", "Request too large.");
  }
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return errorResponse(request, 400, "INVALID_ARGUMENT", "The body isn't valid JSON.");
  }
  const clean = cleanOpenRouterRequest(parsed);
  if (typeof clean === "string") {
    return errorResponse(request, 400, "INVALID_ARGUMENT", clean);
  }
  // Only admins pick their own model; everyone else gets the default choice's.
  if (!isAdmin(identity) && !defaultAiChoice().models.includes(clean.body.model as string)) {
    return errorResponse(request, 403, "PERMISSION_DENIED", "That AI model isn't available.");
  }

  const who = {
    userId: identity.subject,
    email: identity.email,
    emailVerified: identity.emailVerified,
  };
  const allowedToRun = await ctx.runQuery(internal.entitlements.canUseAi, { ...who, kind: clean.kind });
  if (!allowedToRun) {
    return errorResponse(request, 402, "AI_LIMIT", LIMIT_MESSAGES[clean.kind]);
  }

  const upstream = await fetch(OPENROUTER_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
      // Optional attribution OpenRouter shows on its dashboard.
      "X-Title": "Type Tracker",
      ...(process.env.SITE_URL ? { "HTTP-Referer": process.env.SITE_URL } : {}),
    },
    body: JSON.stringify(clean.body),
  });

  if (!upstream.ok) {
    const detail = await upstream.text();
    // These are about our OpenRouter account, not the model or the user, and
    // 401/402 already mean "sign in" and "out of AI uses" to the client.
    if (upstream.status === 401 || upstream.status === 402) {
      console.error(`OpenRouter ${upstream.status}:`, detail);
      return errorResponse(
        request,
        500,
        "PROVIDER_ERROR",
        upstream.status === 401
          ? "OpenRouter rejected the API key."
          : "The OpenRouter account is out of credit."
      );
    }
    // 403 is OpenRouter's moderation flagging the input. As 403 the client
    // would park the model for a day; it is about this request only.
    const status = upstream.status === 403 ? 400 : upstream.status;
    return new Response(detail, {
      status,
      headers: { ...corsHeaders(request), "Content-Type": "application/json" },
    });
  }

  const headers = new Headers(corsHeaders(request));
  headers.set("Content-Type", upstream.headers.get("Content-Type") ?? "application/json");

  if (clean.stream && upstream.body) {
    const peeked = await peekStream(upstream.body, judgeOpenRouter);
    if (peeked.succeeded) await recordUse(ctx, who, clean.kind);
    return new Response(peeked.body, { status: upstream.status, headers });
  }

  // A non-streaming reply is small and can still be an error behind a 200.
  const reply = await upstream.text();
  if (judgeOpenRouter(reply) === true) await recordUse(ctx, who, clean.kind);
  return new Response(reply, { status: upstream.status, headers });
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
http.route({ path: OPENROUTER_PATH, method: "POST", handler: openRouterProxy });
http.route({ path: OPENROUTER_PATH, method: "OPTIONS", handler: preflight });
http.route({ path: "/stripe/webhook", method: "POST", handler: stripeWebhook });

export default http;
