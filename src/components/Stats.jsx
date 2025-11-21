import { format } from "date-fns";

export default function Stats({ history, problemKeys, problemWords }) {
  if (history.length === 0) {
    return (
      <div className="card">
        <h2 className="title" style={{ fontSize: "2rem" }}>
          Statistics
        </h2>
        <p style={{ color: "var(--text-secondary)" }}>
          No games played yet. Start typing to track your progress!
        </p>
      </div>
    );
  }

  const averageWpm = Math.round(
    history.reduce((acc, curr) => acc + curr.wpm, 0) / history.length
  );

  const averageAccuracy = Math.round(
    history.reduce((acc, curr) => acc + curr.accuracy, 0) / history.length
  );

  return (
    <div className="container" style={{ padding: 0 }}>
      <div className="stats-grid">
        <div className="stat-box">
          <div className="stat-value">{averageWpm}</div>
          <div className="stat-label">Avg WPM</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{averageAccuracy}%</div>
          <div className="stat-label">Avg Accuracy</div>
        </div>
        <div className="stat-box">
          <div className="stat-value">{history.length}</div>
          <div className="stat-label">Games Played</div>
        </div>
      </div>

      <div className="stats-grid">
        <div className="card">
          <h3 style={{ marginTop: 0 }}>Problem Keys</h3>
          <div className="problem-keys">
            {problemKeys.length > 0 ? (
              problemKeys.map(([key, count]) => (
                <div key={key} className="key-badge" title={`${count} errors`}>
                  {key === " " ? "Space" : key}{" "}
                  <span style={{ opacity: 0.7, fontSize: "0.8em" }}>
                    x{count}
                  </span>
                </div>
              ))
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                No errors yet!
              </p>
            )}
          </div>
        </div>

        <div className="card">
          <h3 style={{ marginTop: 0 }}>Problem Words</h3>
          <ul style={{ listStyle: "none", padding: 0, textAlign: "left" }}>
            {problemWords.length > 0 ? (
              problemWords.map(([word, count]) => (
                <li
                  key={word}
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    padding: "0.5rem 0",
                    borderBottom: "1px solid var(--bg-input)",
                  }}
                >
                  <span>{word}</span>
                  <span style={{ color: "var(--color-error)" }}>{count}</span>
                </li>
              ))
            ) : (
              <p style={{ color: "var(--text-muted)", fontSize: "0.9rem" }}>
                No missed words!
              </p>
            )}
          </ul>
        </div>
      </div>

      <div className="card" style={{ marginTop: "2rem" }}>
        <h3 style={{ marginTop: 0, textAlign: "left" }}>Recent History</h3>
        <div className="history-list">
          {history.slice(0, 10).map((session) => (
            <div key={session._id || session.id} className="history-item">
              <div
                style={{
                  display: "flex",
                  flexDirection: "column",
                  alignItems: "flex-start",
                }}
              >
                <span
                  style={{ fontWeight: "bold", color: "var(--text-primary)" }}
                >
                  {session.wpm} WPM
                </span>
                <span
                  style={{ fontSize: "0.8rem", color: "var(--text-muted)" }}
                >
                  {session.date
                    ? format(new Date(session.date), "MMM d, HH:mm")
                    : session._creationTime
                      ? format(new Date(session._creationTime), "MMM d, HH:mm")
                      : "Recent"}
                </span>
              </div>
              <div
                style={{ display: "flex", alignItems: "center", gap: "1rem" }}
              >
                <span
                  style={{
                    color:
                      session.accuracy >= 90
                        ? "var(--color-success)"
                        : "var(--color-warning)",
                  }}
                >
                  {session.accuracy}% Acc
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
