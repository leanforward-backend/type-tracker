import { useEffect, useState } from "react";

export function useTypeTracker() {
  const [history, setHistory] = useState([]);

  // Load history from the backend when the component mounts
  useEffect(() => {
    // fetch('/api/history')
    //   .then(res => res.json())
    //   .then(data => {
    //     if (data.message === 'success') {
    //       setHistory(data.data);
    //     }
    //   })
    //   .catch(err => console.error('Failed to fetch history:', err));
  }, []);

  const saveSession = (stats) => {
    const newSession = {
      date: new Date().toISOString(),
      wpm: stats.wpm,
      accuracy: stats.accuracy,
      errors: stats.errors, // { char: count }
      missedWords: stats.missedWords, // [word, word]
    };

    // Optimistically update UI
    setHistory((prev) => [newSession, ...prev]);

    // Send to backend
    fetch("/api/history", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify(newSession),
    })
      .then((res) => res.json())
      .then((data) => {
        if (data.message !== "success") {
          console.error("Failed to save session");
          // Could revert state here if needed
        }
      })
      .catch((err) => console.error("Error saving session:", err));
  };

  const getProblemKeys = () => {
    const keyCounts = {};
    history.forEach((session) => {
      if (session.errors) {
        Object.entries(session.errors).forEach(([key, count]) => {
          keyCounts[key] = (keyCounts[key] || 0) + count;
        });
      }
    });

    return Object.entries(keyCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10); // Top 10 problem keys
  };

  const getProblemWords = () => {
    const wordCounts = {};
    history.forEach((session) => {
      if (session.missedWords) {
        session.missedWords.forEach((word) => {
          wordCounts[word] = (wordCounts[word] || 0) + 1;
        });
      }
    });

    return Object.entries(wordCounts)
      .sort(([, a], [, b]) => b - a)
      .slice(0, 10); // Top 10 problem words
  };

  return {
    history,
    saveSession,
    getProblemKeys,
    getProblemWords,
  };
}
