import { Button } from "@/components/ui/button";
import { GoogleGenAI } from "@google/genai";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export const AiChat = ({ SENTENCES }) => {
  const [textWithCitations, setTextWithCitations] = useState("");

  const [isLoading, setIsLoading] = useState(false);

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
    const chunks = response.candidates[0]?.groundingMetadata?.groundingChunks;

    if (!supports || !chunks) {
      return text;
    }

    const sortedSupports = [...supports].sort(
      (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0)
    );

    for (const support of sortedSupports) {
      const endIndex = support.segment?.endIndex;
      if (endIndex === undefined || !support.groundingChunkIndices?.length) {
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
        text = text.slice(0, endIndex) + citationString + text.slice(endIndex);
      }
    }

    return text;
  }

  const generateContent = async () => {
    setIsLoading(true);
    setTextWithCitations("");
    try {
      const groundingTool = {
        googleSearch: {},
      };

      const config = {
        tools: [groundingTool],
        systemInstruction: `You are a senior developer describing the following concept to a junior dev. Provide technical details and links to docs. Give your information about the subject in a paragrpah above as well as techincal details / showcase code if relevent, and your links to docs or other resources below.`,
      };

      const result = await ai.models.generateContentStream({
        model: "gemini-2.5-flash-lite",
        contents: `You are a senior developer describing the following concept to a junior dev. Provide technical details and links to docs. Give your information about the subject in a paragrpah above as well as techincal details / showcase code if relevent, and your links to docs or other resources below: "${SENTENCES}"`,
        config,
      });

      let accumulatedText = "";
      let finalResponse = null;

      for await (const chunk of result) {
        const chunkText = chunk.text || "";
        accumulatedText += chunkText;
        setTextWithCitations(accumulatedText);
        finalResponse = chunk;
      }

      if (finalResponse && accumulatedText) {
        console.log("Final Response:", finalResponse);
        console.log("Accumulated Text:", accumulatedText);

        const fullResponse = {
          ...finalResponse,
          text: accumulatedText,
        };

        const textWithCitations = addCitations(fullResponse);
        setTextWithCitations(textWithCitations);
      }
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

  return (
    <div>
      <h1>AI Response:</h1>
      <div style={{ whiteSpace: "pre-wrap" }}>
        {isLoading ? (
          "Loading..."
        ) : (
          <ReactMarkdown>{textWithCitations}</ReactMarkdown>
        )}
        <Button onClick={generateContent} disabled={isLoading}>
          {isLoading ? "Generating..." : "Generate"}
        </Button>
      </div>
    </div>
  );
};
