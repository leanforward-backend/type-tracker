import { SignInButton, UserButton } from "@clerk/clerk-react";
import {
  Authenticated,
  Unauthenticated,
  useConvexAuth,
  useMutation,
  useQuery,
} from "convex/react";
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

  const tasks = useQuery(api.tasks.get);
  const createTask = useMutation(api.tasks.create);

  return (
    <div className="app-container">
      <header
        style={{
          marginBottom: "3rem",
          display: "grid",
          gridTemplateColumns: "1fr auto 1fr",
          alignItems: "center",
          padding: "1rem",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: "1rem" }}>
          <h1 className="title" style={{ fontSize: "2.5rem", margin: 0 }}>
            Type<span style={{ color: "var(--text-primary)" }}>Tracker</span>
          </h1>
          {/* Optional: Keep tasks debug info here or move it */}
          <div
            className="title"
            style={{ fontSize: "1rem", margin: 0, marginLeft: "20px" }}
          >
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

        <div style={{ display: "flex", justifyContent: "flex-end" }}>
          <Unauthenticated>
            <SignInButton mode="modal">
              <button className="btn">Sign In</button>
            </SignInButton>
          </Unauthenticated>
          <Authenticated>
            <UserButton />
          </Authenticated>
        </div>
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
