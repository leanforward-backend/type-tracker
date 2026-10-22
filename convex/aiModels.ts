/**
 * The AI models the app can switch between. Shared by the browser (the model
 * picker and the OpenRouter client) and the proxy in http.ts, which forwards
 * only the OpenRouter models listed here and applies their routing and
 * reasoning settings itself, so a caller can't pick a pricier provider.
 *
 * Picked on 22 Oct 2026 from OpenRouter's model list and the Artificial
 * Analysis Intelligence Index (AA, measured at max reasoning):
 * - DeepSeek V4.1 Flash 1017: released 17 Oct, AA 45, the highest-scoring
 *   cheap model and the newest. ~200 tokens/s, ~1s to first token.
 *   At most US$0.30 in / US$1.20 out per 1M tokens (DeepSeek's own price).
 * - GLM-5.3-Flash: AA 42 for US$0.027 in / US$0.083 out on the cheapest
 *   provider (fp4). Always reasons, so it is slower to start.
 * - Claude Haiku 5.5: AA 43, US$0.10 / US$0.50, served by Anthropic and the
 *   big clouds at full precision, so the steadiest of the three.
 * For comparison, Gemini 3.6/3.8 Flash is US$0.75 / US$3.75 (doubling on
 * 1 Jan 2027) and scores 33-34.
 */

export type AiProvider = "gemini" | "openrouter";

export type OpenRouterModel = {
  label: string;
  // OpenRouter provider routing: https://openrouter.ai/docs/features/provider-routing
  provider: Record<string, unknown>;
  // OpenRouter's unified reasoning setting. Reasoning is billed as output, so
  // keep it low; `exclude` keeps it out of the response the app parses.
  reasoning: Record<string, unknown>;
  // False when no provider accepts `temperature`. With require_parameters on,
  // sending it anyway gets a 404 "No endpoints found", so the proxy drops it.
  acceptsTemperature?: boolean;
};

// Skips the 4-bit hosts, which are cheapest but can lose quality.
const NOT_4_BIT = ["fp8", "fp16", "bf16", "fp32", "unknown"];
const LOW_REASONING = { effort: "low", exclude: true };

export const OPENROUTER_MODELS: Record<string, OpenRouterModel> = {
  "deepseek/deepseek-v4.1-flash-1017": {
    label: "DeepSeek V4.1 Flash",
    // Fastest host up to DeepSeek's own price. Sorting by price picked small
    // or degraded hosts that couldn't finish a 20-quote batch in 30s.
    provider: {
      sort: "throughput",
      max_price: { prompt: 0.3, completion: 1.2 },
      quantizations: NOT_4_BIT,
      require_parameters: true,
    },
    reasoning: LOW_REASONING,
  },
  "z-ai/glm-5.3-flash": {
    label: "GLM-5.3-Flash",
    provider: { sort: "price", require_parameters: true },
    reasoning: LOW_REASONING,
  },
  "anthropic/claude-haiku-5.5": {
    label: "Claude Haiku 5.5",
    provider: { sort: "price", require_parameters: true },
    reasoning: LOW_REASONING,
    acceptsTemperature: false,
  },
};

export type AiChoice = {
  id: string;
  label: string;
  description: string;
  provider: AiProvider;
  // OpenRouter models in the order to try them; the rest are fallbacks.
  models: string[];
};

export const AI_CHOICES: AiChoice[] = [
  {
    id: "gemini",
    label: "Gemini Flash",
    description: "Google Gemini 3.x Flash, called directly. The original setup.",
    provider: "gemini",
    models: [],
  },
  {
    id: "best",
    label: "Best & newest: DeepSeek V4.1 Flash",
    description:
      "Released 17 Oct 2026 and the highest-scoring cheap model. Falls back to Claude Haiku 5.5, then GLM-5.3-Flash.",
    provider: "openrouter",
    models: [
      "deepseek/deepseek-v4.1-flash-1017",
      "anthropic/claude-haiku-5.5",
      "z-ai/glm-5.3-flash",
    ],
  },
  {
    id: "cheapest",
    label: "Cheapest: GLM-5.3-Flash",
    description:
      "About 1/40th of Gemini's price for nearly the best score. Slower to start answering. Falls back to DeepSeek, then Haiku.",
    provider: "openrouter",
    models: [
      "z-ai/glm-5.3-flash",
      "deepseek/deepseek-v4.1-flash-1017",
      "anthropic/claude-haiku-5.5",
    ],
  },
  {
    id: "steady",
    label: "Steady: Claude Haiku 5.5",
    description:
      "Served by Anthropic, Google, AWS and Azure at full precision. Falls back to DeepSeek, then GLM.",
    provider: "openrouter",
    models: [
      "anthropic/claude-haiku-5.5",
      "deepseek/deepseek-v4.1-flash-1017",
      "z-ai/glm-5.3-flash",
    ],
  },
];

export const FALLBACK_AI_CHOICE = "gemini";

export function findAiChoice(id: string | null | undefined): AiChoice | undefined {
  return AI_CHOICES.find((choice) => choice.id === id);
}
