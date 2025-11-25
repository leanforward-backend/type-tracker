import { useMutation } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../../convex/_generated/api";

export default function Game({
  onFinish,
  mistakesMode,
  SENTENCES,
  isReset,
  onReset,
  forwardedRef,
  currentQuoteId,
}) {
  const [text, setText] = useState("");
  const [input, setInput] = useState("");
  const [startTime, setStartTime] = useState(null);
  const [wpm, setWpm] = useState(0);
  const [errors, setErrors] = useState({});
  const [missedWords, setMissedWords] = useState(new Set());
  const [incorrectIndices, setIncorrectIndices] = useState(new Set());
  const [isFinished, setIsFinished] = useState(false);
  const [saved, setSaved] = useState(false);

  const inputRef = forwardedRef || useRef(null);
  const playAgainRef = useRef(null);

  useEffect(() => {
    if (isFinished) {
      setTimeout(() => {
        playAgainRef.current?.focus();
      }, 0);
    }
  }, [isFinished]);

  const typeSound = useRef(
    new Audio("https://www.edclub.com/m/audio/typewriter.mp3")
  );
  const errorSound = useRef(
    new Audio("https://www.edclub.com/m/audio/error.mp3")
  );

  const saveQuote = useMutation(api.storedQuotes.saveQuote);

  const deleteQuote = useMutation(api.raceQuotes.deleteQuote);

  const handleSaveQuote = () => {
    saveQuote({
      quote: SENTENCES,
    });
    setSaved(true);
  };

  useEffect(() => {
    resetGame();
  }, [SENTENCES]);

  useEffect(() => {
    if (startTime && !isFinished) {
      const interval = setInterval(() => {
        calculateStats();
      }, 200);
      return () => clearInterval(interval);
    }
  }, [startTime, isFinished, input]);

  const resetGame = () => {
    // Ensure text is always a string to prevent "text.split is not a function" error
    const gameText = typeof SENTENCES === "string" ? SENTENCES : "";
    if (typeof SENTENCES !== "string" && SENTENCES) {
      console.warn("Game received non-string SENTENCES prop:", SENTENCES);
    }

    setText(gameText);
    setInput("");
    setStartTime(null);
    setWpm(0);
    setErrors({});
    setMissedWords(new Set());
    setIncorrectIndices(new Set());
    setIsFinished(false);
    if (inputRef.current) inputRef.current.focus();
  };

  const removeQuote = async () => {
    // Delete the quote that was just completed
    if (currentQuoteId) {
      try {
        await deleteQuote({ quoteId: currentQuoteId });
        console.log("Deleted completed quote");
      } catch (error) {
        console.error("Failed to delete quote:", error);
      }
    }
  };

  const calculateStats = () => {
    if (!startTime) return;
    const timeElapsed = (Date.now() - startTime) / 1000 / 60;
    if (timeElapsed === 0) return;

    const wordsTyped = input.length / 5;
    const currentWpm = Math.round(wordsTyped / timeElapsed);
    setWpm(currentWpm);
  };

  const handleKeyDown = (e) => {
    if (isFinished) return;

    if (e.key === "Backspace") {
      setInput((prev) => prev.slice(0, -1));
      return;
    }

    if (mistakesMode) {
      const lastCharIndex = input.length - 1;
      if (lastCharIndex >= 0 && input[lastCharIndex] !== text[lastCharIndex]) {
        return;
      }
    }

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!startTime) {
        setStartTime(Date.now());
      }

      const currentCharIndex = input.length;
      if (currentCharIndex >= text.length) return;

      const expectedChar = text[currentCharIndex];
      const typedChar = e.key;

      if (typedChar !== expectedChar) {
        setIncorrectIndices((prev) => new Set(prev).add(currentCharIndex));
        setErrors((prev) => ({
          ...prev,
          [expectedChar]: (prev[expectedChar] || 0) + 1,
        }));
        const words = text.split(" ");
        let charCount = 0;
        for (const word of words) {
          if (
            currentCharIndex >= charCount &&
            currentCharIndex < charCount + word.length + 1
          ) {
            setMissedWords((prev) =>
              new Set(prev).add(word.replace(/[^a-zA-Z]/g, ""))
            );
            break;
          }
          charCount += word.length + 1; // +1 for space
        }
        errorSound.current.currentTime = 0;
        errorSound.current.play();
      } else {
        typeSound.current.currentTime = 0;
        typeSound.current.play();
      }

      setInput((prev) => prev + typedChar);

      if (input.length + 1 === text.length && typedChar === expectedChar) {
        finishGame(input + typedChar);
      }
    }
  };

  const finishGame = (finalInput) => {
    setIsFinished(true);
    const timeElapsed = (Date.now() - startTime) / 1000 / 60;
    const wordsTyped = finalInput.length / 5;
    const finalWpm = Math.round(wordsTyped / timeElapsed);

    let correctChars = 0;
    for (let i = 0; i < text.length; i++) {
      if (finalInput[i] === text[i]) correctChars++;
    }

    const totalErrors = Object.values(errors).reduce((a, b) => a + b, 0);
    const totalAttempts = correctChars + totalErrors;
    const accuracy =
      totalAttempts > 0
        ? Math.round((correctChars / totalAttempts) * 100)
        : 100;

    onFinish({
      wpm: finalWpm,
      accuracy,
      errors,
      missedWords: Array.from(missedWords),
    });
  };

  // Render the text with highlights
  const renderText = () => {
    return text.split("").map((char, index) => {
      let className = "char";
      if (index < input.length) {
        if (input[index] === char) {
          if (mistakesMode && incorrectIndices.has(index)) {
            className += " corrected";
          } else {
            className += " correct";
          }
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
  };

  const calculateAccuracy = () => {
    const totalErrors = Object.values(errors).reduce((a, b) => a + b, 0);
    if (input.length === 0 && totalErrors === 0) return 100;

    let correctChars = 0;
    for (let i = 0; i < input.length; i++) {
      if (input[i] === text[i]) correctChars++;
    }

    const totalAttempts = correctChars + totalErrors;
    return totalAttempts > 0
      ? Math.round((correctChars / totalAttempts) * 100)
      : 0;
  };

  return (
    <div
      className="card"
      onKeyDown={handleKeyDown}
      tabIndex="0"
      ref={inputRef}
      style={{ outline: "none" }}
    >
      <div
        style={{
          display: "flex",
          justifyContent: "space-between",
          marginBottom: "1rem",
        }}
      >
        <div className="stat-label">
          WPM:
          <span style={{ color: "var(--accent-primary)", fontSize: "1.2em" }}>
            {wpm}
          </span>
        </div>
        <div className="stat-label">
          Accuracy:
          <span style={{ color: "var(--accent-primary)", fontSize: "1.2em" }}>
            {calculateAccuracy()}%
          </span>
        </div>
        <div className="stat-label">
          Time:
          <span style={{ color: "var(--text-primary)" }}>
            {startTime ? Math.round((Date.now() - startTime) / 1000) : 0}s
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
        {isFinished ? "Complete!" : "Start typing to begin..."}
      </div>

      {isFinished && (
        <div className=" items-center justify-center flex gap-2 mt-2">
          <button
            ref={playAgainRef}
            className="btn btn-primary"
            onClick={async () => {
              await removeQuote();
              onReset();
            }}
          >
            Play Again
          </button>
          <button
            className={"btn stats"}
            onClick={() => {
              handleSaveQuote();
            }}
          >
            {saved ? "Saved!" : "Save Quote"}
          </button>
        </div>
      )}
    </div>
  );
}
