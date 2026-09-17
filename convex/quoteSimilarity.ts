/**
 * Near-duplicate detection for generated quotes.
 *
 * Shared by the Convex mutation (guards the stored pool) and the browser
 * generator (filters a batch before it is sent). Kept dependency-free so it
 * bundles in both places.
 *
 * Two quotes count as "too similar" when they share at least MIN_SHARED_WORDS
 * content words (lowercased, stopwords removed, plurals folded) and those
 * shared words make up SIMILARITY_THRESHOLD or more of the *shorter* quote's
 * content words (the overlap coefficient). Using the shorter quote as the
 * denominator catches a terse restatement of a longer fact, which plain
 * Jaccard under-scores. Exact-text duplicates are caught by `normaliseQuote`.
 */

export const SIMILARITY_THRESHOLD = 0.5;
export const MIN_SHARED_WORDS = 3;

const STOPWORDS = new Set([
  "a", "an", "the", "and", "or", "but", "of", "to", "in", "on", "at", "by",
  "for", "with", "from", "as", "is", "are", "was", "were", "be", "been",
  "being", "it", "its", "this", "that", "these", "those", "which", "who",
  "whom", "whose", "what", "when", "where", "while", "than", "then", "so",
  "such", "into", "onto", "over", "under", "between", "through", "across",
  "each", "every", "all", "any", "both", "either", "more", "most", "less",
  "very", "can", "could", "may", "might", "will", "would", "shall", "should",
  "must", "do", "does", "did", "has", "have", "had", "not", "no", "only",
  "also", "because", "if", "their", "they", "them", "there", "here", "how",
  "up", "down", "out", "about", "after", "before", "using", "used", "use",
  "one", "two", "other", "another", "same", "often", "usually", "rather",
]);

/** Compare on lowercased alphanumerics so punctuation drift isn't a new quote. */
export function normaliseQuote(quote: string): string {
  return quote.toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
}

/** Fold regular plurals only; anything cleverer produces more mismatches than it fixes. */
function stem(word: string): string {
  if (word.length > 4 && word.endsWith("ies")) return word.slice(0, -3) + "y";
  if (word.length > 4 && /(sses|xes|zes|ches|shes)$/.test(word)) return word.slice(0, -2);
  if (word.length > 3 && word.endsWith("s") && !word.endsWith("ss")) return word.slice(0, -1);
  return word;
}

/** The set of meaning-carrying words in a quote. */
export function contentWords(quote: string): Set<string> {
  const words = new Set<string>();
  for (const raw of normaliseQuote(quote).split(" ")) {
    if (raw.length < 3 || STOPWORDS.has(raw)) continue;
    words.add(stem(raw));
  }
  return words;
}

function sharedCount(a: Set<string>, b: Set<string>): number {
  let shared = 0;
  for (const w of a) if (b.has(w)) shared++;
  return shared;
}

/** Overlap coefficient: shared words as a fraction of the shorter quote. */
export function similarity(a: Set<string>, b: Set<string>): number {
  if (a.size === 0 || b.size === 0) return 0;
  return sharedCount(a, b) / Math.min(a.size, b.size);
}

export function isTooSimilar(a: Set<string>, b: Set<string>): boolean {
  return sharedCount(a, b) >= MIN_SHARED_WORDS && similarity(a, b) >= SIMILARITY_THRESHOLD;
}

/**
 * Filters `candidates` down to quotes that are neither exact duplicates nor
 * near-duplicates of anything in `existing` or of each other. Order is kept,
 * so earlier candidates win ties.
 */
export function dedupeQuotes(candidates: string[], existing: string[]): string[] {
  const seenExact = new Set(existing.map(normaliseQuote));
  const seenWords = existing.map(contentWords);
  const kept: string[] = [];

  for (const quote of candidates) {
    const key = normaliseQuote(quote);
    if (!key || seenExact.has(key)) continue;
    const words = contentWords(quote);
    if (seenWords.some((w) => isTooSimilar(words, w))) continue;
    seenExact.add(key);
    seenWords.push(words);
    kept.push(quote);
  }
  return kept;
}
