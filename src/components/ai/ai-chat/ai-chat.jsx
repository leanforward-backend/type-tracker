import { GoogleGenAI } from "@google/genai";

export const AiChat = () => {
  return <div>{/* <h1>{textWithCitations}</h1> */}</div>;
};

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

async function main() {
  const groundingTool = {
    googleSearch: {},
  };

  const config = {
    tools: [groundingTool],
    systemInstruction: `You are a seior developer describing the following concept to a junior dev. provide technical details and links to docs. Keep your responses relativley short and too the point.`,
  };

  const streamResult = await ai.models.generateContentStream({
    model: "gemini-2.0-flash",
    contents:
      "explain this sentance and give me links to the docs. The factory pattern creates objects without specifying the exact class of object that will be created.",
    config,
  });

  function addCitations(response) {
    if (!response?.candidates?.[0]) {
      return response?.text || "";
    }
    let text = response.text;
    const supports =
      response.candidates[0]?.groundingMetadata?.groundingSupports;
    const chunks = response.candidates[0]?.groundingMetadata?.groundingChunks;

    if (!supports) {
      return text;
    }

    // Sort supports by end_index in descending order to avoid shifting issues when inserting.
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

  const logAi = false;

  if (logAi === true) {
    for await (const chunk of streamResult) {
      console.log(chunk.text);
    }
  }

  const response = await streamResult.response;
  const textWithCitations = addCitations(response);
}

await main();
