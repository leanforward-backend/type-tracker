// Prepares the demo account the recording signs in as, on the DEV Clerk and
// Convex instances from ../.env.local:
//   1. finds or creates the Clerk user DEMO_EMAIL,
//   2. checks it is listed in the Convex env COMPED_EMAILS (Pro features),
//   3. replaces its race history with a believable three-week practice log,
//   4. stores a few saved quotes.
// Safe to re-run: it deletes the demo user's races before seeding.
import { createClerkClient } from "@clerk/backend";
import { ConvexHttpClient } from "convex/browser";
import { execFileSync } from "node:child_process";
import { api } from "../convex/_generated/api.js";
import { DEMO_EMAIL, DEMO_NAME, ROOT, loadEnv } from "./lib/env.mjs";

const env = loadEnv();
const clerk = createClerkClient({ secretKey: env.CLERK_SECRET_KEY });

async function demoUser() {
  const { data } = await clerk.users.getUserList({ emailAddress: [DEMO_EMAIL] });
  if (data.length > 0) return data[0];
  const [firstName, lastName] = DEMO_NAME.split(" ");
  console.log(`Creating Clerk user ${DEMO_EMAIL}`);
  return clerk.users.createUser({
    emailAddress: [DEMO_EMAIL],
    // This Clerk instance requires usernames.
    username: "alexdemo",
    firstName,
    lastName,
    skipPasswordRequirement: true,
  });
}

function checkComped() {
  const value = execFileSync("npx", ["convex", "env", "get", "COMPED_EMAILS"], {
    cwd: ROOT,
    encoding: "utf8",
    stdio: ["ignore", "pipe", "ignore"],
  });
  const emails = value.split(",").map((e) => e.trim().toLowerCase());
  if (!emails.includes(DEMO_EMAIL)) {
    console.warn(
      `\n${DEMO_EMAIL} is not in COMPED_EMAILS, so the demo shows the free tier.\n` +
        `Add it with: npx convex env set COMPED_EMAILS "<current>,${DEMO_EMAIL}"\n`
    );
  }
}

// Deterministic, so every run seeds the same history.
function rng(seed) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const PROBLEM_KEYS = { ";": 5, "{": 4, q: 3, z: 3, "(": 2, b: 2, y: 2, x: 1, "=": 1, p: 1 };
const PROBLEM_WORDS = [
  "asynchronous",
  "idempotent",
  "polymorphism",
  "concurrency",
  "dependency",
  "recursion",
  "immutable",
  "throughput",
  "middleware",
  "serializable",
];

function pickWeighted(rand, weights) {
  const total = Object.values(weights).reduce((a, b) => a + b, 0);
  let r = rand() * total;
  for (const [key, w] of Object.entries(weights)) {
    if ((r -= w) <= 0) return key;
  }
  return Object.keys(weights)[0];
}

function seedRaces() {
  const rand = rng(42);
  const races = [];
  const days = 21;
  const now = new Date();
  for (let day = days; day >= 0; day--) {
    // Most days have a couple of races, some have none.
    const count = rand() < 0.2 ? 0 : 1 + Math.floor(rand() * 3);
    for (let i = 0; i < count; i++) {
      const progress = 1 - day / days;
      const wpm = Math.round(64 + progress * 30 + (rand() - 0.5) * 12);
      const accuracy = Math.min(100, Math.round(92 + progress * 5 + (rand() - 0.5) * 4));
      const errors = {};
      const errorCount = Math.round((100 - accuracy) / 2 + rand() * 2);
      for (let e = 0; e < errorCount; e++) {
        const key = pickWeighted(rand, PROBLEM_KEYS);
        errors[key] = (errors[key] ?? 0) + 1;
      }
      const missedWords = PROBLEM_WORDS.filter((_, idx) => rand() < 0.35 - idx * 0.025);
      const date = new Date(now);
      date.setDate(now.getDate() - day);
      date.setHours(8 + Math.floor(rand() * 13), Math.floor(rand() * 60), 0, 0);
      if (date > now) date.setTime(now.getTime() - 3600_000);
      races.push({ wpm, accuracy, date: date.toISOString(), errors, missedWords });
    }
  }
  return races;
}

const SAVED_QUOTES = [
  "Make it work, make it right, make it fast.",
  "Premature optimization is the root of all evil.",
  "Simple things should be simple, complex things should be possible.",
];

const user = await demoUser();
console.log(`Demo user: ${user.id}`);
checkComped();

const session = await clerk.sessions.createSession({ userId: user.id });
const { jwt } = await clerk.sessions.getToken(session.id, "convex");
const convex = new ConvexHttpClient(env.VITE_CONVEX_URL);
convex.setAuth(jwt);

const me = await convex.query(api.entitlements.me, {});
console.log(`Convex sees tier: ${me?.tier ?? "signed out"}`);

const existing = await convex.query(api.races.getHistory, {});
for (const race of existing) await convex.mutation(api.races.deleteRace, { id: race._id });
console.log(`Deleted ${existing.length} old races`);

const races = seedRaces();
for (const race of races) await convex.mutation(api.races.saveRace, race);
console.log(`Seeded ${races.length} races`);

for (const quote of SAVED_QUOTES) await convex.mutation(api.storedQuotes.saveQuote, { quote });
console.log(`Saved ${SAVED_QUOTES.length} quotes`);

await clerk.sessions.revokeSession(session.id);
