import { useAuth } from "@clerk/clerk-react";
import { useConvex, useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import "./App.css";
import { AiChatbox } from "./components/ai/aiChatbox";
import { AiModelPicker } from "./components/ai/AiModelPicker";
import {
  setAiPickAllowed,
  setAuthTokenGetter,
  setDefaultAiChoice,
} from "./components/ai/geminiClient";
import { generateQuotesBatch } from "./components/ai/quoteGenerator";
import { BUILT_IN_CATEGORIES } from "./components/categories/builtInCategories";
import { Categories } from "./components/categories/categories";
import Game from "./components/Game";
import { getFallbackBatch, getFallbackQuote, SENTENCES } from "./components/Sentences";
import Stats from "./components/Stats";
import { Toggle } from "./components/ui/toggle";
import { UpgradeButton } from "./components/upgrade/Upgrade";
import { generateWords, WORD_COUNTS } from "./components/words";
import { useTypeTracker } from "./hooks/useTypeTracker";

const CATEGORY_KEY = "type-tracker:category:v1";

function readSavedCategory() {
  try {
    const saved = localStorage.getItem(CATEGORY_KEY);
    if (saved?.startsWith("custom:") || BUILT_IN_CATEGORIES.some((c) => c.value === saved)) {
      return saved;
    }
  } catch {
    // Storage may be blocked.
  }
  return "coding";
}

// Quotes this browser has already been shown. Free pools are never used up,
// so without this a returning player would start over at every visit.
const SEEN_KEY = "type-tracker:seen-quotes:v1";
// Every free pool at its cap (8 × 500), with room to spare.
const MAX_SEEN = 5000;

function readSeenQuotes() {
  try {
    const ids = JSON.parse(localStorage.getItem(SEEN_KEY) ?? "[]");
    return new Set(Array.isArray(ids) ? ids : []);
  } catch {
    return new Set();
  }
}

function writeSeenQuotes(seen) {
  try {
    localStorage.setItem(SEEN_KEY, JSON.stringify([...seen].slice(-MAX_SEEN)));
  } catch {
    // Storage may be blocked; repeats just come round sooner.
  }
}

function App() {
  // Restored on reload. A custom topic is checked against the user's list
  // once it loads (see the effect further down).
  const [category, setCategory] = useState(readSavedCategory);
  useEffect(() => {
    try {
      localStorage.setItem(CATEGORY_KEY, category);
    } catch {
      // Storage may be blocked; the category just won't survive a reload.
    }
  }, [category]);
  const [sentance, setSentance] = useState("");
  const [currentQuoteId, setCurrentQuoteId] = useState(null); // Track current quote ID
  const [view, setView] = useState("game");
  const [mode, setMode] = useState("quote"); // "quote" | "words"
  const [wordCount, setWordCount] = useState(25);
  const [raceId, setRaceId] = useState(0); // Forces a reset even if the text repeats
  const [mistakesMode, setMistakesMode] = useState(false);
  const { history, saveSession, getProblemKeys, getProblemWords } =
    useTypeTracker();
  const { isAuthenticated, isLoading: convexAuthLoading } = useConvexAuth();
  // The header shows Clerk's state, but saves need Convex to accept the Clerk
  // token. When the two disagree, races are silently dropped, so say so.
  const { isSignedIn, getToken } = useAuth();
  const convexRejectedSession = isSignedIn && !convexAuthLoading && !isAuthenticated;
  // What this account has paid for (convex/entitlements.ts); null when signed out.
  const me = useQuery(api.entitlements.me);

  // Stripe Checkout sends the user back with ?checkout=success|cancelled.
  // The webhook may land a moment later; `me` updates itself when it does.
  const [checkoutResult] = useState(() =>
    new URLSearchParams(window.location.search).get("checkout")
  );
  useEffect(() => {
    if (!checkoutResult) return;
    const url = new URL(window.location.href);
    url.searchParams.delete("checkout");
    window.history.replaceState(null, "", url);
  }, [checkoutResult]);

  // The AI proxies (convex/http.ts) check the same Clerk token Convex uses.
  useEffect(() => {
    setAuthTokenGetter(() => getToken({ template: "convex" }));
  }, [getToken]);

  // Which AI models to use: the deployment default (Convex env
  // AI_DEFAULT_CHOICE), or an admin's own pick from the Stats page. Declared
  // before the quote effects below, which wait for aiReady so the first batch
  // on page load already uses the right models.
  const aiDefaultChoice = useQuery(api.aiConfig.defaultChoice);
  const isAdmin = Boolean(me?.isAdmin);
  useEffect(() => {
    if (aiDefaultChoice) setDefaultAiChoice(aiDefaultChoice);
  }, [aiDefaultChoice]);
  useEffect(() => {
    setAiPickAllowed(isAdmin);
  }, [isAdmin]);
  const aiReady = aiDefaultChoice !== undefined && me !== undefined;

  const inputRef = useRef(null);

  const handleSaveRace = useMutation(api.races.saveRace);

  const setMistakes = useMutation(api.mistakes.createMistakes);

  const getMistakes = useQuery(api.mistakes.getMistakes);

  const seenQuoteIds = useRef(null);
  if (seenQuoteIds.current === null) seenQuoteIds.current = readSeenQuotes();
  const isGeneratingQuotes = useRef(false);
  const lastGenerationTime = useRef({});
  const refillTimer = useRef(null);
  const refillRequested = useRef(false);
  // Latest render values for callbacks that run later (timers, finally
  // blocks), which would otherwise close over stale props.
  const latest = useRef({});

  const saveQuotesBatch = useMutation(api.raceQuotes.saveQuotesBatch);
  const retireQuoteMutation = useMutation(api.raceQuotes.retireQuote);

  // Topics the signed-in user created. Their pools are keyed `custom:<id>`,
  // and have no built-in backups, so an empty pool shows the loading state
  // instead of an off-topic fallback quote.
  // Skipped until signed in, so the first list that arrives is the user's own
  // and not a signed-out empty one (which would discard a restored topic).
  const customCategories = useQuery(
    api.customCategories.getCustomCategories,
    isAuthenticated ? {} : "skip"
  );
  const createCustomCategory = useMutation(api.customCategories.createCustomCategory);
  const deleteCustomCategory = useMutation(api.customCategories.deleteCustomCategory);
  const isCustomCategory = (key) => key.startsWith("custom:");
  const topicFor = (key, list = customCategories) =>
    list?.find((c) => c.value === key)?.name;
  const customTopic = isCustomCategory(category) ? topicFor(category) : undefined;
  const categoryLabel =
    customTopic ??
    (isCustomCategory(category)
      ? "custom topic" // its name is still loading
      : category === "architecture"
        ? "programming architecture"
        : BUILT_IN_CATEGORIES.find((c) => c.value === category)?.name.toLowerCase() ?? category);
  // The custom category whose last generation attempt failed, for the loading message.
  const [failedCategory, setFailedCategory] = useState(null);

  // Paying users (and custom topics) draw from the paid pool, use each quote
  // up and refill it with AI. Everyone else draws from the free pool, which
  // they never use up (see convex/raceQuotes.ts). Neither pool is loaded until
  // the session and plan are known, or a paying user's opening quote would
  // come from the wrong pool.
  const freshQuotes = Boolean(me?.freshQuotes);
  const poolKnown = !convexAuthLoading && me !== undefined;
  const usesPaidPool = freshQuotes || isCustomCategory(category);
  const paidPool = useQuery(
    api.raceQuotes.getAvailableQuotes,
    poolKnown && usesPaidPool ? { category } : "skip"
  );
  // The free pool is fetched once per category rather than subscribed to: it
  // holds hundreds of quotes and changes whenever a paying user finishes a race.
  const convex = useConvex();
  const [freePool, setFreePool] = useState({ category: null, quotes: undefined });
  const wantsFreePool = poolKnown && !usesPaidPool;
  useEffect(() => {
    if (!wantsFreePool) return;
    let cancelled = false;
    convex
      .query(api.raceQuotes.getFreePool, { category })
      .then((quotes) => {
        if (!cancelled) setFreePool({ category, quotes });
      })
      .catch((err) => {
        console.error("Failed to load the free quote pool:", err);
        // An empty pool falls back to the built-in quotes.
        if (!cancelled) setFreePool({ category, quotes: [] });
      });
    return () => {
      cancelled = true;
    };
  }, [convex, category, wantsFreePool]);
  const availableQuotes = !poolKnown
    ? undefined
    : usesPaidPool
      ? paidPool
      : freePool.category === category
        ? freePool.quotes
        : undefined;

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
  latest.current = { category, mode, availableQuotes, customCategories, freshQuotes };

  /** Uses up a paid-pool quote (it moves to the free pool). Free players never use quotes up. */
  const retireQuote = (quoteId) => {
    if (!quoteId || !freshQuotes) return;
    retireQuoteMutation({ quoteId }).catch((err) =>
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
    } else {
      console.warn(
        convexRejectedSession
          ? "Race not saved: signed in to Clerk, but Convex rejected the session token."
          : "Race not saved: not signed in."
      );
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

  // Paying users keep the paid pool topped up to TARGET_POOL_SIZE. Refilling
  // starts once it dips below REFILL_BELOW rather than on every single draw,
  // so one generation request restocks several quotes instead of one per race.
  // This is the only time new quotes are generated.
  const TARGET_POOL_SIZE = 35;
  const REFILL_BELOW = 30;
  const REFILL_THROTTLE_MS = 30000;

  const poolIsLow = () => {
    const { mode: m, availableQuotes: quotes, freshQuotes: canRefill } = latest.current;
    if (m === "words" || !canRefill) return false;
    return quotes !== undefined && quotes.length < REFILL_BELOW;
  };

  /** How many quotes are needed to bring the current category back to target. */
  const poolDeficit = () => {
    const have = latest.current.availableQuotes?.length ?? 0;
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

  const generateNewQuotesIfNeeded = async (targetCategory = category) => {
    // Only paying users generate; the server refuses everyone else anyway.
    if (!latest.current.freshQuotes) return;
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
      const wanted = poolDeficit();
      console.log(`Generating ${wanted} new AI quotes for '${targetCategory}'...`);
      const existing = (latest.current.availableQuotes || []).map((q) => q.quote);
      const { quotes: newQuotes, model } = await generateQuotesBatch(
        targetCategory,
        wanted,
        existing,
        { topic }
      );
      if (newQuotes.length > 0) {
        // saveQuotesBatch returns how many actually landed -- it drops any that
        // duplicate what's already stored, so this is often lower than the
        // number generated. Reporting newQuotes.length here claimed successes
        // that never reached the table.
        const inserted = await saveQuotesBatch({
          quotes: newQuotes,
          category: targetCategory,
          model,
        });
        console.log(
          `Generated ${newQuotes.length} AI quotes for '${targetCategory}' with ${model}, saved ${inserted} new (${newQuotes.length - inserted} were duplicates)`
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
        model: "built-in",
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
      // Every quote here has been seen: start this pool over, leaving what
      // was seen in other categories alone.
      if (unseen.length === 0) candidates.forEach((q) => seenQuoteIds.current.delete(q.id));

      const pool = unseen.length > 0 ? unseen : candidates;
      if (pool.length === 0) {
        showFallback(targetCategory);
        return;
      }

      const selectedQuote = pool[Math.floor(Math.random() * pool.length)];
      seenQuoteIds.current.add(selectedQuote.id);
      writeSeenQuotes(seenQuoteIds.current);
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

  // Monitor the paid pool: if empty or low, proactively trigger AI quote
  // generation. customTopic is a dependency because a custom pool can't be
  // filled until the category list has loaded, and aiReady because nothing
  // should be generated before the AI model choice is known.
  useEffect(() => {
    if (!aiReady) return;
    refillIfLow();
  }, [availableQuotes?.length, mode, category, customTopic, aiReady, freshQuotes]);

  // A custom category that no longer exists (deleted in another tab, or the
  // user signed out) has nothing to draw from. Wait for the session first, so
  // a custom topic restored on reload isn't thrown away before the user's
  // list has loaded.
  useEffect(() => {
    if (!isCustomCategory(category) || convexAuthLoading) return;
    const gone = !isAuthenticated || (customCategories !== undefined && !customTopic);
    if (gone) handleCategoryChange("coding");
  }, [category, customCategories, customTopic, convexAuthLoading, isAuthenticated]);

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
            canCreate={Boolean(me?.customTopics)}
            signedIn={isAuthenticated}
            onCreate={handleCreateCategory}
            onDelete={handleDeleteCategory}
          />
        </div>

        <nav style={{ display: "flex", gap: "1rem" }}>
          {me && (
            <UpgradeButton className={`btn ${me.tier === "free" ? "btn-primary" : ""}`}>
              {me.tier === "free" ? "Upgrade" : "Plan"}
            </UpgradeButton>
          )}
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

      {convexRejectedSession && (
        <div
          role="alert"
          style={{ margin: "0 1rem 1rem", color: "var(--color-error)" }}
        >
          You're signed in, but the database rejected your session, so races
          aren't being saved. Check that convex/auth.config.ts matches the Clerk
          instance in VITE_CLERK_PUBLISHABLE_KEY.
        </div>
      )}

      {checkoutResult === "success" && (
        <div role="status" style={{ margin: "0 1rem 1rem", color: "var(--color-success)" }}>
          {me && me.tier !== "free"
            ? "Thanks! Your plan is active."
            : "Thanks! Payment received. Your plan will switch on in a few seconds."}
        </div>
      )}

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
                  : isCustomCategory(category) && !freshQuotes && availableQuotes?.length === 0
                    ? "This topic is out of quotes. New ones are part of Pro."
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
            problemKeys={getProblemKeys(displayHistory)}
            problemWords={getProblemWords(displayHistory)}
            storedQuotes={storedQuotes}
            historyLimit={isAuthenticated ? me?.historyLimit : null}
            adminPanel={
              isAuthenticated && isAdmin ? (
                <AiModelPicker defaultChoiceId={aiDefaultChoice} />
              ) : null
            }
          />
        )}
      </main>
    </div>
  );
}

export default App;
