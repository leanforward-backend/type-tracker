import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const saveRace = mutation({
  args: {
    userId: v.optional(v.string()),
    wpm: v.number(),
    accuracy: v.number(),
    date: v.optional(v.string()),
    errors: v.record(v.string(), v.number()),
    missedWords: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    await ctx.db.insert("races", args);
  },
});

export const getHistory = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    return await ctx.db
      .query("races")
      .filter((q) => q.eq(q.field("userId"), args.userId))
      .order("desc")
      .take(50);
  },
});
