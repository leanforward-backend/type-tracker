import { v } from "convex/values";
import { mutation, query } from "./_generated/server";

const MAX_NAME_LENGTH = 60;
const MAX_PER_USER = 30;

/** The raceQuotes category key a custom category's quotes are stored under. */
const poolKey = (id: string) => `custom:${id}`;

export const getCustomCategories = query({
  args: {},
  handler: async (ctx) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) return [];
    const rows = await ctx.db
      .query("customCategories")
      .withIndex("by_user_id", (q) => q.eq("userId", identity.subject))
      .collect();
    return rows.map((row) => ({ name: row.name, value: poolKey(row._id) }));
  },
});

/** Returns the category key; creating a topic the user already has reuses it. */
export const createCustomCategory = mutation({
  args: {
    name: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Sign in to create a category");
    }
    const name = args.name.trim().replace(/\s+/g, " ");
    if (name.length < 2 || name.length > MAX_NAME_LENGTH) {
      throw new Error(`Category name must be 2 to ${MAX_NAME_LENGTH} characters`);
    }

    const existing = await ctx.db
      .query("customCategories")
      .withIndex("by_user_id", (q) => q.eq("userId", identity.subject))
      .collect();
    const duplicate = existing.find(
      (row) => row.name.toLowerCase() === name.toLowerCase()
    );
    if (duplicate) return poolKey(duplicate._id);
    if (existing.length >= MAX_PER_USER) {
      throw new Error(`You can have at most ${MAX_PER_USER} custom categories`);
    }

    const id = await ctx.db.insert("customCategories", {
      userId: identity.subject,
      name,
    });
    return poolKey(id);
  },
});

/** Deletes the category and every quote in its pool. */
export const deleteCustomCategory = mutation({
  args: {
    value: v.string(),
  },
  handler: async (ctx, args) => {
    const identity = await ctx.auth.getUserIdentity();
    if (!identity) {
      throw new Error("Sign in to delete a category");
    }
    const id = ctx.db.normalizeId(
      "customCategories",
      args.value.replace(/^custom:/, "")
    );
    const row = id && (await ctx.db.get(id));
    if (!row || row.userId !== identity.subject) return false;

    const quotes = await ctx.db
      .query("raceQuotes")
      .withIndex("by_category", (q) => q.eq("category", args.value))
      .collect();
    for (const quote of quotes) {
      await ctx.db.delete(quote._id);
    }
    await ctx.db.delete(row._id);
    return true;
  },
});
