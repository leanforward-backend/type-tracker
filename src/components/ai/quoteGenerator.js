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

export async function generateQuote(retryCount = 0) {
  try {
    await waitForRateLimit();

    const chat = ai.chats.create({
      model: "gemini-2.5-flash-lite",
    });

    const result = await chat.sendMessage({
      message: `Generate a single educational programming quote or code concept explanation for typing practice.

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
      - Do not give any explination or preable, only the quote.
      - Making text bold by using **

      
      EXAMPLES OF GOOD QUOTES:
      - "The spread operator (...) creates a shallow copy of arrays and objects, useful for immutability in React state updates"
      - "setTimeout() doesn't pause execution; it schedules a callback to run after the specified delay in milliseconds"
      - "CSS specificity follows this hierarchy: inline styles, IDs, classes/attributes, elements. Use !important sparingly"

      EXAMPLE OF BAD QUOTES , DO NOT DO THIS:
      -  "Here's an educational programming quote:

      **"Debugging is like being a detective in a crime novel where you are also the murderer."**

      **Explanation:**

      This quote highlights the often-frustrating but essential process of debugging in programming.

      *   **The Detective:** When you encounter a bug (an error in your code), you become a detective. You meticulously examine your code, trace the flow of execution, and try to piece together clues to understand *why* the program is behaving incorrectly. You're looking for the culprit, the line or logic that's causing the problem.

      *   **The Murderer:** The humorous and insightful twist is that *you* are also the murderer. Most bugs aren't external forces; they are mistakes you've introduced through your own typing errors, logical flaws, misunderstandings of concepts, or assumptions that turned out to be wrong. You're trying to solve a crime that you yourself committed.

      **Educational Value:**

      This quote teaches us:

      1.  **The Nature of Programming:** Programming is not just about writing code; it's an iterative process that heavily involves finding and fixing errors.
      2.  **The Importance of Self-Reflection:** It encourages programmers to take responsibility for their mistakes and learn from them rather than blaming external factors.
      3.  **The Mental Approach to Debugging:** It suggests that debugging requires a combination of analytical thinking (like a detective) and a willingness to critically examine your own work (admitting you're the "murderer").
      4.  **The Humorous Side of Development:** It acknowledges the often-humorous, albeit sometimes exasperating, reality of software development."


      Return ONLY the quote text, no quotation marks, prefixes, or numbering.`,
    });

    console.log("AI Result keys:", Object.keys(result));

    let quote = "";

    // Handle different SDK response formats
    if (typeof result.text === "string") {
      quote = result.text;
    } else if (typeof result.text === "function") {
      quote = result.text();
    } else if (result.response && typeof result.response.text === "function") {
      quote = result.response.text();
    }

    // Clean up common AI response patterns
    quote = quote?.trim() || "";
    quote = quote.replace(/^["']|["']$/g, "");
    quote = quote.replace(/^\d+\.\s*/, "");
    quote = quote.trim();

    if (quote.length < 30 || quote.length > 500) {
      console.warn(
        `Generated quote length invalid (${quote.length} chars): "${quote}"`
      );
      throw new Error("Quote length invalid");
    }

    return quote;
  } catch (error) {
    console.error(`Error generating quote (attempt ${retryCount + 1}):`, error);

    if (error.message?.includes("429") || error.status === 429) {
      throw new Error(
        "Rate limit exceeded. Please wait before generating more quotes."
      );
    }

    if (retryCount < 3) {
      console.log(`Retrying quote generation (attempt ${retryCount + 2})...`);
      return generateQuote(retryCount + 1);
    }

    throw error;
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
    }
  }

  const { SENTENCES } = await import("../Sentences");

  if (retryCount > 3) {
    quotes.push(SENTENCES[Math.floor(Math.random() * SENTENCES.length)]);
  }

  return quotes.slice(0, count);
}
