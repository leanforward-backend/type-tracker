import { GoogleGenAI } from "@google/genai";
import { useEffect } from "react"; // Import useEffect

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

// Wrap everything in a component
export default function Test() {
  useEffect(() => {
    console.log("hello");

    async function run() {
      const response = await ai.models.generateContent({
        model: "gemini-2.0-flash", // Use a valid model name
        contents:
          "Find the race condition in this multi-threaded C++ snippet: [code here]",
      });

      console.log("hello", response.text);
    }

    run();
  }, []);

  return <div>Test Component</div>;
}
