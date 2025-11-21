import { useEffect, useRef, useState } from "react";

const SENTENCES = [
  // General / Concepts
  "Clean code always looks like it was written by someone who cares.",
  "Premature optimization is the root of all evil in programming.",
  "Recursion is a method where the solution depends on solutions to smaller instances of the same problem.",
  "A closure is the combination of a function bundled together with references to its surrounding state.",
  "Big O notation is used to classify algorithms according to how their run time or space requirements grow.",

  // Frontend
  "React components implement a render method that takes input data and returns what to display.",
  "CSS Grid Layout excels at dividing a page into major regions or defining the relationship in terms of size, position, and layer.",
  "The Document Object Model is a cross-platform and language-independent interface that treats an XML or HTML document as a tree structure.",
  "Event bubbling describes how the browser handles events targeted at nested elements.",
  "TypeScript adds static typing to JavaScript to enable better tooling and catch errors early.",

  // Backend / Database
  "RESTful APIs use standard HTTP methods like GET, POST, PUT, and DELETE to perform operations on resources.",
  "SQL injection is a code injection technique that might destroy your database.",
  "Normalization is the process of organizing data in a database to reduce redundancy and improve data integrity.",
  "Node.js is a JavaScript runtime built on Chrome's V8 JavaScript engine.",
  "ACID properties ensure that database transactions are processed reliably.",

  // DevOps / Tools
  "Git is a distributed version control system for tracking changes in source code during software development.",
  "Docker containers wrap up a piece of software in a complete filesystem that contains everything it needs to run.",
  "Continuous Integration is the practice of merging all developers' working copies to a shared mainline several times a day.",
];

export default function Game({ onFinish }) {
  const [text, setText] = useState("");
  const [input, setInput] = useState("");
  const [startTime, setStartTime] = useState(null);
  const [wpm, setWpm] = useState(0);
  const [errors, setErrors] = useState({});
  const [missedWords, setMissedWords] = useState(new Set());
  const [isFinished, setIsFinished] = useState(false);

  const inputRef = useRef(null);

  useEffect(() => {
    resetGame();
  }, []);

  useEffect(() => {
    if (startTime && !isFinished) {
      const interval = setInterval(() => {
        calculateStats();
      }, 500);
      return () => clearInterval(interval);
    }
  }, [startTime, isFinished, input]);

  const resetGame = () => {
    const randomIndex = Math.floor(Math.random() * SENTENCES.length);
    setText(SENTENCES[randomIndex]);
    setInput("");
    setStartTime(null);
    setWpm(0);
    setErrors({});
    setMissedWords(new Set());
    setIsFinished(false);
    if (inputRef.current) inputRef.current.focus();
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

    if (e.key.length === 1 && !e.ctrlKey && !e.metaKey && !e.altKey) {
      if (!startTime) {
        setStartTime(Date.now());
      }

      const currentCharIndex = input.length;
      if (currentCharIndex >= text.length) return;

      const expectedChar = text[currentCharIndex];
      const typedChar = e.key;

      if (typedChar !== expectedChar) {
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
      }

      setInput((prev) => prev + typedChar);

      // Check completion
      if (input.length + 1 === text.length && typedChar === expectedChar) {
        // Validate if the whole string matches (it should if we only allow correct typing, but here we allow errors)
        // Actually, if we allow errors, we should probably only finish if the text is CORRECT.
        // But for simplicity, let's finish when length matches, and calculate accuracy.
        finishGame(input + typedChar);
      }
    }
  };

  const finishGame = (finalInput) => {
    setIsFinished(true);
    const timeElapsed = (Date.now() - startTime) / 1000 / 60;
    const wordsTyped = finalInput.length / 5;
    const finalWpm = Math.round(wordsTyped / timeElapsed);

    // Calculate accuracy
    let correctChars = 0;
    for (let i = 0; i < text.length; i++) {
      if (finalInput[i] === text[i]) correctChars++;
    }
    const accuracy = Math.round((correctChars / text.length) * 100);

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
          className += " correct";
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
    if (input.length === 0) return 100;
    let correctChars = 0;
    for (let i = 0; i < input.length; i++) {
      if (input[i] === text[i]) correctChars++;
    }
    return Math.round((correctChars / input.length) * 100);
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
        <button
          className="btn btn-primary"
          onClick={resetGame}
          style={{ marginTop: "1rem" }}
        >
          Play Again
        </button>
      )}
    </div>
  );
}
