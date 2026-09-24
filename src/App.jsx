import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import "./App.css";
import { AiChatbox } from "./components/ai/aiChatbox";
import { generateQuotesBatch } from "./components/ai/quoteGenerator";
import { BUILT_IN_CATEGORIES } from "./components/categories/builtInCategories";
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

  const seenQuoteIds = useRef(new Set());
  const isGeneratingQuotes = useRef(false);
  const lastGenerationTime = useRef({});
  const refillTimer = useRef(null);
  const refillRequested = useRef(false);
  const hasKickedOffInitialBatch = useRef(false);
  // Latest render values for callbacks that run later (timers, finally
  // blocks), which would otherwise close over stale props.
  const latest = useRef({});

  const availableQuotes = useQuery(api.raceQuotes.getAvailableQuotes, {
    category,
  });
  const quoteCount = useQuery(api.raceQuotes.getQuoteCount, {
    category,
  });
  const saveQuotesBatch = useMutation(api.raceQuotes.saveQuotesBatch);
  const deleteQuote = useMutation(api.raceQuotes.deleteQuote);

  // Topics the signed-in user created. Their pools are keyed `custom:<id>`,
  // and have no built-in backups, so an empty pool shows the loading state
  // instead of an off-topic fallback quote.
  const customCategories = useQuery(api.customCategories.getCustomCategories);
  const createCustomCategory = useMutation(api.customCategories.createCustomCategory);
  const deleteCustomCategory = useMutation(api.customCategories.deleteCustomCategory);
  const isCustomCategory = (key) => key.startsWith("custom:");
  const topicFor = (key, list = customCategories) =>
    list?.find((c) => c.value === key)?.name;
  const customTopic = isCustomCategory(category) ? topicFor(category) : undefined;
  const categoryLabel =
    customTopic ??
    (category === "architecture"
      ? "programming architecture"
      : BUILT_IN_CATEGORIES.find((c) => c.value === category)?.name.toLowerCase() ?? category);
  // The custom category whose last generation attempt failed, for the loading message.
  const [failedCategory, setFailedCategory] = useState(null);

  // Saving the on-screen quote to the user's list, available before the race
  // starts (the results screen has its own button for afterwards). The stored
  // list is only queried when signed in, because the query throws otherwise.
  const saveStoredQuote = useMutation(api.storedQuotes.saveQuote);
  const removeStoredQuote = useMutation(api.storedQuotes.removeQuote);
  const storedQuotes = useQuery(
    api.storedQuotes.getStoredQuotes,
    isAuthenticated ? {} : "skip"
  );
  // null = trust the server; true/false = optimistic state after a click,
  // held until the stored list catches up or the quote changes.
  const [savedOverride, setSavedOverride] = useState(null);
  const savedOnServer = storedQuotes?.some((q) => q.quote === sentance) ?? false;
  const quoteAlreadySaved = savedOverride ?? savedOnServer;

  const handleToggleSaveQuote = () => {
    if (!isAuthenticated || !sentance) return;
    const next = !quoteAlreadySaved;
    setSavedOverride(next);
    const mutation = next
      ? saveStoredQuote({ quote: sentance })
      : removeStoredQuote({ quote: sentance });
    mutation.catch((err) => {
      console.error(next ? "Failed to save quote:" : "Failed to remove saved quote:", err);
      setSavedOverride(null);
    });
    handleFocusClick();
  };
  latest.current = { category, mode, availableQuotes, quoteCount, customCategories };

  const retireQuote = (quoteId) => {
    if (!quoteId) return;
    seenQuoteIds.current.delete(quoteId);
    deleteQuote({ quoteId }).catch((err) =>
      console.error("Failed to retire quote:", err)
    );
  };

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
  // The quote that was on screen when the user switched to words mode, so
  // switching back restores it instead of leaving the word list in place.
  const parkedQuoteRef = useRef(null); // { text, id } | null

  // Keep each category's pool topped up to TARGET_POOL_SIZE. Refilling starts
  // once it dips below REFILL_BELOW rather than on every single draw, so one
  // generation request restocks several quotes instead of one per race.
  const TARGET_POOL_SIZE = 20;
  const REFILL_BELOW = 15;
  const REFILL_THROTTLE_MS = 30000;
  // Every page load also adds a few fresh quotes, so the pool keeps turning
  // over for a returning user even when it is already at target.
  const INITIAL_BATCH_SIZE = 5;

  const poolIsLow = () => {
    const { mode: m, availableQuotes: quotes, quoteCount: count } = latest.current;
    if (m === "words") return false;
    if (count === 0) return true;
    return quotes !== undefined && quotes.length < REFILL_BELOW;
  };

  /** How many quotes are needed to bring the current category back to target. */
  const poolDeficit = () => {
    const { availableQuotes: quotes, quoteCount: count } = latest.current;
    const have = quotes?.length ?? count ?? 0;
    return Math.max(TARGET_POOL_SIZE - have, 1);
  };

  /**
   * Re-checks the pool after `delayMs` and refills if it is still low. Only one
   * timer is kept; a second request while one is pending is already covered.
   */
  const scheduleRefill = (delayMs, why) => {
    if (refillTimer.current) return;
    if (why) {
      console.log(
        `Quote refill deferred (${why}); retrying in ${Math.ceil(delayMs / 1000)}s`
      );
    }
    refillTimer.current = setTimeout(() => {
      refillTimer.current = null;
      refillIfLow();
    }, delayMs);
  };

  const refillIfLow = () => {
    if (poolIsLow()) generateNewQuotesIfNeeded(latest.current.category);
  };

  const generateNewQuotesIfNeeded = async (
    targetCategory = category,
    { minCount = 0, reason = "" } = {}
  ) => {
    const custom = isCustomCategory(targetCategory);
    const topic = custom ? topicFor(targetCategory, latest.current.customCategories) : undefined;
    // The category list hasn't loaded yet (or the category was just deleted).
    // The pool monitor re-runs once the topic is known.
    if (custom && !topic) return;

    const now = Date.now();
    const lastAttempt = lastGenerationTime.current[targetCategory] || 0;
    const sinceLast = now - lastAttempt;

    // Neither guard may drop the request silently. The pool-monitor effect only
    // re-runs when the pool size changes, and an empty pool stays at zero, so a
    // request dropped here would never be made again. Defer it instead.
    if (sinceLast < REFILL_THROTTLE_MS) {
      scheduleRefill(REFILL_THROTTLE_MS - sinceLast + 100, "throttled");
      return;
    }
    if (isGeneratingQuotes.current) {
      refillRequested.current = true;
      return;
    }

    isGeneratingQuotes.current = true;
    refillRequested.current = false;
    lastGenerationTime.current[targetCategory] = now;

    try {
      const wanted = Math.max(poolDeficit(), minCount);
      console.log(
        `Generating ${wanted} new AI quotes for '${targetCategory}'${reason ? ` (${reason})` : ""}...`
      );
      const existing = (latest.current.availableQuotes || []).map((q) => q.quote);
      const newQuotes = await generateQuotesBatch(targetCategory, wanted, existing, { topic });
      if (newQuotes.length > 0) {
        // saveQuotesBatch returns how many actually landed -- it drops any that
        // duplicate what's already stored, so this is often lower than the
        // number generated. Reporting newQuotes.length here claimed successes
        // that never reached the table.
        const inserted = await saveQuotesBatch({
          quotes: newQuotes,
          category: targetCategory,
        });
        console.log(
          `Generated ${newQuotes.length} AI quotes for '${targetCategory}', saved ${inserted} new (${newQuotes.length - inserted} were duplicates)`
        );
        setFailedCategory((c) => (c === targetCategory ? null : c));
      } else {
        throw new Error("No quotes returned from AI generator");
      }
    } catch (error) {
      console.error(`Failed to generate new quotes for '${targetCategory}':`, error);
      // Built-in backups are off-topic for a custom category; the safety-net
      // retry below keeps trying instead.
      if (custom) {
        setFailedCategory(targetCategory);
        return;
      }
      // AI generation is unavailable (usually daily quota), so keep the pool
      // stocked from the built-in backups. There's deliberately no
      // once-per-session guard: quotes are consumed as they're shown, so the
      // pool needs topping up repeatedly. saveQuotesBatch dedupes, and the 30s
      // throttle above bounds how often this runs.
      const fallbackBatch = getFallbackBatch(targetCategory, poolDeficit());
      await saveQuotesBatch({
        quotes: fallbackBatch,
        category: targetCategory,
      }).catch(() => {});
    } finally {
      isGeneratingQuotes.current = false;
      if (refillRequested.current) {
        // Something asked for a refill while we were busy (e.g. the pool was
        // emptied mid-generation). Give it its turn; the throttle will space it.
        refillRequested.current = false;
        refillIfLow();
      } else {
        // Safety net: if the pool is still low once the throttle has passed
        // (every quote was a duplicate, the save failed), try again. This is a
        // no-op when the pool is healthy.
        scheduleRefill(REFILL_THROTTLE_MS + 100);
      }
    }
  };

  const generateNewSentence = (targetCategory = category, quotesList = availableQuotes) => {
    setRaceId((id) => id + 1);

    if (mode === "words") {
      setSentance(generateWords(wordCount));
      setCurrentQuoteId(null);
      return;
    }

    // Retire whatever was on screen. Previously this only happened via the
    // results screen's restart button, so skipping or replacing a quote left it
    // in the pool to be drawn again.
    retireQuote(currentQuoteId);

    if (quotesList && quotesList.length > 0) {
      // Draw without replacement: a plain random pick over a pool this small
      // repeats constantly even when the pool is healthy.
      // The query result is a snapshot that still lists the quote just retired,
      // so exclude it from both passes.
      const candidates = quotesList.filter((q) => q.id !== currentQuoteId);
      const unseen = candidates.filter((q) => !seenQuoteIds.current.has(q.id));
      if (unseen.length === 0) seenQuoteIds.current.clear();

      const pool = unseen.length > 0 ? unseen : candidates;
      if (pool.length === 0) {
        showFallback(targetCategory);
        return;
      }

      const selectedQuote = pool[Math.floor(Math.random() * pool.length)];
      seenQuoteIds.current.add(selectedQuote.id);
      setSentance(selectedQuote.quote);
      setCurrentQuoteId(selectedQuote.id);
      return;
    }

    showFallback(targetCategory);
  };

  /**
   * A built-in quote when the pool has nothing to offer. Custom categories have
   * no built-ins, so they clear the text instead; the loading state shows and
   * the opening-quote effect picks from the pool once the refill lands.
   */
  const showFallback = (targetCategory) => {
    if (isCustomCategory(targetCategory)) {
      hasSelectedInitialDbQuote.current = false;
      setSentance("");
    } else {
      setSentance(getFallbackQuote(targetCategory));
    }
    setCurrentQuoteId(null);
  };

  const handleCreateCategory = (name) => createCustomCategory({ name });

  const handleDeleteCategory = (key) => {
    if (key === category) handleCategoryChange("coding");
    deleteCustomCategory({ value: key }).catch((err) =>
      console.error("Failed to delete category:", err)
    );
  };

  const handleCategoryChange = (newCategory) => {
    if (newCategory === category) return;
    hasSelectedInitialDbQuote.current = false;
    // A quote parked while in words mode belongs to the old category.
    parkedQuoteRef.current = null;
    setCategory(newCategory);
    handleFocusClick();
    // In words mode the text on screen is a word list and stays put; the new
    // category only matters once the user returns to quotes.
    if (mode === "words") return;
    setRaceId((id) => id + 1);
    // Clear rather than show a placeholder: the pool for the new category is
    // still loading, and the effect below picks from it the moment it lands.
    setSentance("");
    setCurrentQuoteId(null);
  };

  const handleModeChange = (newMode) => {
    if (newMode === mode) return;
    if (newMode === "words") {
      // Park the current quote; the words effect below replaces the text.
      parkedQuoteRef.current = sentance ? { text: sentance, id: currentQuoteId } : null;
    } else {
      const parked = parkedQuoteRef.current;
      parkedQuoteRef.current = null;
      if (parked) {
        setSentance(parked.text);
        setCurrentQuoteId(parked.id);
      } else {
        // Nothing to restore: clear the word list so the opening-quote effect
        // picks a fresh quote from the pool.
        hasSelectedInitialDbQuote.current = false;
        setSentance("");
        setCurrentQuoteId(null);
      }
      setRaceId((id) => id + 1);
    }
    setMode(newMode);
    handleFocusClick();
  };

  // Words mode is generated locally, so it owns the text whenever it is active.
  useEffect(() => {
    if (mode !== "words") return;
    setSentance(generateWords(wordCount));
    setCurrentQuoteId(null);
    setRaceId((id) => id + 1);
  }, [mode, wordCount]);

  // First load: once the pool is known, generate a fresh batch regardless of
  // how full it is. Runs before the low-pool monitor below so that, when both
  // want to generate at the same moment, this one wins and asks for at least
  // INITIAL_BATCH_SIZE (or the full deficit if that is larger); the monitor's
  // request is then queued behind it and turns into a no-op once the pool is
  // healthy.
  useEffect(() => {
    if (mode !== "quote" || availableQuotes === undefined) return;
    if (hasKickedOffInitialBatch.current) return;
    hasKickedOffInitialBatch.current = true;
    generateNewQuotesIfNeeded(category, {
      minCount: INITIAL_BATCH_SIZE,
      reason: "fresh batch on page load",
    });
  }, [availableQuotes, mode, category]);

  // Monitor quote pool: if empty or low, proactively trigger AI quote generation.
  // customTopic is a dependency because a custom pool can't be filled until
  // the category list has loaded.
  useEffect(() => {
    refillIfLow();
  }, [availableQuotes?.length, quoteCount, mode, category, customTopic]);

  // A custom category that no longer exists (deleted in another tab, or the
  // user signed out) has nothing to draw from.
  useEffect(() => {
    if (isCustomCategory(category) && customCategories !== undefined && !customTopic) {
      handleCategoryChange("coding");
    }
  }, [category, customCategories, customTopic]);

  useEffect(() => {
    return () => {
      if (refillTimer.current) clearTimeout(refillTimer.current);
      // Reset too, or StrictMode's simulated remount leaves the scheduler
      // believing a retry is already pending.
      refillTimer.current = null;
    };
  }, []);

  useEffect(() => {
    getMistakes?.mistakes && setMistakesMode(getMistakes.mistakes);
  }, [getMistakes?.mistakes]);

  // Pick the opening quote exactly once, and only after the pool has loaded.
  //
  // Previously a random built-in quote was shown while the Convex query was in
  // flight, then replaced (and the race remounted) when the real pool arrived
  // about a second later, wiping anything already typed. Now the race area
  // shows a loading state instead, and a built-in quote is used only when the
  // pool turns out to be empty. Once chosen, the quote is never swapped from
  // underneath the user; later pool changes only affect the *next* draw.
  useEffect(() => {
    if (mode === "words") return;
    if (availableQuotes === undefined) return; // still loading
    if (hasSelectedInitialDbQuote.current && sentance) return;

    // A new custom category starts empty; wait for its first batch.
    if (availableQuotes.length === 0 && isCustomCategory(category)) return;

    hasSelectedInitialDbQuote.current = true;
    if (availableQuotes.length > 0) {
      generateNewSentence(category, availableQuotes);
    } else {
      setSentance(getFallbackQuote(category));
      setCurrentQuoteId(null);
    }
  }, [availableQuotes, mode, category]);

  const quoteReady = mode !== "quote" || sentance.length > 0;

  // A new quote on screen is a new candidate for saving.
  useEffect(() => {
    setSavedOverride(null);
  }, [sentance]);

  // Once the server agrees with the optimistic state, drop the override so
  // changes made elsewhere (the results screen, another tab) show through.
  useEffect(() => {
    if (savedOverride !== null && savedOverride === savedOnServer) {
      setSavedOverride(null);
    }
  }, [savedOnServer, savedOverride]);

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
              <Toggle size="sm" pressed={false} disabled>Loading Option</Toggle>
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
            customCategories={customCategories ?? []}
            canCreate={isAuthenticated}
            onCreate={handleCreateCategory}
            onDelete={handleDeleteCategory}
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
                  onClick={() => handleModeChange("quote")}
                >
                  quotes
                </button>
                <button
                  className={`mode-chip ${mode === "words" ? "is-active" : ""}`}
                  onClick={() => handleModeChange("words")}
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
                  className="mode-chip mode-chip-icon"
                  title="Get a new quote or word set"
                  onClick={() => {
                    generateNewSentence(category);
                    handleFocusClick();
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
                {mode === "quote" && (
                  <button
                    className={`mode-chip mode-chip-icon ${quoteAlreadySaved ? "is-active" : ""}`}
                    onClick={handleToggleSaveQuote}
                    disabled={!isAuthenticated || !quoteReady}
                    aria-pressed={quoteAlreadySaved}
                    title={
                      !isAuthenticated
                        ? "Sign in to save quotes"
                        : quoteAlreadySaved
                          ? "Saved. Click to remove from your quotes"
                          : "Save this quote to your list"
                    }
                  >
                    <svg
                      xmlns="http://www.w3.org/2000/svg"
                      width="14"
                      height="14"
                      viewBox="0 0 24 24"
                      fill={quoteAlreadySaved ? "currentColor" : "none"}
                      stroke="currentColor"
                      strokeWidth="2"
                      strokeLinecap="round"
                      strokeLinejoin="round"
                    >
                      <path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" />
                    </svg>
                    <span>{quoteAlreadySaved ? "saved" : "save quote"}</span>
                  </button>
                )}
              </div>
            </div>

            {quoteReady ? (
              <Game
                // Remounting is how a race resets: every counter, the keystroke
                // log and the results screen all start clean.
                key={`${mode}-${raceId}`}
                onFinish={handleGameFinish}
                mistakesMode={currentMistakesMode}
                SENTENCES={sentance}
                onReset={() => generateNewSentence(category)}
                forwardedRef={inputRef}
                mode={mode}
                canSaveQuote={mode === "quote"}
              />
            ) : (
              <div className="typing-area quote-loading" aria-busy="true">
                {failedCategory === category
                  ? `Couldn't generate ${categoryLabel} quotes yet. Retrying...`
                  : `Loading a ${categoryLabel} quote...`}
              </div>
            )}
            {mode === "quote" && quoteReady && (
              <AiChatbox SENTENCES={sentance} category={category} topic={customTopic} />
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
