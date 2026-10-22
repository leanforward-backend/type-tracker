import { v } from "convex/values";
import { mutation, query } from "./_generated/server";
import { accountFor, computeEntitlements } from "./entitlements";

export const saveRace = mutation({
  args: {
    wpm: v.number(),
    accuracy: v.number(),
    date: v.optional(v.string()),
    errors: v.record(v.string(), v.number()),
    missedWords: v.array(v.string()),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called saveRace without authentication present");
    }
    await ctx.db.insert("races", { ...args, userId: identity.subject });
  },
});

/** Newest first. Free accounts get the most recent FREE_HISTORY_LIMIT races. */
export const getHistory = query({
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      return [];
    }
    const { historyLimit } = computeEntitlements(
      await accountFor(ctx, identity.subject),
      identity
    );
    const races = ctx.db
      .query("races")
      .withIndex("by_user_id", (q) => q.eq("userId", identity.subject))
      .order("desc");
    return historyLimit === null ? await races.collect() : await races.take(historyLimit);
  },
});

export const deleteRace = mutation({
  args: { id: v.id("races") },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Called deleteRace without authentication present");
    }
    const race = await ctx.db.get(args.id);
    if (!race) {
      throw new Error("Race not found");
    }
    if (race.userId !== identity.subject) {
      throw new Error("Unauthorized to delete this race");
    }
    await ctx.db.delete(args.id);
  },
});
