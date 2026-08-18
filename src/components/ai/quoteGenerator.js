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

const CATEGORY_PROMPT_CONFIG = {
  coding: {
    domain: "programming and computer science",
    requirements: "Focus on practical, actionable programming knowledge, algorithms, data structures, system architecture, networking, or databases.",
    examples: [
      "The spread operator (...) creates a shallow copy of arrays and objects, useful for immutability in React state updates.",
      "Hash tables provide O(1) average lookup time but degrade to O(n) with poor hash functions or high collision rates.",
      "Deadlocks occur when two processes each hold a resource the other needs, creating circular wait conditions.",
    ],
  },
  math: {
    domain: "mathematics and mathematical concepts",
    requirements: "Focus on foundational theorems, calculus, linear algebra, geometry, probability, statistics, number theory, or logic.",
    examples: [
      "Euler's identity connects five fundamental constants: e, i, pi, one, and zero in a single compact equation.",
      "A matrix determinant represents the volume scaling factor of the linear transformation described by that matrix.",
      "Bayes' theorem calculates conditional probability by incorporating prior beliefs alongside new empirical evidence.",
    ],
  },
  science: {
    domain: "scientific principles and discoveries",
    requirements: "Focus on physics, chemistry, biology, genetics, thermodynamics, astronomy, or neuroscience.",
    examples: [
      "Mitochondria are membrane-bound organelles that generate cellular chemical energy via adenosine triphosphate synthesis.",
      "General relativity models gravitational attraction as the geometric curvature of spacetime caused by mass and energy.",
      "The Doppler effect shifts the perceived frequency of sound or light waves when the emitter is moving relative to an observer.",
    ],
  },
  history: {
    domain: "world history and historical milestones",
    requirements: "Focus on significant historical events, treaties, scientific inventions, archaeological discoveries, and civilizations.",
    examples: [
      "The invention of the Gutenberg movable type printing press in 1440 catalyzed the Renaissance and widespread literacy across Europe.",
      "The Magna Carta of 1215 established the fundamental legal principle that the monarch is subject to the rule of law.",
      "The Silk Road was an ancient network of trade routes connecting East Asia with the Mediterranean for over a millennium.",
    ],
  },
  geography: {
    domain: "geography, earth science, and geopolitical regions",
    requirements: "Focus on landforms, oceans, tectonic phenomena, climate zones, biomes, and world geographical landmarks.",
    examples: [
      "The Mariana Trench in the western Pacific Ocean contains Challenger Deep, the deepest known point on Earth.",
      "The Ring of Fire is a major horseshoe-shaped Pacific basin where most of Earth's volcanic eruptions and earthquakes occur.",
      "The Amazon River basin discharges a greater volume of water than the next seven largest rivers combined.",
    ],
  },
  art: {
    domain: "visual art, movements, and techniques",
    requirements: "Focus on art movements, color theory, classical techniques, sculpture, composition, and renowned historical masterpieces.",
    examples: [
      "Chiaroscuro is a classical painting technique utilizing dramatic contrasts between light and dark to sculpt three-dimensional depth.",
      "Impressionism originated in nineteenth-century France, emphasizing visible brushstrokes and accurate depictions of shifting light.",
      "The golden ratio is a mathematical proportion used across classical architecture and painting to produce aesthetic visual harmony.",
    ],
  },
  music: {
    domain: "music theory, acoustics, and composition",
    requirements: "Focus on harmony, scales, counterpoint, rhythm, acoustic properties, orchestration, and structural musical forms.",
    examples: [
      "Equal temperament is a tuning system that divides an octave into twelve equal semitones, enabling modulation into any key.",
      "Counterpoint is the polyphonic relationship between musical lines that are harmonically interdependent yet rhythmically distinct.",
      "The circle of fifths illustrates geometric relationships among the twelve chromatic pitch classes and their respective key signatures.",
    ],
  },
};

export async function generateQuote(category = "coding", retryCount = 0) {
  try {
    await waitForRateLimit();

    const categoryKey = CATEGORY_PROMPT_CONFIG[category] ? category : "coding";
    const configData = CATEGORY_PROMPT_CONFIG[categoryKey];

    const chat = ai.chats.create({
      model: "gemini-2.5-flash",
      config: {
        temperature: 1.2,
      },
    });

    const exampleText = configData.examples.map((ex) => `- "${ex}"`).join("\n");

    const result = await chat.sendMessage({
      message: `Generate a single educational quote or concept fact about ${configData.domain} for typing practice.

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

      Return ONLY the plain sentence text without any surrounding quotation marks or prefixes.`,
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
    console.error(`Error generating quote for ${category} (attempt ${retryCount + 1}):`, error);

    if (error.message?.includes("429") || error.status === 429) {
      throw new Error(
        "Rate limit exceeded. Please wait before generating more quotes."
      );
    }

    if (retryCount < 3) {
      console.log(`Retrying quote generation (attempt ${retryCount + 2})...`);
      return generateQuote(category, retryCount + 1);
    }

    throw error;
  }
}

export async function generateQuotesBatch(category = "coding", count = 20) {
  console.log(`Generating new quotes for category '${category}'...`);
  const maxBatchSize = Math.min(count, 10);
  const quotes = [];
  const errors = [];

  for (let i = 0; i < maxBatchSize; i++) {
    try {
      const quote = await generateQuote(category);
      quotes.push(quote);
    } catch (error) {
      console.error(`Error generating quote ${i + 1} for ${category}:`, error);
      errors.push(error);

      if (error.message?.includes("Rate limit")) {
        console.warn("Rate limit hit, stopping batch generation");
        break;
      }
    }
  }

  return quotes.slice(0, count);
}

