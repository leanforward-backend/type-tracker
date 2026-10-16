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
    category: v.optional(v.string()),
  }).index("by_category", ["category"]),
  // Topics a user typed in themselves. Their quotes live in raceQuotes under
  // the category key `custom:<_id>`, so each user's topic has its own pool.
  customCategories: defineTable({
    userId: v.string(),
    name: v.string(),
  }).index("by_user_id", ["userId"]),
  // What a user has paid for and how much AI they have used. Created on first
  // AI use or checkout; a missing row means a free account with nothing used.
  // See entitlements.ts for how these fields turn into features.
  accounts: defineTable({
    userId: v.string(),
    stripeCustomerId: v.optional(v.string()),
    subscriptionId: v.optional(v.string()),
    // Stripe's subscription status, e.g. "active", "past_due", "canceled".
    subStatus: v.optional(v.string()),
    subCurrentPeriodEnd: v.optional(v.number()), // ms since epoch
    // Bought the one-off pack: full stats and custom topics for good.
    hasLifetime: v.optional(v.boolean()),
    packCredits: v.optional(v.number()),
    // Free Pro, set by hand in the Convex dashboard (or via COMPED_EMAILS).
    comped: v.optional(v.boolean()),
    freeAiUsed: v.optional(v.number()),
    aiPeriod: v.optional(v.string()), // "2026-10", UTC month
    aiPeriodCount: v.optional(v.number()),
    quoteDay: v.optional(v.string()), // "2026-10-16", UTC day
    quoteDayCount: v.optional(v.number()),
  })
    .index("by_user_id", ["userId"])
    .index("by_stripe_customer", ["stripeCustomerId"]),
  // Stripe event ids already applied, so a redelivered webhook can't grant a
  // pack twice.
  stripeEvents: defineTable({
    eventId: v.string(),
  }).index("by_event_id", ["eventId"]),
});
