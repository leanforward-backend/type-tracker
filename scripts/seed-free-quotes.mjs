#!/usr/bin/env node
/**
 * Fills the free quote pools (see convex/raceQuotes.ts) with Claude Code on
 * your own subscription, instead of the AI APIs the app pays for.
 *
 *   node scripts/seed-free-quotes.mjs [--target 300] [--category coding ...]
 *     [--model claude-haiku-5-5] [--parallel 3] [--batch 20] [--prod]
 *
 * Needs `claude` logged in to a subscription and `npx convex` able to reach the
 * deployment (the dev one in .env.local, or --prod). Each batch uses the app's
 * own prompt (src/components/ai/quotePrompts.js) and goes in through
 * importFreeQuotes, which applies the same length, typing and duplicate rules
 * as an AI refill. Safe to stop and re-run: it only tops each pool up to the
 * target.
 */
import { spawn } from "node:child_process";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { parseArgs } from "node:util";
import { dedupeQuotes } from "../convex/quoteSimilarity.ts";
import {
  buildBatchPrompt,
  CATEGORY_PROMPT_CONFIG,
  cleanQuote,
  SYSTEM_INSTRUCTION,
} from "../src/components/ai/quotePrompts.js";

const { values: opts } = parseArgs({
  options: {
    target: { type: "string", default: "300" },
    category: { type: "string", multiple: true },
    model: { type: "string", default: "claude-haiku-5-5" },
    parallel: { type: "string", default: "3" },
    batch: { type: "string", default: "20" },
    prod: { type: "boolean", default: false },
  },
});
const TARGET = Number(opts.target);
const BATCH = Number(opts.batch);
const PARALLEL = Number(opts.parallel);
const CATEGORIES = opts.category ?? Object.keys(CATEGORY_PROMPT_CONFIG);
// Give up on a category after this many batches in a row add nothing (the
// model has run out of new ground, or Claude usage limits were hit).
const MAX_EMPTY_BATCHES = 4;
const FAILURE_PAUSE_MS = 20_000;

const QUOTES_SCHEMA = JSON.stringify({
  type: "object",
  properties: { quotes: { type: "array", items: { type: "string" } } },
  required: ["quotes"],
  additionalProperties: false,
});

for (const category of CATEGORIES) {
  if (!CATEGORY_PROMPT_CONFIG[category]) {
    console.error(`Unknown category: ${category}`);
    process.exit(2);
  }
}

function run(cmd, args, { input, cwd, env } = {}) {
  return new Promise((resolve, reject) => {
    const child = spawn(cmd, args, { cwd, env, stdio: ["pipe", "pipe", "pipe"] });
    let stdout = "";
    let stderr = "";
    child.stdout.on("data", (d) => (stdout += d));
    child.stderr.on("data", (d) => (stderr += d));
    child.on("error", reject);
    child.on("close", (code) => resolve({ code, stdout, stderr }));
    child.stdin.end(input ?? "");
  });
}

async function convex(fn, args) {
  const { code, stdout, stderr } = await run("npx", [
    "convex",
    "run",
    ...(opts.prod ? ["--prod"] : []),
    fn,
    JSON.stringify(args),
  ]);
  if (code !== 0) throw new Error(`convex run ${fn} failed: ${stderr.trim().split("\n").pop()}`);
  return JSON.parse(stdout);
}

// A lean headless call: no tools, MCP servers, settings, hooks or saved
// session, from an empty directory so no CLAUDE.md is picked up.
const emptyDir = mkdtempSync(join(tmpdir(), "seed-quotes-"));
process.on("exit", () => rmSync(emptyDir, { recursive: true, force: true }));
process.on("SIGINT", () => process.exit(130));

async function generate(category, avoid) {
  const { prompt, examples } = buildBatchPrompt(category, BATCH, avoid, {
    responseFormat: 'Return the facts as the "quotes" list.',
  });
  const env = { ...process.env };
  // Claude Code refuses to start inside another Claude Code session.
  delete env.CLAUDECODE;
  const { stdout, stderr } = await run(
    "claude",
    [
      "-p",
      "--model", opts.model,
      "--output-format", "json",
      "--no-session-persistence",
      "--tools", "",
      "--strict-mcp-config",
      "--disable-slash-commands",
      "--setting-sources", "",
      "--system-prompt", SYSTEM_INSTRUCTION,
      "--json-schema", QUOTES_SCHEMA,
    ],
    { input: prompt, cwd: emptyDir, env }
  );
  // `--bare` or a missing login prints nothing on stdout.
  if (!stdout.trim()) throw new Error(`claude printed nothing: ${stderr.trim() || "not logged in?"}`);
  const out = JSON.parse(stdout);
  if (out.is_error) throw new Error(`claude: ${out.result}`);
  const quotes = (out.structured_output?.quotes ?? []).map(cleanQuote).filter(Boolean);
  // modelUsage also lists a small background call; the writer has the most output.
  const usage = Object.entries(out.modelUsage ?? {});
  const model = usage.sort((a, b) => b[1].outputTokens - a[1].outputTokens)[0]?.[0] ?? opts.model;
  // The prompt shows a few examples; don't let an echo of one into the pool.
  return { quotes: dedupeQuotes(quotes, examples), model };
}

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

async function seedCategory(category) {
  let { count, recent } = await convex("raceQuotes:freePoolForSeeding", { category });
  const avoid = [...recent];
  let empty = 0;
  console.log(`${category}: ${count}/${TARGET}`);
  while (count < TARGET && empty < MAX_EMPTY_BATCHES) {
    let added = 0;
    try {
      const { quotes, model } = await generate(category, avoid);
      const result = await convex("raceQuotes:importFreeQuotes", { category, quotes, model });
      added = result.inserted;
      count = result.count;
      avoid.push(...quotes);
      console.log(`${category}: +${added} of ${quotes.length} from ${model}, now ${count}/${TARGET}`);
    } catch (err) {
      console.error(`${category}: batch failed: ${err.message}`);
      await sleep(FAILURE_PAUSE_MS);
    }
    empty = added > 0 ? 0 : empty + 1;
  }
  return { category, count };
}

const queue = [...CATEGORIES];
const results = [];
await Promise.all(
  Array.from({ length: Math.min(PARALLEL, queue.length) }, async () => {
    while (queue.length > 0) results.push(await seedCategory(queue.shift()));
  })
);

const short = results.filter((r) => r.count < TARGET);
console.log(
  `\nDone. ${results.map((r) => `${r.category} ${r.count}`).join(", ")}` +
    (short.length ? `\nShort of ${TARGET}: ${short.map((r) => r.category).join(", ")}. Re-run to top up.` : "")
);
process.exit(short.length ? 1 : 0);
