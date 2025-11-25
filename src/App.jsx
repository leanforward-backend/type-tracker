import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import "./App.css";
import { AiChatbox } from "./components/ai/aiChatbox";
import { generateQuotesBatch } from "./components/ai/quoteGenerator";
import Game from "./components/Game";
import { SENTENCES } from "./components/Sentences";
import Stats from "./components/Stats";
import { Toggle } from "./components/ui/toggle";
import { useTypeTracker } from "./hooks/useTypeTracker";

function App() {
  const [sentance, setSentance] = useState("");
  const [currentQuoteId, setCurrentQuoteId] = useState(null); // Track current quote ID
  const [view, setView] = useState("game");
  const [mistakesMode, setMistakesMode] = useState(false);
  const { history, saveSession, getProblemKeys, getProblemWords } =
    useTypeTracker();
  const { isAuthenticated } = useConvexAuth();

  const inputRef = useRef(null);

  const handleSaveRace = useMutation(api.races.saveRace);

  const setMistakes = useMutation(api.mistakes.createMistakes);

  const getMistakes = useQuery(api.mistakes.getMistakes);

  const hasSeededQuotes = useRef(false);
  const isGeneratingQuotes = useRef(false);

  const availableQuotes = useQuery(api.raceQuotes.getAvailableQuotes);
  const quoteCount = useQuery(api.raceQuotes.getQuoteCount);
  const saveQuotesBatch = useMutation(api.raceQuotes.saveQuotesBatch);
  const rotateQuotes = useMutation(api.raceQuotes.rotateQuotes);

  const handleSetMistakes = (pressed) => {
    if (isAuthenticated) {
      setMistakes({ mistakes: pressed }).catch((err) =>
        console.error("Failed to save mistakes mode:", err)
      );
    } else {
      console.log("User not authenticated, skipping Convex save.");
    }
  };

  const handleGameFinish = async (stats) => {
    saveSession(stats);

    if (isAuthenticated) {
      console.log("Saving race to Convex...");
      handleSaveRace(stats).catch((err) =>
        console.error("Failed to save race:", err)
      );
    } else {
      console.log("User not authenticated, skipping Convex save.");
    }
  };

  const handleFocusClick = () => {
    inputRef.current?.focus();
  };

  const currentMistakesMode = getMistakes?.mistakes ?? mistakesMode;

  const raceHistory = useQuery(api.races.getHistory);

  const displayHistory = isAuthenticated && raceHistory ? raceHistory : history;

  const seedInitialQuotes = async () => {
    if (hasSeededQuotes.current) return;
    hasSeededQuotes.current = true;

    try {
      const seedQuotes = [...SENTENCES]
        .sort(() => Math.random() - 0.5)
        .slice(0, 10);
      await saveQuotesBatch({ quotes: seedQuotes });
      console.log(
        `Seeded initial batch of ${seedQuotes.length} quotes from hardcoded list`
      );
    } catch (error) {
      console.error("Failed to seed initial quotes:", error);
      hasSeededQuotes.current = false;
    }
  };

  const generateNewQuotesIfNeeded = async () => {
    if (isGeneratingQuotes.current) return;
    isGeneratingQuotes.current = true;

    try {
      console.log("Generating new quotes to replenish pool...");
      const newQuotes = await generateQuotesBatch(20);
      await saveQuotesBatch({ quotes: newQuotes });
      console.log(`Generated ${newQuotes.length} new quotes`);
    } catch (error) {
      console.error("Failed to generate new quotes:", error);
    } finally {
      isGeneratingQuotes.current = false;
    }
  };

  const generateNewSentence = () => {
    if (availableQuotes && availableQuotes.length > 0) {
      const randomIndex = Math.floor(Math.random() * availableQuotes.length);
      const selectedQuote = availableQuotes[randomIndex];
      setSentance(selectedQuote.quote);
      setCurrentQuoteId(selectedQuote.id);
      return;
    }

    const randomIndex = Math.floor(Math.random() * SENTENCES.length);
    setSentance(SENTENCES[randomIndex]);
    setCurrentQuoteId(null);
  };

  useEffect(() => {
    if (
      availableQuotes &&
      availableQuotes.length < 25 &&
      availableQuotes.length > 0 &&
      !isGeneratingQuotes.current
    ) {
      console.log(
        `Pool low (${availableQuotes.length} quotes), generating more...`
      );
      generateNewQuotesIfNeeded();
    }
  }, [availableQuotes?.length]);

  useEffect(() => {
    if (quoteCount === 0 && !hasSeededQuotes.current) {
      seedInitialQuotes();
    }
    getMistakes?.mistakes && setMistakesMode(getMistakes.mistakes);
  }, [quoteCount]);

  useEffect(() => {
    if (!sentance) {
      if (availableQuotes && availableQuotes.length > 0) {
        console.log("Initial load: setting first quote");
        generateNewSentence();
      } else if (quoteCount === 0) {
        console.log("No quotes in DB, using hardcoded fallback");
        generateNewSentence();
      }
    }
  }, [availableQuotes, quoteCount, sentance]);

  return (
    <div className="app-container">
      <header
        style={{
          marginBottom: "3rem",
          display: "grid",
          gridTemplateColumns: "1fr auto",
          alignItems: "center",
          padding: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1 className="title" style={{ fontSize: "2.5rem", margin: 0 }}>
            Type<span style={{ color: "var(--text-primary)" }}>Tracker</span>
          </h1>
          <div
            className="title"
            style={{ fontSize: "1rem", margin: 0, marginLeft: "20px" }}
          >
            {getMistakes === undefined ? (
              <Toggle size="sm">Loading Option</Toggle>
            ) : (
              <Toggle
                size="lg"
                className={"border border-blue-500 toggle-no-bg cursor-pointer"}
                pressed={currentMistakesMode}
                onPressedChange={(pressed) => {
                  setMistakesMode(pressed);
                  handleSetMistakes(pressed);
                  handleFocusClick();
                }}
              >
                {mistakesMode ? "No mistakes" : "Mistakes"}
              </Toggle>
            )}
          </div>
        </div>

        <nav style={{ display: "flex", gap: "1rem" }}>
          <button
            className={`btn ${view === "game" ? "btn-primary" : ""}`}
            onClick={() => setView("game")}
          >
            Race
          </button>
          <button
            className={`btn ${view === "stats" ? "btn-primary" : ""}`}
            onClick={() => setView("stats")}
          >
            Stats
          </button>
        </nav>
      </header>

      <main>
        {view === "game" ? (
          <div>
            <Game
              onFinish={handleGameFinish}
              mistakesMode={mistakesMode}
              SENTENCES={sentance}
              onReset={generateNewSentence}
              forwardedRef={inputRef}
              currentQuoteId={currentQuoteId}
            />
            <AiChatbox SENTENCES={sentance} />
          </div>
        ) : (
          <Stats
            history={displayHistory}
            problemKeys={getProblemKeys()}
            problemWords={getProblemWords()}
          />
        )}
      </main>
    </div>
  );
}

export default App;
