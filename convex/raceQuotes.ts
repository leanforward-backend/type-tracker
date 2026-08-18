import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

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
  },
  handler: async (ctx, args) => {
    for (const quote of args.quotes) {
      await ctx.db.insert("raceQuotes", {
        quote: quote,
        category: args.category,
      });
    }
    return args.quotes.length;
  },
});

// Rotate quotes: remove oldest quotes in category (or globally), add new ones
export const rotateQuotes = mutation({
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
    await ctx.db.delete(args.quoteId);
    return true;
  },
});
