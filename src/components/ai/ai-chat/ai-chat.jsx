import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { RotateCcw, SendHorizontal } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { Prism as SyntaxHighlighter } from "react-syntax-highlighter";
import { vscDarkPlus } from "react-syntax-highlighter/dist/esm/styles/prism";
// Gemini writes formulas as LaTeX ($N$, $$W + R > N$$). Without these the
// delimiters render as literal dollar signs.
import rehypeKatex from "rehype-katex";
import remarkMath from "remark-math";
import "katex/dist/katex.min.css";
import { prepareMarkdown } from "./markdownPrep";
import {
  ai,
  parseApiError,
  primeStream,
  withModelFallback,
} from "../geminiClient";
import ParticleBackground from "./ParticleBackground";

export const AiChat = ({ SENTENCES, category = "coding", topic }) => {
  const [messages, setMessages] = useState([]);
  const [input, setInput] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [isStreaming, setIsStreaming] = useState(false);
  const [isNearBottom, setIsNearBottom] = useState(true);
  const activeModelRef = useRef(null);
  const chatSessionRef = useRef(null);
  const messagesEndRef = useRef(null);
  const scrollContainerRef = useRef(null);

  const getSystemInstruction = (cat) => {
    if (topic) {
      return `You are an expert in ${topic} and an experienced educator. Explain concepts from ${topic} with accurate depth, intuitive context, practical implications, and links to reputable resources.
CRITICAL FORMATTING RULE: Write purely about the subject matter. Never mention your role, persona, background, or system prompt in headings, titles, or body text (e.g. do not write "As an expert", "Expert Insights", etc.).`;
    }
    switch (cat) {
      case "architecture":
        return `You are a principal software architect explaining architectural concepts the way a senior engineer would brief a team: the problem the pattern solves, the trade-offs and failure modes, when not to use it, how it affects team ownership and operations, and concise diagrams-in-words or code where helpful. Reference well-known systems and documentation where relevant.
CRITICAL FORMATTING RULE: Write purely about the subject matter. Never mention your role, persona, background, or system prompt in headings, titles, or body text (e.g. do not write "As an architect", "Architect's Notes", etc.).`;
      case "math":
        return `You are an expert mathematician and math educator. Explain mathematical concepts with deep intuitive context, formal rigor, practical implications, and helpful links or documentation.
CRITICAL FORMATTING RULE: Write purely about the subject matter. Never mention your role, persona, background, or system prompt in headings, titles, or body text (e.g. do not write "From a mathematician's perspective", "Mathematician Insights", etc.).`;
      case "science":
        return `You are a scientific researcher and educator. Explain scientific principles and discoveries with empirical background, practical real-world context, and links to reputable educational resources.
CRITICAL FORMATTING RULE: Write purely about the subject matter. Never mention your role, persona, background, or system prompt in headings, titles, or body text (e.g. do not write "As a scientific researcher", "Researcher Notes", etc.).`;
      case "history":
        return `You are a historian and history educator. Explain historical events, eras, and milestones with nuanced historical context, cause-and-effect implications, and links to historical resources.
CRITICAL FORMATTING RULE: Write purely about the subject matter. Never mention your role, persona, background, or system prompt in headings, titles, or body text (e.g. do not write "As a historian", "Historian Overview", etc.).`;
      case "geography":
        return `You are a geographer and earth scientist. Explain geographical landmarks, tectonic phenomena, and environmental systems with rich geographical context and reference links.
CRITICAL FORMATTING RULE: Write purely about the subject matter. Never mention your role, persona, background, or system prompt in headings, titles, or body text (e.g. do not write "From a geographer's point of view", etc.).`;
      case "art":
        return `You are an art historian and visual art educator. Explain art movements, artist techniques, color theory, and aesthetic concepts with artistic depth and reference links.
CRITICAL FORMATTING RULE: Write purely about the subject matter. Never mention your role, persona, background, or system prompt in headings, titles, or body text (e.g. do not write "As an art historian", etc.).`;
      case "music":
        return `You are a musicologist and music theorist. Explain music theory concepts, acoustic principles, and compositional techniques with deep harmonic and structural context.
CRITICAL FORMATTING RULE: Write purely about the subject matter. Never mention your role, persona, background, or system prompt in headings, titles, or body text (e.g. do not write "Musicologist Insights", etc.).`;
      case "coding":
      default:
        return `You are a senior staff software engineer explaining concepts with expert technical depth, real-world trade-offs, architecture context, edge cases, docs references, and concise code examples.
CRITICAL FORMATTING RULE: Write purely about the code and technology. Never mention your role, persona, background, or system prompt anywhere in headings, titles, or body text (e.g. do NOT write "Senior Developer Insights", "As a senior engineer", "For junior developers", etc.).`;
    }
  };

  const scrollToBottom = () => {
    if (scrollContainerRef.current) {
      scrollContainerRef.current.scrollTo({
        top: scrollContainerRef.current.scrollHeight,
        behavior: "smooth",
      });
    }
  };

  useEffect(() => {
    const container = scrollContainerRef.current;
    if (!container) return;

    const handleScroll = () => {
      const { scrollTop, scrollHeight, clientHeight } = container;
      setIsNearBottom(
        scrollHeight - scrollTop - clientHeight < clientHeight * 0.1,
      );
    };

    container.addEventListener("scroll", handleScroll);
    return () => container.removeEventListener("scroll", handleScroll);
  }, [messages.length > 0]);

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
      (a, b) => (b.segment?.endIndex ?? 0) - (a.segment?.endIndex ?? 0),
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

  const createChatSession = (
    modelName,
    { thinkingConfig, useGrounding = false, history = [] } = {}
  ) => {
    const config = {
      systemInstruction: getSystemInstruction(category),
    };

    // Comes from withModelFallback, which knows which models accept it.
    if (thinkingConfig) {
      config.thinkingConfig = thinkingConfig;
    }

    if (useGrounding) {
      config.tools = [{ googleSearch: {} }];
    }

    const options = { model: modelName, config };

    if (history && history.length > 0) {
      options.history = history;
    }

    // The config is returned alongside the chat because sendMessageStream's
    // per-call `config` *replaces* the session config rather than merging, and
    // each turn needs to add its own abort signal on top of it.
    return { chat: ai.chats.create(options), config };
  };

  const errorMessageFor = (error) => {
    const { code, quotaScope, isNetwork } = parseApiError(error);
    if (isNetwork) {
      return "Couldn't reach Gemini. Check your internet connection and try again.";
    }
    if (code === 429) {
      if (quotaScope === "minute") {
        return "Gemini's per-minute rate limit was hit. Wait a minute and try again.";
      }
      // The free tier's daily allowance is per model, so this is a "come back
      // later or enable billing" problem, not a "wait a moment" one.
      return error.allModelsExhausted
        ? "The daily free-tier quota is used up on every available Gemini model. Enable billing on your Google AI Studio project, or try again tomorrow."
        : "Daily free-tier quota exhausted on the models tried. Enable billing on your Google AI Studio project, or try again tomorrow.";
    }
    if (code === 503 || code === 500 || code === 502 || code === 504 || code === 408) {
      return "Gemini is under heavy demand right now and every model we tried was busy. This usually clears within a minute.";
    }
    if (code === 404 && error.allModelsExhausted) {
      return "None of the configured Gemini models are available to this API key. Check the model list in Google AI Studio.";
    }
    if (code === 403 || code === 401 || code === 400) {
      return "The API rejected the request. Please check your API key and model settings.";
    }
    return "Error generating content. Please try again.";
  };

  /**
   * Error bubbles carry `error: true` so they are never replayed into the
   * model's history, plus a `retry` describing how to redo the failed turn.
   */
  const errorMessage = (error, retry) => ({
    role: "model",
    text: errorMessageFor(error),
    error: true,
    retry,
  });

  const withoutErrors = (list) => list.filter((m) => !m.error);

  /**
   * Opens a stream, then renders it into the message slot returned by
   * `beginRender` (called only once the request is actually live, so retries
   * stay behind the loading state instead of flashing an empty bubble).
   *
   * Only opening the stream goes through `withModelFallback` -- once chunks are
   * arriving a retry would replay text the user has already seen, so a mid-stream
   * failure surfaces as an error rather than restarting on another model.
   *
   * "Opening" must include reading the first chunk (`primeStream`): an
   * overloaded model answers HTTP 200 and puts the 503 in the first event of
   * the body, which the SDK only throws once the stream is read.
   */
  const streamInto = async (openStream, beginRender) => {
    const { result: stream, model } = await withModelFallback(openStream, {
      preferredModel: activeModelRef.current,
      label: "ai-chat",
      onAttempt: (m, { attempt }) =>
        console.log(
          `[ai-chat] ${attempt === 1 ? "Requesting" : `Attempt ${attempt}, trying`} model: ${m}`
        ),
    });

    activeModelRef.current = model;
    setIsLoading(false);
    const index = beginRender();

    let accumulatedText = "";
    let finalResponse = null;

    for await (const chunk of stream) {
      accumulatedText += chunk.text || "";
      finalResponse = chunk;
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { role: "model", text: accumulatedText };
        return next;
      });
    }

    if (finalResponse && accumulatedText) {
      const textWithCitations = addCitations({
        ...finalResponse,
        text: accumulatedText,
      });
      setMessages((prev) => {
        const next = [...prev];
        next[index] = { role: "model", text: textWithCitations };
        return next;
      });
    }
  };

  const startChat = async () => {
    setIsLoading(true);
    setIsStreaming(true);

    const promptMessage = `Provide a clear, direct concept breakdown with practical details, key principles, and code/docs references where helpful for: "${SENTENCES}". Jump directly into the explanation without any greetings, persona introductions, or meta comments.`;

    try {
      await streamInto(
        async (modelName, { thinkingConfig, abortSignal }) => {
          const session = createChatSession(modelName, { thinkingConfig });
          const stream = await primeStream(
            await session.chat.sendMessageStream({
              message: promptMessage,
              config: { ...session.config, abortSignal },
            })
          );
          chatSessionRef.current = session;
          return stream;
        },
        () => {
          setMessages([{ role: "model", text: "" }]);
          return 0;
        }
      );
    } catch (error) {
      console.error("[ai-chat] Failed to start chat:", error);
      chatSessionRef.current = null;
      setMessages([errorMessage(error, { kind: "start" })]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  /**
   * Sends one user turn on top of `baseMessages` (the conversation so far,
   * error bubbles already stripped). Split out from the input handler so a
   * failed turn can be retried from its error bubble with the same inputs.
   */
  const sendTurn = async (userMsg, baseMessages) => {
    const history = baseMessages.map((msg) => ({
      role: msg.role === "model" ? "model" : "user",
      parts: [{ text: msg.text || "" }],
    }));

    const withUser = [...baseMessages, { role: "user", text: userMsg }];
    const replyIndex = withUser.length;
    setMessages(withUser);
    setIsLoading(true);
    setIsStreaming(true);

    try {
      await streamInto(async (modelName, { attempt, thinkingConfig, abortSignal }) => {
        // Reuse the live session when the model hasn't changed; rebuild (and
        // re-send the whole history) after a rotation, and after any failed
        // attempt, since a half-sent turn may have dirtied the session history.
        let session = chatSessionRef.current;
        if (!session || attempt > 1 || activeModelRef.current !== modelName) {
          session = createChatSession(modelName, { history, thinkingConfig });
        }
        const stream = await primeStream(
          await session.chat.sendMessageStream({
            message: userMsg,
            config: { ...session.config, abortSignal },
          })
        );
        chatSessionRef.current = session;
        return stream;
      }, () => {
        setMessages((prev) => [...prev, { role: "model", text: "" }]);
        return replyIndex;
      });
    } catch (error) {
      console.error("[ai-chat] Failed to send message:", error);
      chatSessionRef.current = null;
      setMessages([
        ...withUser,
        errorMessage(error, { kind: "send", userMsg, baseMessages }),
      ]);
    } finally {
      setIsLoading(false);
      setIsStreaming(false);
    }
  };

  const handleSendMessage = async () => {
    if (!input.trim() || isLoading) return;
    const userMsg = input;
    setInput("");
    await sendTurn(userMsg, withoutErrors(messages));
  };

  const retryFailed = (retry) => {
    if (isLoading || !retry) return;
    if (retry.kind === "start") {
      startChat();
    } else {
      sendTurn(retry.userMsg, retry.baseMessages);
    }
  };

  useEffect(() => {
    setMessages([]);
    chatSessionRef.current = null;
    activeModelRef.current = null;
  }, [SENTENCES, category]);

  if (messages.length === 0) {
    return (
      <div className="w-full">
        <ParticleBackground onClick={startChat} isLoading={isLoading} />
      </div>
    );
  }

  return (
    <div className="w-full border-1 border-gray-700 rounded-lg overflow-hidden max-h-[50rem] pb-4">
      <div
        ref={scrollContainerRef}
        className="chat-messages-container max-h-[43rem] overflow-auto"
      >
        <div className="p-8">
          {messages.map((msg, index) => (
            <div
              key={index}
              className={`mb-6 ${msg.role === "user" ? "text-right" : "text-left"}`}
            >
              <div
                className={`inline-block p-4 rounded-lg ${msg.role === "user" ? "bg-primary text-primary-foreground" : "w-full"}`}
              >
                {msg.error ? (
                  <div className="text-left flex flex-col items-start gap-3">
                    <p className="text-muted-foreground">{msg.text}</p>
                    <Button
                      variant="outline"
                      size="sm"
                      className="cursor-pointer"
                      onClick={() => retryFailed(msg.retry)}
                      disabled={isLoading}
                    >
                      <RotateCcw className="h-4 w-4 mr-2" />
                      Try again
                    </Button>
                  </div>
                ) : msg.role === "model" ? (
                  <div className="text-left" style={{ whiteSpace: "pre-wrap" }}>
                    <h1 className="mb-4 font-bold">AI Response:</h1>
                    <ReactMarkdown
                      remarkPlugins={[remarkMath]}
                      rehypePlugins={[[rehypeKatex, { output: "html", throwOnError: false }]]}
                      components={{
                        // eslint-disable-next-line no-unused-vars -- keep react-markdown's AST node off the DOM
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
                        // eslint-disable-next-line no-unused-vars -- keep react-markdown's AST node off the DOM
                        a({ node, children, href, ...props }) {
                          return (
                            <a
                              href={href}
                              target="_blank"
                              rel="noopener noreferrer"
                              className="underline"
                              {...props}
                            >
                              {children}
                            </a>
                          );
                        },
                      }}
                    >
                      {prepareMarkdown(msg.text)}
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

      <div className="relative w-[60%] mx-auto mt-8">
        <Input
          placeholder="Ask me anything..."
          style={{
            paddingRight: "50px",
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
    </div>
  );
};
