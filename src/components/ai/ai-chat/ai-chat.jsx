import { Button } from "@/components/ui/button";
import { GoogleGenAI } from "@google/genai";
import { useEffect, useState } from "react";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export const AiChat = ({ SENTENCES }) => {
  const [textWithCitations, setTextWithCitations] = useState("");

  const [isLoading, setIsLoading] = useState(false);

  const generateContent = async () => {
    setIsLoading(true);
    try {
      const groundingTool = {
        googleSearch: {},
      };

      const config = {
        tools: [groundingTool],
        systemInstruction: `You are a senior developer describing the following concept to a junior dev. Provide technical details and links to docs. Keep your responses relatively short and to the point.`,
      };

      const result = await ai.models.generateContent({
        model: "gemini-2.0-flash-lite",
        contents: `Explain this sentence and give me links to the docs: "${SENTENCES}"`,
        config,
      });

      function addCitations(response) {
        if (!response) return "";

        if (!response.candidates?.[0]) {
          return typeof response.text === "function"
            ? response.text()
            : response.text || "";
        }
        let text = response.text;
        const supports =
          response.candidates[0]?.groundingMetadata?.groundingSupports;
        const chunks =
          response.candidates[0]?.groundingMetadata?.groundingChunks;

        if (!supports || !chunks) {
          return text;
        }

        const sortedSupports = [...supports].sort(
          (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0)
        );

        for (const support of sortedSupports) {
          const endIndex = support.segment?.endIndex;
          if (
            endIndex === undefined ||
            !support.groundingChunkIndices?.length
          ) {
            continue;
          }

          const citationLinks = support.groundingChunkIndices
            .map((i) => {
              const uri = chunks[i]?.web?.uri;
              if (uri) {
                return `[${i + 1}](${uri})`;
              }
              return null;
            })
            .filter(Boolean);

          if (citationLinks.length > 0) {
            const citationString = citationLinks.join(", ");
            text =
              text.slice(0, endIndex) + citationString + text.slice(endIndex);
          }
        }

        return text;
      }

      console.log("Full API Result:", result);
      const response = result.response || result;
      const text = addCitations(response);
      setTextWithCitations(text);
    } catch (error) {
      if (error.message.includes("429") || error.status === 429) {
        console.warn("Gemini API Rate Limit Exceeded");
        setTextWithCitations(
          "Rate limit exceeded. Please wait a moment before trying again."
        );
      } else {
        console.error("Error generating content:", error);
        setTextWithCitations("Error generating content.");
      }
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    setTextWithCitations("");
  }, [SENTENCES]);

  // console.log(textWithCitations);

  return (
    <div>
      <h1>AI Response:</h1>
      <div style={{ whiteSpace: "pre-wrap" }}>
        {isLoading ? "Loading..." : textWithCitations}
        <Button onClick={generateContent} disabled={isLoading}>
          {isLoading ? "Generating..." : "Generate"}
        </Button>
      </div>
    </div>
  );
};
