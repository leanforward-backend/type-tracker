import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import "./App.css"; // We can keep this or remove it if we moved everything to index.css. Let's keep it empty or minimal.
import Game from "./components/Game";
import Stats from "./components/Stats";
import { useTypeTracker } from "./hooks/useTypeTracker";

function App() {
  const [view, setView] = useState("game"); // 'game' | 'stats'
  const { history, saveSession, getProblemKeys, getProblemWords } =
    useTypeTracker();

  const handleGameFinish = (stats) => {
    saveSession(stats);
    // Optional: automatically go to stats or show a summary modal.
    // For now, let's stay on game but maybe show a "Saved" toast or just let the user navigate.
    // Actually, a nice flow is to go to stats after a game to see how you did.
    // But often in type racers you want to retry immediately.
    // Let's just save it. The Game component handles the "Play Again" UI.
  };

  const tasks = useQuery(api.tasks.get);
  const createTask = useMutation(api.tasks.create);

  return (
    <div className="app-container">
      <header
        style={{
          marginBottom: "3rem",
          display: "flex",
          justifyContent: "space-between",
          alignItems: "center",
        }}
      >
        <div className="title" style={{ fontSize: "1rem", margin: 0 }}>
          {tasks === undefined ? (
            <div>Loading tasks...</div>
          ) : tasks.length === 0 ? (
            <button onClick={() => createTask({ text: "Sample Task" })}>
              Add Sample Task
            </button>
          ) : (
            tasks.map(({ _id, text }) => <div key={_id}>{text}</div>)
          )}
        </div>
        <h1 className="title" style={{ fontSize: "2.5rem", margin: 0 }}>
          Type<span style={{ color: "var(--text-primary)" }}>Tracker</span>
        </h1>
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
          <Game onFinish={handleGameFinish} />
        ) : (
          <Stats
            history={history}
            problemKeys={getProblemKeys()}
            problemWords={getProblemWords()}
          />
        )}
      </main>
    </div>
  );
}

export default App;
