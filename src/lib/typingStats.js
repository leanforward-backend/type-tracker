// Pure helpers that turn a race's raw keystroke log into the numbers and series
// the results screen renders. Keeping them free of React makes them easy to
// reason about (and to check by hand) when a WPM number looks wrong.
//
// A keystroke is { t, index, correct }:
//   t       ms elapsed since the first keypress of the race
//   index   position in the target text the key was aimed at
//   correct whether the typed character matched the target

const CHARS_PER_WORD = 5;

/**
 * Per-second WPM samples. Each bucket holds the characters committed during
 * that second, scaled up to a per-minute rate, which is what makes the raw
 * line spiky and the reason bursts are visible at all.
 */
export function buildTimeline(keystrokes, durationMs) {
  const seconds = Math.max(1, Math.ceil(durationMs / 1000));
  const buckets = Array.from({ length: seconds }, () => ({
    raw: 0,
    correct: 0,
    errors: 0,
  }));

  for (const k of keystrokes) {
    const bucket = buckets[Math.min(seconds - 1, Math.floor(k.t / 1000))];
    bucket.raw += 1;
    if (k.correct) bucket.correct += 1;
    else bucket.errors += 1;
  }

  return buckets.map((bucket, i) => {
    // The final bucket is usually a partial second; scale it by the time that
    // actually elapsed, with a floor so a 30ms tail can't invent a 900 WPM spike.
    const spanMs = Math.max(200, Math.min(durationMs - i * 1000, 1000));
    const minutes = spanMs / 60000;
    return {
      second: i + 1,
      raw: Math.round(bucket.raw / CHARS_PER_WORD / minutes),
      wpm: Math.round(bucket.correct / CHARS_PER_WORD / minutes),
      errors: bucket.errors,
    };
  });
}

/** Maps every character position in the text to the index of the word it belongs to. */
function wordIndexByChar(text) {
  const map = new Array(text.length);
  let word = 0;
  for (let i = 0; i < text.length; i++) {
    map[i] = word;
    if (text[i] === " ") word += 1;
  }
  return map;
}

/**
 * Per-word speed. A burst is how fast a single word went, measured from the
 * keypress before it started to its last keypress, so the pause before the word
 * counts against it the same way it does in the overall WPM.
 */
export function computeBursts(keystrokes, text) {
  if (keystrokes.length === 0) return [];

  const charToWord = wordIndexByChar(text);
  const words = text.split(" ");
  const spans = new Map();

  keystrokes.forEach((k, i) => {
    const word = charToWord[k.index];
    if (word === undefined) return;
    const existing = spans.get(word);
    const startT = i > 0 ? keystrokes[i - 1].t : 0;
    if (!existing) {
      spans.set(word, { start: startT, end: k.t, chars: new Set([k.index]) });
    } else {
      existing.end = Math.max(existing.end, k.t);
      existing.chars.add(k.index);
    }
  });

  const bursts = [];
  for (const [word, span] of spans) {
    const elapsed = span.end - span.start;
    // Distinct positions, not keystrokes, so retyping after a backspace does
    // not inflate the burst. The trailing space counts, matching the way the
    // overall WPM divides every typed character by five.
    // The race clock starts on the first keypress, so that keystroke consumed
    // no measured time and must not count toward the first word's characters —
    // otherwise word one always reports an inflated burst.
    const chars = span.chars.size - (word === 0 ? 1 : 0);
    if (elapsed < 20 || chars === 0) continue;
    bursts.push({
      word: words[word],
      wpm: Math.round(chars / CHARS_PER_WORD / (elapsed / 60000)),
    });
  }
  return bursts;
}

/**
 * How evenly paced the race was: 100 means every second was the same speed.
 * Derived from the coefficient of variation of the raw per-second samples.
 */
export function computeConsistency(timeline) {
  const samples = timeline.map((point) => point.raw);
  if (samples.length < 2) return 100;

  const mean = samples.reduce((a, b) => a + b, 0) / samples.length;
  if (mean === 0) return 0;

  const variance =
    samples.reduce((acc, value) => acc + (value - mean) ** 2, 0) /
    samples.length;
  const cv = Math.sqrt(variance) / mean;
  return Math.max(0, Math.min(100, Math.round((1 - cv) * 100)));
}

/**
 * The full results payload. `wpm` counts only characters left correct at the
 * end; `rawWpm` counts every keypress, so the gap between the two is the cost
 * of the mistakes.
 */
export function buildRaceStats({
  text,
  finalInput,
  keystrokes,
  durationMs,
  errors,
  missedWords,
  mode,
}) {
  const safeDuration = Math.max(durationMs, 1);
  const minutes = safeDuration / 60000;

  let correctChars = 0;
  for (let i = 0; i < text.length; i++) {
    if (finalInput[i] === text[i]) correctChars += 1;
  }

  const totalKeystrokes = keystrokes.length;
  const correctKeystrokes = keystrokes.filter((k) => k.correct).length;

  const timeline = buildTimeline(keystrokes, safeDuration);
  const bursts = computeBursts(keystrokes, text);
  const burstValues = bursts.map((b) => b.wpm);

  return {
    wpm: Math.round(correctChars / CHARS_PER_WORD / minutes),
    rawWpm: Math.round(totalKeystrokes / CHARS_PER_WORD / minutes),
    accuracy:
      totalKeystrokes > 0
        ? Math.round((correctKeystrokes / totalKeystrokes) * 100)
        : 100,
    consistency: computeConsistency(timeline),
    durationMs: safeDuration,
    correctChars,
    incorrectChars: totalKeystrokes - correctKeystrokes,
    totalKeystrokes,
    peakBurst: burstValues.length ? Math.max(...burstValues) : 0,
    avgBurst: burstValues.length
      ? Math.round(burstValues.reduce((a, b) => a + b, 0) / burstValues.length)
      : 0,
    timeline,
    bursts,
    errors,
    missedWords,
    mode,
  };
}
