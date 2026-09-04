import { GoogleGenAI } from "@google/genai";

export const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

const FAILED_MODELS = new Set();
const DEFAULT_MODELS = [
  "gemini-3.7-flash",
  "gemini-3.8-flash",
  "gemini-3.5-flash",
  "gemini-flash-latest",
];

let _discoveredModels = null;

/**
 * Returns a list of available Gemini Flash models in priority order.
 */
export async function getAvailableFlashModels() {
  if (_discoveredModels && _discoveredModels.length > 0) {
    return _discoveredModels.filter((m) => !FAILED_MODELS.has(m));
  }

  const models = [];
  const envModel = import.meta.env.VITE_GEMINI_MODEL;
  if (envModel) {
    models.push(envModel);
  }

  try {
    const modelList = await ai.models.list();
    const discovered = [];

    for await (const m of modelList) {
      const name = (m.name || "").replace(/^models\//, "");
      // Exclude omni, preview, exp, lite which often have 0 free-tier quota
      if (
        name.startsWith("gemini-") &&
        name.includes("flash") &&
        !name.includes("omni") &&
        !name.includes("preview") &&
        !name.includes("lite") &&
        !name.includes("exp") &&
        m.supportedActions?.includes("generateContent")
      ) {
        const match = name.match(/gemini-(\d+(?:\.\d+)?)-flash/);
        const version = match ? parseFloat(match[1]) : 0;
        discovered.push({ name, version });
      }
    }

    discovered.sort((a, b) => b.version - a.version);
    for (const item of discovered) {
      if (!models.includes(item.name)) {
        models.push(item.name);
      }
    }
  } catch (err) {
    console.warn("[geminiClient] Error discovering models from API:", err.message);
  }

  for (const def of DEFAULT_MODELS) {
    if (!models.includes(def)) {
      models.push(def);
    }
  }

  _discoveredModels = models;
  return _discoveredModels.filter((m) => !FAILED_MODELS.has(m));
}

/**
 * Marks a model as temporarily failing (e.g. 503 high demand or 429 quota exhausted)
 */
export function markModelFailed(modelName) {
  if (!modelName) return;
  console.warn(`[geminiClient] Marking model '${modelName}' as failed, rotating to next available model`);
  FAILED_MODELS.add(modelName);

  // Clear failed model blacklist after 2 minutes so it can be re-attempted later
  setTimeout(() => {
    FAILED_MODELS.delete(modelName);
  }, 120000);
}
