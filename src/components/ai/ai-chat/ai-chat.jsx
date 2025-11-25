import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { GoogleGenAI } from "@google/genai";
import { SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";

const ai = new GoogleGenAI({ apiKey: import.meta.env.VITE_GEMINI_API_KEY });

export const AiChat = ({ SENTENCES }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const chatSessionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsNearBottom(
        scrollHeight - scrollTop - clientHeight < clientHeight * 0.1
      );
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, []);

  useEffect(() => {
    if (isNearBottom) scrollToBottom();
  }, [messages, isStreaming, isNearBottom]);

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

  const startChat = async () => {
    setIsLoading(true);
    setIsStreaming(true);
    setMessages([]);
    try {
      const groundingTool = {
        googleSearch: {},
      };

      const config = {
        tools: [groundingTool],
        systemInstruction: `You are a senior developer describing the following concept to a junior dev. Provide technical details and links to docs. Give your information about the subject in a paragrpah above as well as techincal details / showcase code if relevent, and your links to docs or other resources below.`,
      };

      const chat = ai.chats.create({
        model: "gemini-2.5-flash-lite",
        config,
      });
      chatSessionRef.current = chat;

      const result = await chat.sendMessageStream({
        message: `You are a senior developer describing the following concept to a junior dev. Don't give any greeting, Provide technical details and links to docs. Give your information about the subject in a paragrpah above as well as techincal details / showcase code if relevent, and your links to docs or other resources below: "${SENTENCES}"`,
      });

      let accumulatedText = "";
      let finalResponse = null;

      setMessages([{ role: "model", text: "" }]);

      for await (const chunk of result) {
        const chunkText = chunk.text || "";
        accumulatedText += chunkText;
        finalResponse = chunk;
        setMessages((prev) => {
          const newArr = [...prev];
          newArr[0] = { role: "model", text: accumulatedText };
          return newArr;
        });
      }

      setIsStreaming(false);

      if (finalResponse && accumulatedText) {
        const fullResponse = {
          ...finalResponse,
          text: accumulatedText,
        };

        const textWithCitations = addCitations(fullResponse);
        setMessages((prev) => {
          const newArr = [...prev];
          newArr[0] = { role: "model", text: textWithCitations };
          return newArr;
        });
      }
    } catch (error) {
      if (error.message?.includes("429") || error.status === 429) {
        console.warn("Gemini API Rate Limit Exceeded");
        setMessages((prev) => [
          ...prev,
          {
            role: "model",
            text: "Rate limit exceeded. Please wait a moment before trying again.",
          },
        ]);
      } else {
        console.error("Error generating content:", error);
        setMessages((prev) => [
          ...prev,
          { role: "model", text: "Error generating content." },
        ]);
      }
      setIsStreaming(false);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;

    const userMsg = input;
    setInput("");
    setMessages((prev) => [...prev, { role: "user", text: userMsg }]);
    setIsLoading(true);
    setIsStreaming(true);

    try {
      const result = await chatSessionRef.current.sendMessageStream({
        message: userMsg,
      });

      let accumulatedText = "";
      let finalResponse = null;

      setMessages((prev) => [...prev, { role: "model", text: "" }]);

      for await (const chunk of result) {
        const chunkText = chunk.text || "";
        accumulatedText += chunkText;
        finalResponse = chunk;
        setMessages((prev) => {
          const newArr = [...prev];
          newArr[newArr.length - 1] = { role: "model", text: accumulatedText };
          return newArr;
        });
      }

      if (finalResponse && accumulatedText) {
        const fullResponse = {
          ...finalResponse,
          text: accumulatedText,
        };

        const textWithCitations = addCitations(fullResponse);
        setMessages((prev) => {
          const newArr = [...prev];
          newArr[newArr.length - 1] = {
            role: "model",
            text: textWithCitations,
          };
          return newArr;
        });
      }
    } catch (error) {
      console.error("Error sending message:", error);
      setMessages((prev) => [
        ...prev,
        { role: "model", text: "Error generating response." },
      ]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  useEffect(() => {
    setMessages([]);
    chatSessionRef.current = null;
  }, [SENTENCES]);

  return (
    <div className={`${messages.length > 0 ? "w-full" : "w-fit"}`}>
      <div
        ref={scrollContainerRef}
        className={`chat-messages-container ${messages.length > 0 ? "max-h-[43rem] overflow-auto" : "h-fit"}`}
      >
        <div className="p-8">
          {messages.length === 0 && (
            <Button onClick={startChat} disabled={isLoading} className="mt-4">
              {isLoading ? "Generating..." : "Generate"}
            </Button>
          )}

          {messages.map((msg, index) => (
            <div
              key={index}
              className={`mb-6 ${msg.role === "user" ? "text-right" : "text-left"}`}
            >
              <div
                className={`inline-block p-4 rounded-lg ${msg.role === "user" ? "bg-primary text-primary-foreground" : "w-full"}`}
              >
                {msg.role === "model" ? (
                  <div className="text-left" style={{ whiteSpace: "pre-wrap" }}>
                    <h1 className="mb-4 font-bold">AI Response:</h1>
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
                      {msg.text}
                    </ReactMarkdown>
                  </div>
                ) : (
                  msg.text
                )}
              </div>
            </div>
          ))}
          <div ref={messagesEndRef} />
        </div>
      </div>

      {messages.length > 0 && (
        <div className="relative w-[60%] mx-auto mt-8">
          <Input
            placeholder="Ask me anything..."
            style={{
              paddingRight: "40px",
              height: "50px",
              borderRadius: "15px",
            }}
            size="xl"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter" && !e.shiftKey) {
                e.preventDefault();
                handleSendMessage();
              }
            }}
          />
          <Button
            size="icon"
            className="circle-icon-button cursor-pointer"
            onClick={handleSendMessage}
            disabled={isLoading || !input.trim()}
            style={{
              position: "absolute",
              right: "10px",
              top: "50%",
              transform: "translateY(-50%)",
              height: "32px",
              width: "32px",
            }}
          >
            <SendHorizontal className="h-4 w-4" />
          </Button>
        </div>
      )}
    </div>
  );
};
