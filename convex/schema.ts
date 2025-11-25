import { defineSchema, defineTable } from "convex/server";
import { v } from "convex/values";

export default defineSchema({
  mistakes: defineTable({
    userId: v.optional(v.string()),
    mistakes: v.boolean(),
  }).index("by_user_id", ["userId"]),
  races: defineTable({
    userId: v.string(),
    wpm: v.number(),
    accuracy: v.number(),
    date: v.optional(v.string()),
    errors: v.record(v.string(), v.number()),
    missedWords: v.array(v.string()),
  }).index("by_user_id", ["userId"]),
  storedQuotes: defineTable({
    userId: v.optional(v.string()),
    quote: v.string(),
  }).index("by_user_id", ["userId"]),
  raceQuotes: defineTable({
    quote: v.string(),
  }),
});
