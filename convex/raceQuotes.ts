import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const getAvailableQuotes = query({
  handler: async (ctx) => {
    const quotes = await ctx.db.query("raceQuotes").collect();
    return quotes.map((q) => ({ id: q._id, quote: q.quote }));
  },
});

export const getQuoteCount = query({
  handler: async (ctx) => {
    const quotes = await ctx.db.query("raceQuotes").collect();
    return quotes.length;
  },
});

export const getRandomQuote = query({
  handler: async (ctx) => {
    const quotes = await ctx.db.query("raceQuotes").collect();
    if (quotes.length === 0) return null;
    const randomIndex = Math.floor(Math.random() * quotes.length);
    return quotes[randomIndex].quote;
  },
});

export const saveQuotesBatch = mutation({
  args: {
    quotes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    for (const quote of args.quotes) {
      await ctx.db.insert("raceQuotes", {
        quote: quote,
      });
    }
    return args.quotes.length;
  },
});

// Rotate quotes: remove oldest 20, add 20 new ones
export const rotateQuotes = mutation({
  args: {
    newQuotes: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    // Get all quotes sorted by _creationTime (oldest first)
    const allQuotes = await ctx.db.query("raceQuotes").collect();

    // Sort by _creationTime (oldest first)
    const sortedQuotes = allQuotes.sort(
      (a, b) => a._creationTime - b._creationTime
    );

    // Delete oldest 20 quotes (or all if less than 20)
    const toDelete = sortedQuotes.slice(0, Math.min(20, sortedQuotes.length));
    for (const quote of toDelete) {
      await ctx.db.delete(quote._id);
    }

    // Add new quotes (they'll automatically get _creationTime)
    for (const quote of args.newQuotes) {
      await ctx.db.insert("raceQuotes", {
        quote: quote,
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
    await ctx.db.delete(args.quoteId);
    return true;
  },
});
