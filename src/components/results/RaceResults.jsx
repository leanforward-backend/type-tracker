import PerformanceChart from "./PerformanceChart";

function Tile({ label, value, hint }) {
  return (
    <div className="result-tile">
      <div className="result-tile-label">{label}</div>
      <div className="result-tile-value">{value}</div>
      {hint && <div className="result-tile-hint">{hint}</div>}
    </div>
  );
}

export default function RaceResults({
  stats,
  onRestart,
  onSaveQuote,
  saved,
  canSaveQuote,
  restartRef,
}) {
  const seconds = stats.durationMs / 1000;
  const fastestWord = stats.bursts.reduce(
    (best, burst) => (best && best.wpm >= burst.wpm ? best : burst),
    null
  );

  return (
    <div className="results">
      <div className="results-headline">
        <div className="results-hero">
          <div className="results-hero-label">wpm</div>
          <div className="results-hero-value">{stats.wpm}</div>
        </div>
        <div className="results-hero">
          <div className="results-hero-label">accuracy</div>
          <div className="results-hero-value">{stats.accuracy}%</div>
        </div>
      </div>

      <PerformanceChart timeline={stats.timeline} />

      <div className="results-tiles">
        <Tile
          label="raw wpm"
          value={stats.rawWpm}
          hint="every keypress counted"
        />
        <Tile
          label="peak burst"
          value={stats.peakBurst}
          hint={fastestWord ? `on "${fastestWord.word}"` : "—"}
        />
        <Tile label="avg burst" value={stats.avgBurst} hint="per word" />
        <Tile
          label="consistency"
          value={`${stats.consistency}%`}
          hint="evenness of pace"
        />
        <Tile
          label="characters"
          value={`${stats.correctChars}/${stats.incorrectChars}`}
          hint="correct / incorrect"
        />
        <Tile label="time" value={`${seconds.toFixed(1)}s`} hint={stats.mode} />
      </div>

      <div className="results-actions">
        <button ref={restartRef} className="btn btn-primary" onClick={onRestart}>
          Next Race
        </button>
        {canSaveQuote && (
          <button className="btn" onClick={onSaveQuote}>
            {saved ? "Saved!" : "Save Quote"}
          </button>
        )}
      </div>
    </div>
  );
}
