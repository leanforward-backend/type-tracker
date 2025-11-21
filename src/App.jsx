import { useMutation, useQuery } from "convex/react";
import { useState } from "react";
import { api } from "../convex/_generated/api";
import "./App.css";
import Game from "./components/Game";
import Stats from "./components/Stats";
import { useTypeTracker } from "./hooks/useTypeTracker";

function App() {
  const [view, setView] = useState("game");
  const { history, saveSession, getProblemKeys, getProblemWords } =
    useTypeTracker();

  const handleSaveRace = useMutation(api.races.saveRace);

  const handleGameFinish = (stats) => {
    saveSession(stats);
    handleSaveRace(stats);
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
