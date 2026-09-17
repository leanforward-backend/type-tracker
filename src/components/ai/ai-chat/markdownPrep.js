/**
 * Normalises model output before it reaches react-markdown + remark-math.
 *
 * 1. `$$formula$$` written on a single line is treated by remark-math as
 *    inline math. Gemini writes display equations exactly that way, so put
 *    the delimiters on their own lines to get a centred block.
 * 2. A currency amount such as `$5 and $10` would be read as the inline math
 *    `5 and `. Escape a dollar that is directly followed by a number and then
 *    a space, punctuation or end of text. Real math like `$5$` or `$2x + 1$`
 *    is not affected because the closing `$` or a letter follows the digits.
 */
export function prepareMarkdown(text) {
  if (typeof text !== "string" || text.length === 0) return "";
  return text
    .replace(/^[ \t]*\$\$(.+?)\$\$[ \t]*$/gm, "$$$$\n$1\n$$$$")
    .replace(/\$(?=\d[\d,.]*(?:\s|$|[,.;:!?)]))/g, "\\$");
}
