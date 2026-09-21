import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";
import { buildRaceStats } from "../lib/typingStats";
import RaceResults from "./results/RaceResults";

// Read the clock through a module-level helper. Every call site below is an
// event handler or an interval, but a bare Date.now() inside the component body
// trips the React Compiler's purity rule.
const nowMs = () => Date.now();

// Created once for the module rather than per race, so remounting the game
// between races doesn't re-fetch the audio.
const typeSound = new Audio("https://www.edclub.com/m/audio/typewriter.mp3");
const errorSound = new Audio("https://www.edclub.com/m/audio/error.mp3");

// The browser rejects play() when the sound is blocked or still loading;
// without a catch every keypress logs an unhandled rejection.
const playSound = (sound) => {
  sound.currentTime = 0;
  sound.play().catch(() => {});
};

/**
 * Renders one race. The parent remounts it via a `key` to start a new race, so
 * every piece of per-race state here is initialised once and never reset.
 */

export default function Game({
  onFinish,
  mistakesMode,
  SENTENCES,
  onReset,
  forwardedRef,
  mode = "quote",
  canSaveQuote = true,
}) {
  // Guard against a non-string prop reaching text.split() downstream.
  const text = typeof SENTENCES === "string" ? SENTENCES : "";

  const [input, setInput] = useState("");
  const [startTime, setStartTime] = useState(null);
  const [now, setNow] = useState(0);
  const [incorrectIndices, setIncorrectIndices] = useState(new Set());
  // Mirrors the keystroke log so the live accuracy readout reads from state
  // rather than from a ref during render.
  const [counts, setCounts] = useState({ typed: 0, correct: 0 });
  const [results, setResults] = useState(null);
  const [saved, setSaved] = useState(false);

  // Telemetry lives in refs so the finish handler reads it synchronously.
  // Reading it out of state meant the final keystroke was always missing from
  // the totals, because the state update hadn't flushed yet.
  const keystrokesRef = useRef([]);
  const errorsRef = useRef({});
  const missedWordsRef = useRef(new Set());

  const localRef = useRef(null);
  const inputRef = forwardedRef ?? localRef;
  const playAgainRef = useRef(null);

  const isFinished = results !== null;

  useEffect(() => {
    if (isFinished) {
      const id = setTimeout(() => playAgainRef.current?.focus(), 0);
      return () => clearTimeout(id);
    }
  }, [isFinished]);

  const saveQuote = useMutation(api.storedQuotes.saveQuote);

  const handleSaveQuote = () => {
    saveQuote({ quote: SENTENCES });
    setSaved(true);
  };

  // Take focus as soon as a race mounts so the user can start typing straight away.
  useEffect(() => {
    inputRef.current?.focus();
  }, [inputRef]);

  // Drives the live timer and WPM readout. Only the clock lives here now, so
  // the interval no longer restarts on every keystroke.
  useEffect(() => {
    if (!startTime || isFinished) return;
    const interval = setInterval(() => setNow(nowMs()), 200);
    return () => clearInterval(interval);
  }, [startTime, isFinished]);

  const wordAt = (charIndex) => {
    const words = text.split(" ");
    let charCount = 0;
    for (const word of words) {
      if (charIndex >= charCount && charIndex < charCount + word.length + 1) {
        return word;
      }
      charCount += word.length + 1; // +1 for the space
    }
    return null;
  };

  const handleKeyDown = (e) => {
    if (isFinished) return;

    if (e.key === "Backspace") {
      e.preventDefault();
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (mistakesMode) {
      const lastCharIndex = input.length - 1;
      if (lastCharIndex >= 0 && input[lastCharIndex] !== text[lastCharIndex]) {
        return;
      }
    }

    if (e.key.length !== 1 || e.ctrlKey || e.metaKey || e.altKey) return;

    e.preventDefault();

    const currentCharIndex = input.length;
    if (currentCharIndex >= text.length) return;

    const raceStart = startTime ?? nowMs();
    if (!startTime) {
      setStartTime(raceStart);
      setNow(raceStart);
    }

    const expectedChar = text[currentCharIndex];
    const typedChar = e.key;
    const isCorrect = typedChar === expectedChar;

    keystrokesRef.current.push({
      t: nowMs() - raceStart,
      index: currentCharIndex,
      correct: isCorrect,
    });
    setCounts((prev) => ({
      typed: prev.typed + 1,
      correct: prev.correct + (isCorrect ? 1 : 0),
    }));

    if (isCorrect) {
      playSound(typeSound);
    } else {
      setIncorrectIndices((prev) => new Set(prev).add(currentCharIndex));
      errorsRef.current[expectedChar] =
        (errorsRef.current[expectedChar] || 0) + 1;

      const word = wordAt(currentCharIndex);
      if (word) missedWordsRef.current.add(word.replace(/[^a-zA-Z]/g, ""));

      playSound(errorSound);
    }

    setInput((prev) => prev + typedChar);

    if (currentCharIndex + 1 === text.length && isCorrect) {
      finishGame(input + typedChar, raceStart);
    }
  };

  const finishGame = (finalInput, raceStart) => {
    const stats = buildRaceStats({
      text,
      finalInput,
      keystrokes: keystrokesRef.current,
      durationMs: nowMs() - raceStart,
      errors: { ...errorsRef.current },
      missedWords: Array.from(missedWordsRef.current),
      mode,
    });

    setResults(stats);
    onFinish(stats);
  };

  const renderText = () =>
    text.split("").map((char, index) => {
      let className = "char";
      if (index < input.length) {
        if (input[index] === char) {
          className +=
            mistakesMode && incorrectIndices.has(index)
              ? " corrected"
              : " correct";
        } else {
          className += " incorrect";
        }
      } else if (index === input.length) {
        className += " current";
      }

      return (
        <span key={index} className={className}>
          {char}
        </span>
      );
    });

  // Per-character outcome for the post-race quote review. Unlike the live
  // view, corrected characters are marked in every mode, since the point of
  // the review is to show where the mistakes happened.
  const reviewChars = () =>
    text.split("").map((char, index) => {
      let status = "correct";
      if (input[index] !== char) status = "incorrect";
      else if (incorrectIndices.has(index)) status = "corrected";
      return { char, status };
    });

  const elapsedMs = startTime ? Math.max(now - startTime, 0) : 0;

  const liveWpm = () => {
    if (!startTime || elapsedMs < 500) return 0;
    let correct = 0;
    for (let i = 0; i < input.length; i++) {
      if (input[i] === text[i]) correct += 1;
    }
    return Math.round(correct / 5 / (elapsedMs / 60000));
  };

  const liveAccuracy = () =>
    counts.typed === 0
      ? 100
      : Math.round((counts.correct / counts.typed) * 100);

  const handleRestart = () => {
    setSaved(false);
    // App owns retiring the used quote now, so every path that draws a new
    // one (this button, the "new quote" chip, category switches) retires the
    // old one exactly once.
    onReset();
  };

  return (
    <div
      className="card"
      onKeyDown={handleKeyDown}
      tabIndex="0"
      ref={inputRef}
      style={{ outline: "none" }}
    >
      {isFinished ? (
        <RaceResults
          stats={results}
          quoteReview={reviewChars()}
          onRestart={handleRestart}
          onSaveQuote={handleSaveQuote}
          saved={saved}
          canSaveQuote={canSaveQuote}
          restartRef={playAgainRef}
        />
      ) : (
        <>
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              marginBottom: "1rem",
            }}
          >
            <div className="stat-label">
              WPM:
              <span
                style={{ color: "var(--accent-primary)", fontSize: "1.2em" }}
              >
                {liveWpm()}
              </span>
            </div>
            <div className="stat-label">
              Accuracy:
              <span
                style={{ color: "var(--accent-primary)", fontSize: "1.2em" }}
              >
                {liveAccuracy()}%
              </span>
            </div>
            <div className="stat-label">
              Time:
              <span style={{ color: "var(--text-primary)" }}>
                {Math.round(elapsedMs / 1000)}s
              </span>
            </div>
          </div>

          <div className="typing-area">{renderText()}</div>

          <div
            style={{
              marginTop: "2rem",
              color: "var(--text-secondary)",
              fontSize: "0.9rem",
            }}
          >
            Start typing to begin...
          </div>
        </>
      )}
    </div>
  );
}
