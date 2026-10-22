import { isTypingFriendly } from "../../../convex/quoteRules";
import { dedupeQuotes } from "../../../convex/quoteSimilarity";
import { ai, parseApiError, withModelFallback } from "./geminiClient";
import {
  buildBatchPrompt,
  CATEGORY_PROMPT_CONFIG,
  cleanQuote,
  sample,
  SYSTEM_INSTRUCTION,
} from "./quotePrompts";

const RATE_LIMIT_PER_MINUTE = 15;
const BATCH_TIMEOUT_MS = 60_000;
const MIN_DELAY_MS = Math.ceil((60 * 1000) / RATE_LIMIT_PER_MINUTE);

let lastRequestTime = 0;

async function waitForRateLimit() {
  const now = Date.now();
  if (lastRequestTime === 0) {
    lastRequestTime = now;
    return;
  }

  const timeSinceLastRequest = now - lastRequestTime;

  if (timeSinceLastRequest < MIN_DELAY_MS) {
    const waitTime = MIN_DELAY_MS - timeSinceLastRequest;
    console.log(`Rate limiting: waiting ${waitTime}ms before next request`);
    await new Promise((resolve) => setTimeout(resolve, waitTime));
  }

  lastRequestTime = Date.now();
}

const logAttempt = (model, { attempt }) =>
  console.log(
    `[quoteGenerator] ${attempt === 1 ? "Requesting" : `Attempt ${attempt}, trying`} model: ${model}`
  );

export async function generateQuote(category = "coding") {
  await waitForRateLimit();

  const categoryKey = CATEGORY_PROMPT_CONFIG[category] ? category : "coding";
  const configData = CATEGORY_PROMPT_CONFIG[categoryKey];
  const exampleText = sample(configData.examples, 4).map((ex) => `- "${ex}"`).join("\n");

  const prompt = `Generate a single educational quote or concept fact about ${configData.domain} for typing practice.

      CONTENT REQUIREMENTS:
      - ${configData.requirements}
      - Clear, engaging, factual, and informative.
      - 50-350 characters total (ideal for a typing test prompt).
      - Do not use markdown backticks (\`) or quotes around words. Use standard punctuation.

      AVOID:
      - No intro, no conversational filler, no title, no "Here is your quote:".
      - No questions or bullet points.
      - No markdown bold or italics.

      EXAMPLES FOR FORMAT:
${exampleText}

      Return ONLY the plain sentence text without any surrounding quotation marks or prefixes.`;

  try {
    const { result } = await withModelFallback(
      async (model, { thinkingConfig, abortSignal }) => {
        const response = await ai.models.generateContent({
          model,
          contents: prompt,
          config: { temperature: 1.0, thinkingConfig, abortSignal },
        });

        const quote = cleanQuote(readText(response));
        // Thrown inside the callback so a malformed generation is re-rolled by
        // the same retry loop that handles transient API failures.
        if (quote.length < 30 || quote.length > 500 || !isTypingFriendly(quote)) {
          const err = new Error(`Quote unusable for typing (${quote.length} chars)`);
          err.retryable = true;
          throw err;
        }
        return quote;
      },
      { label: "quoteGenerator", onAttempt: logAttempt }
    );

    return result;
  } catch (error) {
    console.error(`Error generating quote for ${category}:`, error);
    const { code } = parseApiError(error);
    if (code === 429) {
      throw new Error(
        "Gemini free-tier quota exhausted on every available model. " +
          "Enable billing on the Google AI Studio project or try again later."
      );
    }
    throw error;
  }
}

/**
 * @returns {Promise<{ quotes: string[], model: string }>} `model` is the one
 *   that actually answered after any fallback, for recording on the quotes.
 */
export async function generateQuotesBatch(
  category = "coding",
  count = 10,
  avoid = [],
  { topic } = {}
) {
  const { prompt, targetCount, label, examples } = buildBatchPrompt(category, count, avoid, { topic });
  console.log(`Generating batch of ${targetCount} new quotes for category '${label}'...`);

  await waitForRateLimit();

  const { result, model: usedModel } = await withModelFallback(
    async (model, { thinkingConfig, abortSignal }) => {
      const response = await ai.models.generateContent({
        model,
        contents: prompt,
        config: {
          systemInstruction: SYSTEM_INSTRUCTION,
          temperature: 1.1,
          responseMimeType: "application/json",
          thinkingConfig,
          abortSignal,
        },
      });

      const rawCount = jsonList(readText(response))?.length ?? 0;
      const parsed = parseQuoteList(readText(response));
      if (rawCount > parsed.length) {
        console.log(`[quoteGenerator] rejected ${rawCount - parsed.length} of ${rawCount} quotes as hard to type or wrong length`);
      }
      // Drop anything that repeats the pool or another quote in this batch.
      const quotes = dedupeQuotes(parsed, [...avoid, ...examples]).slice(0, targetCount);
      if (parsed.length > 0 && quotes.length < parsed.length) {
        console.log(
          `[quoteGenerator] dropped ${parsed.length - quotes.length} of ${parsed.length} quotes as duplicates or near-duplicates`
        );
      }
      if (quotes.length === 0) {
        const err = new Error("No usable quotes in AI response");
        err.retryable = true;
        throw err;
      }
      return quotes;
    },
    {
      label: "quoteGenerator",
      onAttempt: logAttempt,
      // A batch isn't streamed, so the whole reply (up to 20 quotes plus the
      // model's reasoning) has to land inside this, not just the first words.
      openTimeoutMs: BATCH_TIMEOUT_MS,
    }
  );

  return { quotes: result, model: usedModel };
}

/** The SDK has returned `text` as both a string and a getter across versions. */
function readText(response) {
  if (typeof response?.text === "string") return response.text;
  if (typeof response?.text === "function") return response.text();
  if (typeof response?.response?.text === "function") return response.response.text();
  return "";
}

/**
 * The JSON list in a reply, or null. OpenRouter's JSON mode only allows an
 * object, so there the list arrives wrapped ({"items": [...]}), and some
 * models fence it in ```json despite being asked not to.
 */
function jsonList(rawText) {
  const text = rawText.trim().replace(/^```(?:json)?\s*/i, "").replace(/\s*```$/, "");
  try {
    const json = JSON.parse(text);
    if (Array.isArray(json)) return json;
    if (json && typeof json === "object") return Object.values(json).find(Array.isArray) ?? null;
  } catch {
    // Not JSON.
  }
  return null;
}

function parseQuoteList(rawText) {
  const isUsable = (q) => q.length >= 30 && q.length <= 500 && isTypingFriendly(q);
  const list = jsonList(rawText);
  if (list) return list.map(cleanQuote).filter(isUsable);
  // Fall back to line parsing when the model ignored the JSON instruction.
  return rawText.split("\n").map(cleanQuote).filter(isUsable);
}
