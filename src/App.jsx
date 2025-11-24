import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useRef, useState } from "react";
import { api } from "../convex/_generated/api";
import "./App.css";
import { AiChatbox } from "./components/ai/ai-chatbox";
import Game from "./components/Game";
import { SENTENCES } from "./components/Sentences";
import Stats from "./components/Stats";
import { Toggle } from "./components/ui/toggle";
import { useTypeTracker } from "./hooks/useTypeTracker";

function App() {
  const [sentance, setSentance] = useState("");
  const [view, setView] = useState("game");
  const [mistakesMode, setMistakesMode] = useState(false);
  const { history, saveSession, getProblemKeys, getProblemWords } =
    useTypeTracker();
  const { isAuthenticated } = useConvexAuth();

  const inputRef = useRef(null);

  const handleSaveRace = useMutation(api.races.saveRace);

  const setMistakes = useMutation(api.mistakes.createMistakes);

  const getMistakes = useQuery(api.mistakes.getMistakes);

  const handleSetMistakes = (pressed) => {
    if (isAuthenticated) {
      console.log("Saving mistakes mode to Convex...");
      setMistakes({ mistakes: pressed }).catch((err) =>
        console.error("Failed to save mistakes mode:", err)
      );
    } else {
      console.log("User not authenticated, skipping Convex save.");
    }
  };

  const handleGameFinish = (stats) => {
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

  const raceHistory = useQuery(api.races.getHistory);

  const tasks = useQuery(api.tasks.get);

  const displayHistory = isAuthenticated && raceHistory ? raceHistory : history;

  const generateNewSentence = () => {
    const randomIndex = Math.floor(Math.random() * SENTENCES.length);
    setSentance(SENTENCES[randomIndex]);
  };

  useEffect(() => {
    generateNewSentence();
  }, []);

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
                size="sm"
                pressed={
                  getMistakes?.mistakes !== undefined
                    ? getMistakes.mistakes
                    : mistakesMode
                }
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
