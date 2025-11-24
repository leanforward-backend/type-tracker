import { Button } from "@/components/ui/button";
import { GoogleGenAI } from "@google/genai";
import { useEffect, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export const AiChat = ({ SENTENCES, setFirstResponse }) => {
  const [textWithCitations, setTextWithCitations] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);

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
    setIsStreaming(true);
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
        contents: `You are a senior developer describing the following concept to a junior dev. Don't give any greeting, Provide technical details and links to docs. Give your information about the subject in a paragrpah above as well as techincal details / showcase code if relevent, and your links to docs or other resources below: "${SENTENCES}"`,
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

      setIsStreaming(false);

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
      setIsStreaming(false);
    } finally {
      setIsLoading(false);
      setFirstResponse(true);
    }
  };

  useEffect(() => {
    setTextWithCitations("");
  }, [SENTENCES]);

  return (
    <div className={`${textWithCitations ? "w-full" : "w-fit"}`}>
      <div
        className={`${textWithCitations ? "max-h-[43rem] overflow-auto" : "h-fit"}`}
      >
        <div className="p-8">
          <h1 className="mb-4">AI Response:</h1>
          <div className="text-left" style={{ whiteSpace: "pre-wrap" }}>
            {isLoading && isStreaming ? (
              <div>{textWithCitations}</div>
            ) : isLoading ? (
              "Loading..."
            ) : (
              <ReactMarkdown
                components={{
                  code({ node, inline, className, children, ...props }) {
                    const match = /language-(\w+)/.exec(className || "");
                    return !inline && match ? (
                      <SyntaxHighlighter
                        style={vscDarkPlus}
                        language={match[1]}
                        PreTag="div"
                        {...props}
                      >
                        {String(children).replace(/\n$/, "")}
                      </SyntaxHighlighter>
                    ) : (
                      <code className={className} {...props}>
                        {children}
                      </code>
                    );
                  },
                  a({ node, children, href, ...props }) {
                    return (
                      <a
                        href={href}
                        target="_blank"
                        rel="noopener noreferrer"
                        {...props}
                      >
                        {children}
                      </a>
                    );
                  },
                }}
              >
                {textWithCitations}
              </ReactMarkdown>
            )}
            <Button
              onClick={generateContent}
              disabled={isLoading}
              className="mt-4"
            >
              {isLoading ? "Generating..." : "Generate"}
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
};
