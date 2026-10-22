/**
 * OpenRouter through the Convex proxy (convex/http.ts), shaped like the parts
 * of the @google/genai client the app uses: `models.generateContent` and
 * `chats.create(...).sendMessageStream`. That lets `withModelFallback`, the
 * quote generator and the AI chat run unchanged on either provider.
 *
 * Errors are thrown with the HTTP status on `status` and the response body as
 * the message, the same shape the Gemini SDK throws, so `parseApiError` reads
 * both alike.
 */

const MAX_OUTPUT_TOKENS = 4096;

// OpenRouter's JSON mode only allows an object at the top level, so a prompt
// that asks for a JSON array gets this added; parseQuoteList unwraps it.
const JSON_OBJECT_HINT =
  'Reply with a single JSON object. If the reply is a list, put the list under one key, like {"items": [...]}.';

function httpError(status, body) {
  const err = new Error(body || `Request failed with status ${status}`);
  err.status = status;
  return err;
}

/** Text from a string, a Gemini Content ({ parts }) or a list of either. */
function toText(value) {
  if (!value) return "";
  if (typeof value === "string") return value;
  if (Array.isArray(value)) return value.map(toText).filter(Boolean).join("\n");
  if (Array.isArray(value.parts)) return value.parts.map((p) => p?.text ?? "").join("");
  if (typeof value.text === "string") return value.text;
  return "";
}

/** Yields `{ text }` per server-sent event, like the Gemini SDK's stream. */
async function* readEvents(response) {
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  try {
    for (;;) {
      const { value, done } = await reader.read();
      if (done) return;
      buffer += decoder.decode(value, { stream: true });
      let newline;
      while ((newline = buffer.indexOf("\n")) !== -1) {
        const line = buffer.slice(0, newline).trim();
        buffer = buffer.slice(newline + 1);
        // Blank lines separate events; ": OPENROUTER PROCESSING" is a keep-alive.
        if (!line.startsWith("data:")) continue;
        const data = line.slice(5).trim();
        if (data === "[DONE]") return;
        let event;
        try {
          event = JSON.parse(data);
        } catch {
          continue;
        }
        const choice = event.choices?.[0];
        if (event.error || choice?.finish_reason === "error") {
          const error = event.error ?? { code: 502, message: "The model stopped with an error." };
          throw httpError(error.code || 502, JSON.stringify({ error }));
        }
        const text = choice?.delta?.content;
        yield { text: typeof text === "string" ? text : "" };
      }
    }
  } finally {
    reader.cancel().catch(() => {});
  }
}

/**
 * @param {{ url?: string, getHeaders: () => Promise<Record<string, string>> }} options
 *   `getHeaders` supplies the Authorization header and throws when signed out.
 */
export function createOpenRouterClient({ url, getHeaders }) {
  async function post(body, signal) {
    if (!url) throw new Error("VITE_CONVEX_URL is not set, so there is no AI proxy to call.");
    const headers = { ...(await getHeaders()), "Content-Type": "application/json" };
    const response = await fetch(url, {
      method: "POST",
      headers,
      body: JSON.stringify(body),
      signal,
    });
    if (!response.ok) {
      throw httpError(response.status, await response.text().catch(() => ""));
    }
    return response;
  }

  const systemMessage = (text) => (text ? [{ role: "system", content: text }] : []);

  async function generateContent({ model, contents, config = {} }) {
    const json = config.responseMimeType === "application/json";
    const system = [toText(config.systemInstruction), json ? JSON_OBJECT_HINT : ""]
      .filter(Boolean)
      .join("\n\n");
    const body = {
      model,
      messages: [...systemMessage(system), { role: "user", content: toText(contents) }],
      stream: false,
      max_tokens: MAX_OUTPUT_TOKENS,
    };
    if (typeof config.temperature === "number") body.temperature = config.temperature;
    if (json) body.response_format = { type: "json_object" };

    const data = await (await post(body, config.abortSignal)).json();
    if (data?.error) {
      throw httpError(data.error.code || 502, JSON.stringify({ error: data.error }));
    }
    const text = data?.choices?.[0]?.message?.content;
    return { text: typeof text === "string" ? text : "" };
  }

  function createChat({ model, config = {}, history = [] }) {
    const turns = history.map((content) => ({
      role: content.role === "model" ? "assistant" : "user",
      content: toText(content),
    }));
    return {
      async sendMessageStream({ message, config: callConfig }) {
        // A per-call config replaces the session's, as in the Gemini SDK.
        const cfg = callConfig ?? config;
        const userText = toText(message);
        const response = await post(
          {
            model,
            messages: [
              ...systemMessage(toText(cfg.systemInstruction)),
              ...turns,
              { role: "user", content: userText },
            ],
            stream: true,
            max_tokens: MAX_OUTPUT_TOKENS,
          },
          cfg.abortSignal
        );
        return (async function* () {
          let reply = "";
          for await (const chunk of readEvents(response)) {
            reply += chunk.text;
            yield chunk;
          }
          // Like the Gemini chat, the turn joins the history once the reply is complete.
          turns.push({ role: "user", content: userText }, { role: "assistant", content: reply });
        })();
      },
    };
  }

  return {
    models: { generateContent },
    chats: { create: createChat },
  };
}
