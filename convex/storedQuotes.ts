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
    // Idempotent: a double click or a save from both the toolbar and the
    // results screen must not create two rows.
    const existing = await ctx.db
      .query("storedQuotes")
      .withIndex("by_user_id", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("quote"), args.quote))
      .first();
    if (existing) return true;

    await ctx.db.insert("storedQuotes", {
      quote: args.quote,
      userId: identity.subject,
    });
    return true;
  },
});

/** Removes every copy of `quote` from the caller's saved list. */
export const removeQuote = mutation({
  args: {
    quote: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called storedQuotes without authentication present");
    }
    const rows = await ctx.db
      .query("storedQuotes")
      .withIndex("by_user_id", (q) => q.eq("userId", identity.subject))
      .filter((q) => q.eq(q.field("quote"), args.quote))
      .collect();
    for (const row of rows) {
      await ctx.db.delete(row._id);
    }
    return rows.length;
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
