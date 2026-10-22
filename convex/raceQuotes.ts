import { v } from "convex/values";
import { internalMutation, mutation, query, type MutationCtx } from "./_generated/server";
import { dedupeQuotes } from "./quoteSimilarity";

// Keep in step with src/components/categories/builtInCategories.js.
const BUILT_IN_CATEGORIES = new Set([
  "coding",
  "architecture",
  "math",
  "science",
  "history",
  "geography",
  "art",
  "music",
]);
const MAX_BATCH = 25;
const MIN_QUOTE_LENGTH = 20;
const MAX_QUOTE_LENGTH = 500;
const MAX_MODEL_LENGTH = 100;

/**
 * Shared pools take writes from any signed-in user (they are restocked and
 * turned over by whoever is playing); a custom pool only from its owner.
 */
async function assertCanWrite(ctx: MutationCtx, category: string | undefined) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in to change the quote pool");
  if (!category) throw new Error("A category is required");
  if (category.startsWith("custom:")) {
    const id = ctx.db.normalizeId("customCategories", category.slice("custom:".length));
    const row = id && (await ctx.db.get(id));
    if (!row || row.userId !== identity.subject) {
      throw new Error("Not your category");
    }
  } else if (!BUILT_IN_CATEGORIES.has(category)) {
    throw new Error(`Unknown category: ${category}`);
  }
}

export const getAvailableQuotes = query({
  args: {
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let quotes;
    if (args.category) {
      quotes = await ctx.db
        .query("raceQuotes")
        .withIndex("by_category", (q) => q.eq("category", args.category))
        .collect();
    } else {
      quotes = await ctx.db.query("raceQuotes").collect();
    }
    return quotes.map((q) => ({ id: q._id, quote: q.quote, category: q.category }));
  },
});

export const getQuoteCount = query({
  args: {
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (args.category) {
      const quotes = await ctx.db
        .query("raceQuotes")
        .withIndex("by_category", (q) => q.eq("category", args.category))
        .collect();
      return quotes.length;
    }
    const quotes = await ctx.db.query("raceQuotes").collect();
    return quotes.length;
  },
});

export const getRandomQuote = query({
  args: {
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let quotes;
    if (args.category) {
      quotes = await ctx.db
        .query("raceQuotes")
        .withIndex("by_category", (q) => q.eq("category", args.category))
        .collect();
    } else {
      quotes = await ctx.db.query("raceQuotes").collect();
    }
    if (quotes.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * quotes.length);
    return quotes[randomIndex].quote;
  },
});

export const saveQuotesBatch = mutation({
  args: {
    quotes: v.array(v.string()),
    category: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    await assertCanWrite(ctx, args.category);
    if (args.quotes.length > MAX_BATCH) {
      throw new Error(`At most ${MAX_BATCH} quotes per batch`);
    }
    const model = args.model?.trim().slice(0, MAX_MODEL_LENGTH) || undefined;
    const candidates = args.quotes.filter(
      (q) => q.length >= MIN_QUOTE_LENGTH && q.length <= MAX_QUOTE_LENGTH
    );

    // The generator overlaps with what is already stored more than you'd
    // expect, and "the same fact reworded" is as bad for a typing pool as an
    // exact copy. dedupeQuotes rejects both exact and near duplicates (see
    // quoteSimilarity.ts), against the pool and within the batch itself.
    const existing = args.category
      ? await ctx.db
          .query("raceQuotes")
          .withIndex("by_category", (q) => q.eq("category", args.category))
          .collect()
      : await ctx.db.query("raceQuotes").collect();

    const fresh = dedupeQuotes(
      candidates,
      existing.map((q) => q.quote)
    );

    for (const quote of fresh) {
      await ctx.db.insert("raceQuotes", {
        quote,
        category: args.category,
        model,
      });
    }
    return fresh.length;
  },
});

// Rotate quotes: remove oldest quotes in category (or globally), add new ones.
// Internal: nothing in the app calls it, and it can empty any pool.
export const rotateQuotes = internalMutation({
  args: {
    newQuotes: v.array(v.string()),
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    let allQuotes;
    if (args.category) {
      allQuotes = await ctx.db
        .query("raceQuotes")
        .withIndex("by_category", (q) => q.eq("category", args.category))
        .collect();
    } else {
      allQuotes = await ctx.db.query("raceQuotes").collect();
    }

    // Sort by _creationTime (oldest first)
    const sortedQuotes = allQuotes.sort(
      (a, b) => a._creationTime - b._creationTime
    );

    // Delete oldest count
    const deleteCount = Math.min(args.newQuotes.length, sortedQuotes.length);
    const toDelete = sortedQuotes.slice(0, deleteCount);
    for (const quote of toDelete) {
      await ctx.db.delete(quote._id);
    }

    // Add new quotes
    for (const quote of args.newQuotes) {
      await ctx.db.insert("raceQuotes", {
        quote: quote,
        category: args.category,
      });
    }

    return {
      deleted: toDelete.length,
      added: args.newQuotes.length,
    };
  },
});

export const deleteQuote = mutation({
  args: {
    quoteId: v.id("raceQuotes"),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote) return false;
    await assertCanWrite(ctx, quote.category);
    await ctx.db.delete(args.quoteId);
    return true;
  },
});
