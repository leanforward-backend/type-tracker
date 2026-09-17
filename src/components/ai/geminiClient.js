import { GoogleGenAI } from "@google/genai";

// `import.meta.env` only exists under Vite. Guarding it lets this module load
// in plain Node (scripts, tests) without a bundler in front of it.
const env = import.meta.env ?? {};

export const ai = new GoogleGenAI({ apiKey: env.VITE_GEMINI_API_KEY });

// Only consulted when ListModels itself fails (offline, key rejected, API
// outage). Discovery is the real source of truth so this list going stale is
// harmless as long as at least one entry still resolves.
const DEFAULT_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.6-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];

// The newest Flash release is the one everybody piles onto, and the one that
// keeps answering 503 "high demand". Start one release back and keep the
// newest as a fallback. This is a rule, not a hardcoded name, so it stays
// correct when the next release lands. VITE_GEMINI_MODEL still wins outright.
const DEMOTE_NEWEST_MODEL = true;

// Gemini 3.x models think by default and spend far more tokens reasoning than
// answering. "low" keeps quality for these prompts while cutting
// time-to-first-token. Models that reject the field get it stripped
// automatically (see `withModelFallback`).
export const FAST_THINKING = { thinkingLevel: "low" };

/**
 * How long a model sits out after each kind of failure. These persist across
 * page loads (localStorage) so a fresh tab doesn't re-learn that a model is
 * retired or out of quota by burning a request on it.
 */
const COOLDOWN_MS = {
  // 503 UNAVAILABLE "high demand" is per-model. We rotate to another model
  // immediately, so this only decides how long the busy one stays at the back
  // of the queue. Spikes we've observed last minutes rather than seconds.
  overloaded: 3 * 60_000,
  // 500/502/504/408: generic server hiccup.
  serverError: 30_000,
  // 429 with a per-minute limit in the message.
  perMinuteQuota: 60_000,
  // 429 with a per-day limit. The free tier's daily allowance resets at
  // midnight Pacific, so an hour is a compromise between re-checking and
  // hammering a quota that is already gone.
  dailyQuota: 60 * 60_000,
  // 429 we couldn't classify.
  unknownQuota: 15 * 60_000,
  // 400: this model rejected something in our request config.
  badRequest: 10 * 60_000,
  // 404/403: retired, or not enabled for this key. ListModels keeps
  // advertising retired models (gemini-2.5-flash still shows up while
  // returning "no longer available to new users"), so remember this for a day.
  gone: 24 * 60 * 60_000,
};

const MODEL_DISCOVERY_TTL_MS = 10 * 60_000;
const MODEL_DISCOVERY_RETRY_MS = 60_000;

const RETRYABLE_CODES = new Set([408, 500, 502, 503, 504]);
// Passes over the candidate list. Round one tries each model once, rotating on
// the first failure because a 503 is per-model and another model is usually
// fine; round two comes back to the transient failures after a backoff.
const MAX_ROUNDS = 2;
// Hard cap on requests for one user action, across every model and round.
// Rejected requests (5xx) do not count against quota, so this is a latency
// bound more than a quota one.
const MAX_TOTAL_ATTEMPTS = 8;
// A response that came back 200 but failed the caller's own validation gets
// re-rolled on the same model this many times before we move on.
const MAX_REROLLS = 1;
// A request that has produced nothing after this long is abandoned and the
// next model is tried. The SDK has no timeout of its own, so without this one
// stuck connection would hang a user action (and any lock around it) forever.
// For streams this only covers time-to-first-text; once chunks flow the timer
// is cleared, so long answers are never cut off.
const OPEN_TIMEOUT_MS = 30_000;
const DISCOVERY_TIMEOUT_MS = 15_000;
const BASE_BACKOFF_MS = 1_000;
const MAX_BACKOFF_MS = 8_000;

const STATUS_CODES = {
  UNAVAILABLE: 503,
  RESOURCE_EXHAUSTED: 429,
  NOT_FOUND: 404,
  PERMISSION_DENIED: 403,
  UNAUTHENTICATED: 401,
  INVALID_ARGUMENT: 400,
  FAILED_PRECONDITION: 400,
  DEADLINE_EXCEEDED: 504,
  INTERNAL: 500,
  ABORTED: 409,
};

const STORAGE_KEY = "type-tracker:gemini-model-health:v1";

// ---------------------------------------------------------------------------
// Persisted model health
// ---------------------------------------------------------------------------

/**
 * @typedef {{
 *   cooldowns: Record<string, { until: number, code: number }>,
 *   noThinking: Record<string, number>,
 *   lastGood: string | null,
 * }} HealthState
 */

/** @returns {HealthState} */
function emptyState() {
  return { cooldowns: {}, noThinking: {}, lastGood: null };
}

function loadState() {
  try {
    const raw = globalThis.localStorage?.getItem(STORAGE_KEY);
    if (!raw) return emptyState();
    const parsed = JSON.parse(raw);
    return {
      cooldowns: parsed?.cooldowns && typeof parsed.cooldowns === "object" ? parsed.cooldowns : {},
      noThinking: parsed?.noThinking && typeof parsed.noThinking === "object" ? parsed.noThinking : {},
      lastGood: typeof parsed?.lastGood === "string" ? parsed.lastGood : null,
    };
  } catch {
    return emptyState();
  }
}

/** @type {HealthState} */
const state = loadState();

function saveState() {
  try {
    globalThis.localStorage?.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // Storage may be full, disabled, or absent (Node). In-memory still works.
  }
}

function pruneExpired() {
  const now = Date.now();
  let changed = false;
  for (const [model, entry] of Object.entries(state.cooldowns)) {
    if (!entry || typeof entry.until !== "number" || now >= entry.until) {
      delete state.cooldowns[model];
      changed = true;
    }
  }
  for (const [model, until] of Object.entries(state.noThinking)) {
    if (typeof until !== "number" || now >= until) {
      delete state.noThinking[model];
      changed = true;
    }
  }
  if (changed) saveState();
}

/** True when the cooldown reason is one a retry cannot wait out. */
function isHardCode(code) {
  return code === 429 || code === 404 || code === 403 || code === 401 || code === 400;
}

/**
 * Puts a model on cooldown sized to the failure. Exported so callers that run
 * their own request loop can still feed the shared health table.
 */
export function markModelFailed(modelName, err) {
  if (!modelName) return;
  const { code, retryDelayMs, quotaScope } = parseApiError(err);

  let cooldown;
  if (code === 429) {
    if (quotaScope === "day") cooldown = COOLDOWN_MS.dailyQuota;
    else if (quotaScope === "minute") cooldown = COOLDOWN_MS.perMinuteQuota;
    else cooldown = COOLDOWN_MS.unknownQuota;
    cooldown = Math.max(cooldown, retryDelayMs);
  } else if (code === 404 || code === 403 || code === 401) {
    cooldown = COOLDOWN_MS.gone;
  } else if (code === 400) {
    cooldown = COOLDOWN_MS.badRequest;
  } else if (code === 503) {
    cooldown = Math.max(COOLDOWN_MS.overloaded, retryDelayMs);
  } else {
    cooldown = Math.max(COOLDOWN_MS.serverError, retryDelayMs);
  }

  state.cooldowns[modelName] = { until: Date.now() + cooldown, code };
  if (state.lastGood === modelName && isHardCode(code)) state.lastGood = null;
  saveState();
}

export function markModelGood(modelName) {
  if (!modelName) return;
  delete state.cooldowns[modelName];
  state.lastGood = modelName;
  saveState();
}

function disableThinking(modelName) {
  state.noThinking[modelName] = Date.now() + COOLDOWN_MS.gone;
  saveState();
}

/** The thinking config this model is known to accept (undefined = none). */
export function thinkingConfigFor(modelName) {
  pruneExpired();
  return state.noThinking[modelName] ? undefined : FAST_THINKING;
}

/** Snapshot of the health table, for debugging in the console. */
export function getModelHealth() {
  pruneExpired();
  return {
    lastGood: state.lastGood,
    cooldowns: Object.fromEntries(
      Object.entries(state.cooldowns).map(([m, c]) => [
        m,
        { code: c.code, secondsLeft: Math.max(0, Math.round((c.until - Date.now()) / 1000)) },
      ])
    ),
    noThinking: Object.keys(state.noThinking),
  };
}

// ---------------------------------------------------------------------------
// Error parsing
// ---------------------------------------------------------------------------

/**
 * The SDK stringifies the upstream error body into `error.message`, sometimes
 * double-encoded, and puts the HTTP status on `error.status` (numeric) rather
 * than `error.code`. Older builds used the string status enum instead. Dig the
 * useful bits out of whichever shape shows up.
 *
 * @returns {{ code: number, status: string, message: string, retryDelayMs: number,
 *             quotaScope: "day" | "minute" | "", isNetwork: boolean }}
 */
export function parseApiError(err) {
  const empty = { code: 0, status: "", message: "", retryDelayMs: 0, quotaScope: "", isNetwork: false };
  if (!err) return empty;

  let code = typeof err.code === "number" ? err.code : 0;
  if (!code && typeof err.status === "number") code = err.status;
  let status = typeof err.status === "string" ? err.status : "";
  let retryDelayMs = 0;

  const raw = typeof err.message === "string" ? err.message : String(err);
  let message = raw;
  let payload = null;
  try {
    payload = JSON.parse(raw);
  } catch {
    const brace = raw.indexOf("{");
    if (brace !== -1) {
      try {
        payload = JSON.parse(raw.slice(brace));
      } catch {
        payload = null;
      }
    }
  }

  // Unwrap however many layers of { error: ... } / JSON-in-a-string the SDK left.
  for (let depth = 0; payload && depth < 4; depth++) {
    const inner = payload.error ?? payload;
    if (typeof inner === "string") {
      try {
        payload = JSON.parse(inner);
        continue;
      } catch {
        break;
      }
    }
    if (typeof inner !== "object" || inner === null) break;
    if (typeof inner.code === "number" && !code) code = inner.code;
    if (typeof inner.status === "string" && inner.status) status = inner.status;
    const retryInfo = Array.isArray(inner.details)
      ? inner.details.find((d) => String(d?.["@type"] || "").includes("RetryInfo"))
      : null;
    const delay = retryInfo?.retryDelay;
    if (typeof delay === "string") {
      retryDelayMs = Math.round(parseFloat(delay) * 1000) || 0;
    } else if (delay && typeof delay.seconds !== "undefined") {
      retryDelayMs = Math.round(Number(delay.seconds) * 1000) || 0;
    }
    if (typeof inner.message === "string") {
      message = inner.message;
      if (inner.message.trim().startsWith("{")) {
        try {
          payload = JSON.parse(inner.message);
          continue;
        } catch {
          break;
        }
      }
    }
    break;
  }

  if (!code && status && STATUS_CODES[status]) code = STATUS_CODES[status];
  if (!code) {
    const match = raw.match(/\b(4\d{2}|5\d{2})\b/);
    if (match) code = parseInt(match[1], 10);
  }
  if (!status) {
    const match = raw.match(/\b(UNAVAILABLE|RESOURCE_EXHAUSTED|NOT_FOUND|PERMISSION_DENIED|INVALID_ARGUMENT|INTERNAL|DEADLINE_EXCEEDED)\b/);
    if (match) {
      status = match[1];
      if (!code) code = STATUS_CODES[status] ?? 0;
    }
  }

  let quotaScope = "";
  if (code === 429) {
    if (/per\s*day|daily|PerDay/i.test(message)) quotaScope = "day";
    else if (/per\s*minute|PerMinute/i.test(message)) quotaScope = "minute";
  }

  // fetch() rejects with a TypeError ("Failed to fetch", "NetworkError when
  // attempting to fetch resource", "Load failed") when offline, and with an
  // AbortError when our open timeout fires. The SDK sometimes re-wraps these
  // as a plain Error ("exception AbortError: ... sending request"), so match
  // on the message rather than the error name.
  const isNetwork =
    !code &&
    /fetch|network|load failed|abort|time(d)?\s?out|ECONN|ENOTFOUND/i.test(raw);

  return { code, status, message, retryDelayMs, quotaScope, isNetwork };
}

/** Failures worth trying again -- on this model later, or another model now. */
export function isRetryable(err) {
  if (err?.retryable === true) return true;
  const { code, isNetwork } = parseApiError(err);
  return isNetwork || RETRYABLE_CODES.has(code);
}

// ---------------------------------------------------------------------------
// Model discovery
// ---------------------------------------------------------------------------

let _discovery = null; // { promise, expiresAt }

function flashVersion(name) {
  // "gemini-3.8-flash" -> 3.8, "gemini-4-flash-001" -> 4, "gemini-flash-latest" -> 0.
  const match = name.match(/^gemini-(\d+(?:\.\d+)?)-flash/);
  return match ? parseFloat(match[1]) : 0;
}

function isEligibleModel(m) {
  const name = (m?.name || "").replace(/^models\//, "");
  if (!name.startsWith("gemini-") || !name.includes("flash")) return false;
  // Variants that either have no free-tier quota (preview/exp/lite/omni) or are
  // not text chat models at all.
  const excluded = ["omni", "preview", "lite", "exp", "image", "audio", "tts", "live", "native", "transcribe", "embedding", "robotics", "computer"];
  if (excluded.some((word) => name.includes(word))) return false;
  const actions = m?.supportedActions;
  return !Array.isArray(actions) || actions.includes("generateContent");
}

async function discoverModels() {
  if (_discovery && Date.now() < _discovery.expiresAt) {
    return _discovery.promise;
  }

  // Cache the promise, not the result, so concurrent callers share one
  // ListModels round trip instead of each paying for their own.
  let discoveryFailed = false;
  const promise = (async () => {
    const models = [];
    const envModel = env.VITE_GEMINI_MODEL;
    if (envModel) models.push(envModel);

    try {
      const discovered = [];
      // ListModels has no timeout either; don't let a stalled listing hold up
      // the first request when the static defaults would do.
      const listing = (async () => {
        const found = [];
        for await (const m of await ai.models.list()) {
          if (!isEligibleModel(m)) continue;
          const name = m.name.replace(/^models\//, "");
          found.push({ name, version: flashVersion(name) });
        }
        return found;
      })();
      let timer;
      const timeout = new Promise((_, reject) => {
        timer = setTimeout(
          () => reject(new Error(`ListModels timed out after ${DISCOVERY_TIMEOUT_MS}ms`)),
          DISCOVERY_TIMEOUT_MS
        );
      });
      try {
        discovered.push(...(await Promise.race([listing, timeout])));
      } finally {
        clearTimeout(timer);
      }
      discovered.sort((a, b) => b.version - a.version);
      const numbered = discovered.filter((d) => d.version > 0);
      if (DEMOTE_NEWEST_MODEL && numbered.length >= 2) {
        const newest = discovered.shift();
        discovered.push(newest);
      }
      for (const { name } of discovered) {
        if (!models.includes(name)) models.push(name);
      }
      if (discovered.length === 0) discoveryFailed = true;
    } catch (err) {
      discoveryFailed = true;
      console.warn("[geminiClient] Error discovering models from API:", err?.message || err);
    }

    for (const def of DEFAULT_MODELS) {
      if (!models.includes(def)) models.push(def);
    }
    return models;
  })();

  _discovery = { promise, expiresAt: Date.now() + MODEL_DISCOVERY_TTL_MS };
  promise.then(
    () => {
      // A failed listing falls back to the static defaults; re-check soon
      // rather than pinning that fallback for the full TTL.
      if (discoveryFailed && _discovery?.promise === promise) {
        _discovery.expiresAt = Date.now() + MODEL_DISCOVERY_RETRY_MS;
      }
    },
    () => {
      if (_discovery?.promise === promise) _discovery = null;
    }
  );
  return promise;
}

/**
 * Splits the pool into the order we'll actually call it in:
 *   1. the caller's preferred model (the one its live session is on),
 *   2. whatever worked most recently (persisted, survives reloads),
 *   3. every other model not on cooldown, newest first,
 *   4. models on a *transient* cooldown (503 etc.), soonest-to-expire first.
 * Models on a hard cooldown (429 / 404 / 403 / 400) are left out entirely.
 */
function orderCandidates(pool, preferredModel) {
  pruneExpired();
  const inPool = new Set(pool);
  const seen = new Set();
  const ready = [];
  const parked = [];
  const blocked = [];

  // Preferred / last-good only jump the queue if discovery still lists them.
  // A model that has dropped off ListModels is not worth a request to confirm.
  const consider = (model) => {
    if (!model || seen.has(model) || !inPool.has(model)) return;
    seen.add(model);
    const cd = state.cooldowns[model];
    if (!cd) ready.push(model);
    else if (isHardCode(cd.code)) blocked.push({ model, code: cd.code });
    else parked.push({ model, until: cd.until });
  };

  consider(preferredModel);
  consider(state.lastGood);
  for (const m of pool) consider(m);

  parked.sort((a, b) => a.until - b.until);
  return {
    candidates: [...ready, ...parked.map((p) => p.model)],
    blocked,
  };
}

/**
 * Gemini Flash models in the order `withModelFallback` would try them right
 * now. Never empty unless every model is on a hard cooldown.
 */
export async function getAvailableFlashModels(preferredModel = null) {
  const pool = await discoverModels();
  return orderCandidates(pool, preferredModel).candidates;
}

// ---------------------------------------------------------------------------
// Streaming helper
// ---------------------------------------------------------------------------

function chunkText(chunk) {
  try {
    const t = chunk?.text;
    return typeof t === "function" ? t.call(chunk) : t || "";
  } catch {
    return "";
  }
}

/**
 * Pulls the first chunk of a stream before handing it back.
 *
 * The streaming endpoint answers HTTP 200 and then, when the model is
 * overloaded, delivers the 503 as the *first server-sent event in the body*.
 * The SDK only throws that when the body is read, i.e. during `for await`, so
 * an un-primed stream looks like a successful open to `withModelFallback` and
 * the failure escapes the retry loop. Call this inside the `fn` you pass to
 * `withModelFallback` so that first-event errors rotate models like any other.
 *
 * Errors after the first chunk still surface from iteration; by then text has
 * been shown and a silent retry would replay it.
 */
export async function primeStream(iterable) {
  const iterator = iterable[Symbol.asyncIterator]();
  // Read until the first chunk that carries visible text (or the end), so an
  // error that follows an empty or thought-only leading event is still caught
  // here rather than in the consumer.
  const buffered = [];
  let ended = false;
  for (;;) {
    const next = await iterator.next();
    if (next.done) {
      ended = true;
      break;
    }
    buffered.push(next.value);
    if (chunkText(next.value)) break;
  }
  return (async function* () {
    try {
      yield* buffered;
      if (ended) return;
      for (;;) {
        const next = await iterator.next();
        if (next.done) return;
        yield next.value;
      }
    } finally {
      // Propagate early exits (break/throw in the consumer) to the source.
      await iterator.return?.();
    }
  })();
}

// ---------------------------------------------------------------------------
// Fallback runner
// ---------------------------------------------------------------------------

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function backoffDelay(round, retryDelayMs) {
  if (retryDelayMs > 0) return Math.min(retryDelayMs, MAX_BACKOFF_MS);
  const exponential = Math.min(BASE_BACKOFF_MS * 2 ** round, MAX_BACKOFF_MS);
  // Full jitter, so parallel callers that failed together don't retry together.
  return Math.round(exponential * (0.5 + Math.random() * 0.5));
}

function exhaustedError(blocked) {
  const codes = blocked.map((b) => b.code);
  const code = codes.includes(429) ? 429 : codes.includes(404) ? 404 : codes[0] ?? 429;
  const err = new Error(
    code === 429
      ? "Every Gemini model is out of quota right now."
      : "No Gemini model is usable with this API key right now."
  );
  err.code = code;
  err.allModelsExhausted = true;
  return err;
}

/**
 * Runs `fn(modelName, ctx)` against the first model that works.
 *
 * Strategy: 503 "high demand" is a per-model condition, so round one gives
 * every model a single shot and rotates on the first failure. Only if the whole
 * pool was transiently busy do we back off and take a second pass. Models that
 * fail for reasons a retry cannot fix (quota, retired, forbidden) are parked and
 * remembered across reloads, so the next visit doesn't rediscover them.
 *
 * `ctx` is `{ attempt, round, thinkingConfig, abortSignal }`. Callers should
 * pass `ctx.thinkingConfig` straight through: when a model rejects the thinking
 * field with a 400 we retry it once without, and remember that for the model.
 * Pass `ctx.abortSignal` as `config.abortSignal` so a request that produces
 * nothing within `openTimeoutMs` is abandoned in favour of the next model.
 *
 * `fn` should only cover establishing the request. Do any streaming iteration
 * in the caller, so a mid-stream failure can't replay text already shown.
 *
 * Throw an error with `retryable = true` from `fn` to re-roll a response that
 * came back OK over HTTP but failed your own validation.
 */
export async function withModelFallback(fn, options = {}) {
  const {
    preferredModel = null,
    models: explicitModels = null,
    maxRounds = MAX_ROUNDS,
    maxTotalAttempts = MAX_TOTAL_ATTEMPTS,
    maxRerolls = MAX_REROLLS,
    openTimeoutMs = OPEN_TIMEOUT_MS,
    onAttempt = null,
    label = "geminiClient",
  } = options;

  const pool = explicitModels ?? (await discoverModels());
  let { candidates, blocked } = orderCandidates(pool, preferredModel);

  if (candidates.length === 0) {
    // Everything is parked for a reason a retry can't fix, almost always daily
    // quota on every model. Failing fast beats spending requests to confirm it.
    throw exhaustedError(blocked);
  }

  let lastError = new Error("No Gemini models available to call.");
  let lastRetryDelayMs = 0;
  let attempts = 0;

  for (let round = 0; round < maxRounds && candidates.length > 0; round++) {
    if (round > 0) await sleep(backoffDelay(round - 1, lastRetryDelayMs));

    const survivors = [];
    for (const model of candidates) {
      if (attempts >= maxTotalAttempts) break;

      let rerolls = 0;
      let thinkingConfig = thinkingConfigFor(model);

      // Inner loop only repeats the *same* model for things that don't reflect
      // on the model's health: a validation re-roll, or stripping a config
      // field it rejected.
      for (;;) {
        attempts++;
        // Pass `ctx.abortSignal` as `config.abortSignal` so a stalled request
        // is abandoned and the next model tried, instead of hanging forever.
        const controller = new AbortController();
        const timer = setTimeout(() => {
          const reason = new Error(`Gemini request timed out after ${openTimeoutMs}ms`);
          reason.name = "TimeoutError";
          controller.abort(reason);
        }, openTimeoutMs);
        const ctx = { attempt: attempts, round, thinkingConfig, abortSignal: controller.signal };
        try {
          onAttempt?.(model, ctx);
          const result = await fn(model, ctx);
          markModelGood(model);
          return { result, model };
        } catch (err) {
          lastError = err;
          const info = parseApiError(err);
          if (info.retryDelayMs) lastRetryDelayMs = info.retryDelayMs;

          console.warn(
            `[${label}] '${model}' failed (${info.code || (info.isNetwork ? "network" : "?")} ${info.status || info.message || ""})`,
            `- attempt ${attempts}/${maxTotalAttempts}, round ${round + 1}/${maxRounds}`
          );

          if (err?.retryable === true && err.name !== "ApiError") {
            // The model answered; we just didn't like the answer.
            if (rerolls++ < maxRerolls && attempts < maxTotalAttempts) continue;
            survivors.push(model);
            break;
          }

          if (info.code === 400 && thinkingConfig && /thinking/i.test(info.message)) {
            disableThinking(model);
            thinkingConfig = undefined;
            if (attempts < maxTotalAttempts) continue;
            break;
          }

          markModelFailed(model, err);
          if (isRetryable(err)) survivors.push(model);
          break;
        } finally {
          clearTimeout(timer);
        }
      }
    }

    candidates = survivors;
  }

  throw lastError;
}
