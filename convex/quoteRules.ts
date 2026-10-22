/**
 * Rules every stored quote has to pass. Shared by the browser generator and
 * the Convex mutations that write quotes. Kept dependency-free so it bundles
 * in both places, like quoteSimilarity.ts.
 */

/**
 * Rejects quotes that are miserable to type. The prompt asks for words, but a
 * model under load still slips in an O(n) or a sixteen digit decimal, and a
 * typing pool is the one place that must never happen.
 */
export function isTypingFriendly(quote: string): boolean {
  if (/[^\x20-\x7E]/.test(quote)) return false; // accents, curly quotes, dashes: not on every keyboard
  if (/\d{5,}/.test(quote)) return false; // long digit runs
  if (/\d+\.\d{3,}/.test(quote)) return false; // long decimals
  if ((quote.match(/\d/g) || []).length > 8) return false; // too many digits overall
  if (/[{}[\]<>=|\\`~^_#$%&*/+@]/.test(quote)) return false; // code and symbol characters
  if (/\bO\(/.test(quote)) return false; // big-O notation
  if (/https?:|www\./i.test(quote)) return false; // URLs
  return true;
}
