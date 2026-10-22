import { useState } from "react";
import { AI_CHOICES, findAiChoice } from "../../../convex/aiModels";
import { getPickedAiChoiceId, setAiChoice } from "./geminiClient";

/**
 * Admin-only (shown on the Stats page): picks which models answer the AI chat
 * and generate quotes in this browser. "Default" follows the deployment's
 * AI_DEFAULT_CHOICE (see convex/aiConfig.ts), which is what everyone else gets.
 */
export function AiModelPicker({ defaultChoiceId }) {
  const [picked, setPicked] = useState(getPickedAiChoiceId);
  const fallback = findAiChoice(defaultChoiceId) ?? AI_CHOICES[0];
  const active = findAiChoice(picked) ?? fallback;

  return (
    <div className="card" style={{ marginBottom: "2rem", textAlign: "left" }}>
      <h3 style={{ marginTop: 0 }}>
        <label htmlFor="ai-model">AI model</label>
      </h3>
      <p style={{ color: "var(--text-secondary)", marginTop: 0 }}>
        Answers the AI chat and writes new quotes in this browser. Only admins
        see this; everyone else uses the default.
      </p>
      <select
        id="ai-model"
        className="ai-model-select h-9 w-full max-w-md rounded-md border border-[#2e2e2e] bg-[var(--bg-input)] px-2 text-sm text-[var(--text-primary)] outline-none focus:border-[var(--accent-primary)]"
        value={picked ?? ""}
        onChange={(e) => {
          const id = e.target.value || null;
          setAiChoice(id);
          setPicked(id);
        }}
      >
        <option value="">Default ({fallback.label})</option>
        {AI_CHOICES.map((choice) => (
          <option key={choice.id} value={choice.id}>
            {choice.label}
          </option>
        ))}
      </select>
      <p style={{ color: "var(--text-muted)", fontSize: "0.85rem", marginBottom: 0 }}>
        {active.description}
      </p>
    </div>
  );
}
