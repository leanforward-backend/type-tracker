import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const saveQuote = mutation({
  args: {
    quote: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storedQuotes without authentication present");
    }
    await ctx.db.insert("storedQuotes", {
      quote: args.quote,
      userId: identity.subject,
    });
    return true;
  },
});

export const getStoredQuotes = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storedQuotes without authentication present");
    }

    const storedQuotes = await ctx.db
      .query("storedQuotes")
      .withIndex("by_user_id", (q) => q.eq("userId", identity.subject))
      .order("desc")
      .collect();
    return storedQuotes;
  },
});
