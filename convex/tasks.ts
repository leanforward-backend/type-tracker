import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

export const get = query({
  args: { userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    if (args.userId) {
      return await ctx.db
        .query("tasks")
        .filter((q) => q.eq(q.field("userId"), args.userId))
        .collect();
    }
    return await ctx.db.query("tasks").collect();
  },
});

export const create = mutation({
  args: { text: v.string(), userId: v.optional(v.string()) },
  handler: async (ctx, args) => {
    await ctx.db.insert("tasks", {
      text: args.text,
      isCompleted: false,
      userId: args.userId,
    });
  },
});
