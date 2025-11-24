import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const createMistakes = mutation({
  args: {
    mistakes: v.boolean(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Not authenticated");
    }
    const userId = identity.subject;

    const existing = await ctx.db
      .query("mistakes")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    if (existing) {
      await ctx.db.patch(existing._id, {
        mistakes: args.mistakes,
      });
    } else {
      await ctx.db.insert("mistakes", {
        userId: userId,
        mistakes: args.mistakes,
      });
    }
  },
});

export const getMistakes = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return null;
    }
    const userId = identity.subject;

    const mistake = await ctx.db
      .query("mistakes")
      .withIndex("by_user_id", (q) => q.eq("userId", userId))
      .first();

    return mistake;
  },
});
