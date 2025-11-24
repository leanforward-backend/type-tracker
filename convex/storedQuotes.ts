import { v } from "convex/values";
import { mutation } from "./_generated/server";

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
