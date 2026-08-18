import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import "./App.css";
import { AiChatbox } from "./components/ai/aiChatbox";
import { generateQuotesBatch } from "./components/ai/quoteGenerator";
import { Categories } from "./components/categories/categories";
import Game from "./components/Game";
import { getFallbackBatch, getFallbackQuote, SENTENCES } from "./components/Sentences";
import Stats from "./components/Stats";
import { Toggle } from "./components/ui/toggle";
import { generateWords, WORD_COUNTS } from "./components/words";
import { useTypeTracker } from "./hooks/useTypeTracker";

function App() {
  const [category, setCategory] = useState("coding");
  const [sentance, setSentance] = useState("");
  const [currentQuoteId, setCurrentQuoteId] = useState(null); // Track current quote ID
  const [view, setView] = useState("game");
  const [mode, setMode] = useState("quote"); // "quote" | "words"
  const [wordCount, setWordCount] = useState(25);
  const [raceId, setRaceId] = useState(0); // Forces a reset even if the text repeats
  const [mistakesMode, setMistakesMode] = useState(false);
  const { history, saveSession, getProblemKeys, getProblemWords } =
    useTypeTracker();
  const { isAuthenticated } = useConvexAuth();

  const inputRef = useRef(null);

  const handleSaveRace = useMutation(api.races.saveRace);

  const setMistakes = useMutation(api.mistakes.createMistakes);

  const getMistakes = useQuery(api.mistakes.getMistakes);

  const seededCategories = useRef(new Set());
  const isGeneratingQuotes = useRef(false);

  const availableQuotes = useQuery(api.raceQuotes.getAvailableQuotes, {
    category,
  });
  const quoteCount = useQuery(api.raceQuotes.getQuoteCount, {
    category,
  });
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
      // saveRace validates its arguments, so only send the fields it declares —
      // the rest of the stats payload is for the results screen.
      handleSaveRace({
        wpm: stats.wpm,
        accuracy: stats.accuracy,
        date: new Date().toISOString(),
        errors: stats.errors,
        missedWords: stats.missedWords,
      }).catch((err) => console.error("Failed to save race:", err));
    }
  };

  const handleFocusClick = () => {
    inputRef.current?.focus();
  };

  const currentMistakesMode = getMistakes?.mistakes ?? mistakesMode;

  const raceHistory = useQuery(api.races.getHistory);

  const displayHistory = isAuthenticated && raceHistory ? raceHistory : history;

  const hasSelectedInitialDbQuote = useRef(false);

  const generateNewQuotesIfNeeded = async (targetCategory = category) => {
    if (isGeneratingQuotes.current) return;
    isGeneratingQuotes.current = true;

    try {
      console.log(`Generating new AI quotes for '${targetCategory}'...`);
      const newQuotes = await generateQuotesBatch(targetCategory, 10);
      if (newQuotes.length > 0) {
        await saveQuotesBatch({ quotes: newQuotes, category: targetCategory });
        console.log(`Generated and saved ${newQuotes.length} new AI quotes for '${targetCategory}'`);
      }
    } catch (error) {
      console.error(`Failed to generate new quotes for '${targetCategory}':`, error);
      // Only fallback-seed if AI generation completely fails and DB is empty
      if (quoteCount === 0 && !seededCategories.current.has(targetCategory)) {
        seededCategories.current.add(targetCategory);
        const fallbackBatch = getFallbackBatch(targetCategory, 5);
        await saveQuotesBatch({ quotes: fallbackBatch, category: targetCategory }).catch(() => {});
      }
    } finally {
      isGeneratingQuotes.current = false;
    }
  };

  const generateNewSentence = (targetCategory = category, quotesList = availableQuotes) => {
    setRaceId((id) => id + 1);

    if (mode === "words") {
      setSentance(generateWords(wordCount));
      setCurrentQuoteId(null);
      return;
    }

    if (quotesList && quotesList.length > 0) {
      // Pick a random quote from available database quotes
      const randomIndex = Math.floor(Math.random() * quotesList.length);
      const selectedQuote = quotesList[randomIndex];
      setSentance(selectedQuote.quote);
      setCurrentQuoteId(selectedQuote.id);
      return;
    }

    const fallback = getFallbackQuote(targetCategory);
    setSentance(fallback);
    setCurrentQuoteId(null);
  };

  const handleCategoryChange = (newCategory) => {
    if (newCategory === category) return;
    hasSelectedInitialDbQuote.current = false;
    setCategory(newCategory);
    setRaceId((id) => id + 1);
    const fallback = getFallbackQuote(newCategory);
    setSentance(fallback);
    setCurrentQuoteId(null);
    handleFocusClick();
  };

  // Words mode is generated locally, so it owns the text whenever it is active.
  useEffect(() => {
    if (mode !== "words") return;
    setSentance(generateWords(wordCount));
    setCurrentQuoteId(null);
    setRaceId((id) => id + 1);
  }, [mode, wordCount]);

  // Monitor quote pool: if low or empty, proactively trigger AI quote generation
  useEffect(() => {
    if (mode === "words") return;

    if (quoteCount === 0 && !isGeneratingQuotes.current) {
      console.log(`No quotes for '${category}', generating AI quotes...`);
      generateNewQuotesIfNeeded(category);
    } else if (
      availableQuotes &&
      availableQuotes.length > 0 &&
      availableQuotes.length < 10 &&
      !isGeneratingQuotes.current
    ) {
      console.log(`Pool low (${availableQuotes.length} quotes for ${category}), generating more...`);
      generateNewQuotesIfNeeded(category);
    }
  }, [availableQuotes?.length, quoteCount, mode, category]);

  useEffect(() => {
    getMistakes?.mistakes && setMistakesMode(getMistakes.mistakes);
  }, [getMistakes?.mistakes]);

  // When database quotes become available, select a fresh quote from the DB
  useEffect(() => {
    if (mode === "words") return;

    if (availableQuotes && availableQuotes.length > 0) {
      if (!hasSelectedInitialDbQuote.current || !sentance) {
        hasSelectedInitialDbQuote.current = true;
        generateNewSentence(category, availableQuotes);
      }
    } else if (!sentance) {
      // Temporary initial quote while fetching
      const fallback = getFallbackQuote(category);
      setSentance(fallback);
      setCurrentQuoteId(null);
    }
  }, [availableQuotes, mode, category]);

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
          <div className="title">
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
                {currentMistakesMode ? "No mistakes" : "Mistakes"}
              </Toggle>
            )}
          </div>
          <Categories
            value={category}
            onChange={handleCategoryChange}
          />
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
            <div className="mode-bar">
              <div className="mode-group">
                <button
                  className={`mode-chip ${mode === "quote" ? "is-active" : ""}`}
                  onClick={() => {
                    setMode("quote");
                    handleFocusClick();
                  }}
                >
                  quotes
                </button>
                <button
                  className={`mode-chip ${mode === "words" ? "is-active" : ""}`}
                  onClick={() => {
                    setMode("words");
                    handleFocusClick();
                  }}
                >
                  words
                </button>
              </div>

              {mode === "words" && (
                <div className="mode-group">
                  {WORD_COUNTS.map((count) => (
                    <button
                      key={count}
                      className={`mode-chip ${
                        wordCount === count ? "is-active" : ""
                      }`}
                      onClick={() => {
                        setWordCount(count);
                        handleFocusClick();
                      }}
                    >
                      {count}
                    </button>
                  ))}
                </div>
              )}

              <div className="mode-group">
                <button
                  className="mode-chip"
                  title="Get a new quote or word set"
                  onClick={() => {
                    generateNewSentence(category);
                    handleFocusClick();
                  }}
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: "0.4rem",
                  }}
                >
                  <svg
                    xmlns="http://www.w3.org/2000/svg"
                    width="14"
                    height="14"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                  >
                    <path d="M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8" />
                    <path d="M21 3v5h-5" />
                    <path d="M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16" />
                    <path d="M3 21v-5h5" />
                  </svg>
                  <span>new {mode}</span>
                </button>
              </div>
            </div>

            <Game
              // Remounting is how a race resets: every counter, the keystroke
              // log and the results screen all start clean.
              key={`${mode}-${raceId}`}
              onFinish={handleGameFinish}
              mistakesMode={currentMistakesMode}
              SENTENCES={sentance}
              onReset={() => generateNewSentence(category)}
              forwardedRef={inputRef}
              currentQuoteId={currentQuoteId}
              mode={mode}
              canSaveQuote={mode === "quote"}
            />
            {mode === "quote" && (
              <AiChatbox SENTENCES={sentance} category={category} />
            )}
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
