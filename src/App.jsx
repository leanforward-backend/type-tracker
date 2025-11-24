import { useConvexAuth, useMutation, useQuery } from "convex/react";
import { useEffect, useState } from "react";
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

  const handleSaveRace = useMutation(api.races.saveRace);

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

  const raceHistory = useQuery(api.races.getHistory);

  const tasks = useQuery(api.tasks.get);
  const createTask = useMutation(api.tasks.create);

  const displayHistory = isAuthenticated && raceHistory ? raceHistory : history;

  const generateNewSentence = () => {
    const randomIndex = Math.floor(Math.random() * SENTENCES.length);
    setSentance(SENTENCES[randomIndex]);
  };

  useEffect(() => {
    generateNewSentence();
  }, []);

  // console.log(sentance);

  return (
    <div className="app-container">
      {/* <Test /> */}
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
            {tasks === undefined ? (
              <div>Loading tasks...</div>
            ) : tasks.length === 0 ? (
              <Toggle
                size="sm"
                pressed={mistakesMode}
                onPressedChange={setMistakesMode}
              >
                Mistakes?
              </Toggle>
            ) : (
              tasks.map(({ _id, text }) => <div key={_id}>{text}</div>)
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
