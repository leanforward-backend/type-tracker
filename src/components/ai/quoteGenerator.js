import { GoogleGenAI } from "@google/genai";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const RATE_LIMIT_PER_MINUTE = 10;
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

export async function generateQuote() {
  try {
    await waitForRateLimit();

    const chat = ai.chats.create({
      model: "gemini-2.5-flash-lite",
      systemInstruction: `Generate a single educational programming quote or code concept explanation for typing practice.

      CONTENT REQUIREMENTS:
      - Focus on practical, actionable programming knowledge (API usage, syntax patterns, best practices, common pitfalls)
      - Include technical terms, method names, or code concepts that reinforce muscle memory
      - Vary between: language features, framework patterns, algorithm explanations, debugging tips, performance concepts, etc.
      - Use concrete examples when possible (e.g., "Array.prototype.map returns a new array" vs "map transforms arrays")

      STYLE GUIDELINES:
      - Write in a clear, documentation-like tone
      - Use proper technical capitalization (e.g., JavaScript not javascript, CSS not css)
      - Include specific function/method names with proper syntax: addEventListener(), useState(), Promise.all()
      - 50-400 characters, make certain to not go outside this threshold, (aim for 100-250 for optimal typing practice)

      AVOID:
      - Questions or prompts
      - Explanations that require code blocks to understand
      - Saying here's a good quote or anything before the quote

      
      EXAMPLES OF GOOD QUOTES:
      - "The spread operator (...) creates a shallow copy of arrays and objects, useful for immutability in React state updates"
      - "setTimeout() doesn't pause execution; it schedules a callback to run after the specified delay in milliseconds"
      - "CSS specificity follows this hierarchy: inline styles, IDs, classes/attributes, elements. Use !important sparingly"

      Return ONLY the quote text, no quotation marks, prefixes, or numbering.`,
    });

    const result = await chat.sendMessage({
      message:
        "Generate one educational programming quote or concept explanation.",
    });

    let quote = result.text?.trim() || "";

    // Clean up common AI response patterns
    quote = quote.replace(/^["']|["']$/g, "");
    quote = quote.replace(/^\d+\.\s*/, "");
    quote = quote.trim();

    if (quote.length < 30 || quote.length > 500) {
      throw new Error("Quote length invalid");
    }

    return quote;
  } catch (error) {
    console.error("Error generating quote:", error);

    if (error.message?.includes("429") || error.status === 429) {
      throw new Error(
        "Rate limit exceeded. Please wait before generating more quotes."
      );
    }

    const { SENTENCES } = await import("../Sentences");
    return SENTENCES[Math.floor(Math.random() * SENTENCES.length)];
  }
}

export async function generateQuotesBatch(count = 20) {
  console.log("Generating new quotes...");
  const maxBatchSize = Math.min(count, 10);
  const quotes = [];
  const errors = [];

  for (let i = 0; i < maxBatchSize; i++) {
    try {
      const quote = await generateQuote();
      quotes.push(quote);
    } catch (error) {
      console.error(`Error generating quote ${i + 1}:`, error);
      errors.push(error);

      if (error.message?.includes("Rate limit")) {
        console.warn("Rate limit hit, stopping batch generation");
        break;
      }

      const { SENTENCES } = await import("../Sentences");
      quotes.push(SENTENCES[Math.floor(Math.random() * SENTENCES.length)]);
    }
  }

  while (quotes.length < count) {
    const { SENTENCES } = await import("../Sentences");
    quotes.push(SENTENCES[Math.floor(Math.random() * SENTENCES.length)]);
  }

  return quotes.slice(0, count);
}
