import dotenv from "dotenv";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const FILMING = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
export const ROOT = path.resolve(FILMING, "..");

// A Clerk dev-instance test address (+clerk_test), so it never receives mail.
export const DEMO_EMAIL = "alex.demo+clerk_test@typetracker.dev";
export const DEMO_NAME = "Alex Demo";

/** The app's own env files, read without touching process.env. */
export function loadEnv() {
  const env = {
    ...dotenv.config({ path: path.join(ROOT, ".env"), processEnv: {}, quiet: true }).parsed,
    ...dotenv.config({ path: path.join(ROOT, ".env.local"), processEnv: {}, quiet: true }).parsed,
  };
  for (const key of ["CLERK_SECRET_KEY", "VITE_CLERK_PUBLISHABLE_KEY", "VITE_CONVEX_URL"]) {
    if (!env[key]) throw new Error(`${key} is missing from .env.local`);
  }
  return env;
}
