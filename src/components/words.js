// Lowercase, punctuation-free vocabulary for words mode. Everything here is a
// word a programmer actually types, so the muscle memory carries over to real
// code rather than to prose.
export const CODING_WORDS = [
  // language keywords
  "const", "let", "var", "function", "return", "class", "extends", "super",
  "import", "export", "default", "from", "async", "await", "yield", "static",
  "public", "private", "protected", "void", "null", "undefined", "true",
  "false", "new", "this", "typeof", "instanceof", "delete", "throw", "try",
  "catch", "finally", "switch", "case", "break", "continue", "while", "for",
  "each", "else", "elif", "def", "lambda", "struct", "enum", "interface",
  "type", "impl", "trait", "macro", "package", "module", "namespace",

  // types and primitives
  "string", "number", "boolean", "object", "array", "buffer", "float",
  "double", "integer", "char", "byte", "bit", "hash", "list", "tuple", "set",
  "map", "dict", "queue", "stack", "tree", "graph", "node", "edge", "vector",
  "matrix", "pointer", "record", "union", "generic", "optional", "nullable",

  // common identifiers
  "index", "count", "value", "key", "item", "data", "result", "output",
  "input", "params", "args", "props", "state", "context", "config", "options",
  "payload", "response", "request", "handler", "callback", "listener",
  "wrapper", "helper", "utils", "temp", "buffer", "cursor", "offset", "limit",
  "total", "delta", "flag", "token", "session", "user", "admin", "client",
  "server", "socket", "route", "path", "query", "schema", "model", "view",
  "controller", "service", "factory", "adapter", "repo", "store", "cache",

  // methods and operations
  "map", "filter", "reduce", "slice", "splice", "concat", "join", "split",
  "push", "pop", "shift", "sort", "find", "some", "every", "includes",
  "match", "replace", "trim", "parse", "stringify", "clone", "merge",
  "assign", "bind", "call", "apply", "fetch", "render", "mount", "update",
  "commit", "rollback", "resolve", "reject", "retry", "throttle", "debounce",
  "batch", "stream", "pipe", "chain", "flatten", "group", "encode", "decode",
  "hash", "sign", "verify", "escape", "sanitize", "validate", "normalize",

  // tooling and workflow
  "git", "branch", "merge", "rebase", "stash", "clone", "remote", "origin",
  "head", "diff", "patch", "tag", "build", "deploy", "docker", "image",
  "container", "volume", "port", "env", "secret", "script", "test", "mock",
  "stub", "spy", "assert", "expect", "lint", "format", "bundle", "chunk",
  "minify", "compile", "runtime", "thread", "process", "worker", "daemon",
  "cron", "log", "trace", "debug", "profile", "benchmark", "metric",

  // domain vocabulary
  "recursion", "closure", "scope", "mutable", "immutable", "pure", "side",
  "effect", "pointer", "leak", "overflow", "underflow", "race", "lock",
  "mutex", "atomic", "async", "sync", "block", "poll", "push", "event",
  "loop", "stack", "heap", "alloc", "free", "pointer", "reference",
  "binary", "linear", "constant", "logarithmic", "quadratic", "greedy",
  "dynamic", "memoize", "traverse", "sibling", "parent", "child", "leaf",
  "root", "depth", "breadth", "pivot", "partition", "shard", "replica",
  "index", "primary", "foreign", "join", "cascade", "migrate", "seed",
];

/**
 * Builds a race string of `count` random words. Consecutive repeats are
 * avoided because typing the same word twice in a row reads like a bug.
 */
export function generateWords(count = 25) {
  const words = [];
  let previous = null;

  while (words.length < count) {
    const word = CODING_WORDS[Math.floor(Math.random() * CODING_WORDS.length)];
    if (word === previous) continue;
    words.push(word);
    previous = word;
  }

  return words.join(" ");
}

export const WORD_COUNTS = [10, 25, 50, 100];
