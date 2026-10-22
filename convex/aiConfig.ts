import { query } from "./_generated/server";
import { FALLBACK_AI_CHOICE, findAiChoice, type AiChoice } from "./aiModels";

/**
 * The AI model choice for everyone except admins, who can pick their own on
 * the Stats page. Switch the whole app with
 * `npx convex env set AI_DEFAULT_CHOICE best` (or cheapest, steady, gemini);
 * an unknown value falls back to Gemini.
 */
export function defaultAiChoice(): AiChoice {
  return findAiChoice(process.env.AI_DEFAULT_CHOICE) ?? findAiChoice(FALLBACK_AI_CHOICE)!;
}

export const defaultChoice = query({
  args: {},
  handler: async () => defaultAiChoice().id,
});
