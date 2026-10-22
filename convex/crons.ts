import { cronJobs } from "convex/server";
import { internal } from "./_generated/api";

const crons = cronJobs();

// Paid races keep moving quotes into the free pools; keep each one bounded.
crons.daily("trim free quote pools", { hourUTC: 17, minuteUTC: 0 }, internal.raceQuotes.trimFreePools);

export default crons;
