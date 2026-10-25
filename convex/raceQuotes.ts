import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  mutation,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";
import { entitlementsFor } from "./entitlements";
import { isTypingFriendly } from "./quoteRules";
import { dedupeQuotes } from "./quoteSimilarity";

/**
 * Quote pools. Every built-in category has two (see `pool` in schema.ts):
 * - paid: drawn by paying users (entitlements.freshQuotes). Each race uses its
 *   quote up, and the client refills the pool with AI when it runs low.
 * - free: drawn by free and signed-out players, who never use quotes up and
 *   never generate. Seeded offline (scripts/seed-free-quotes.mjs) and grown by
 *   the paid quotes once they've been played, up to FREE_POOL_MAX.
 * A custom topic belongs to one user and only has a paid pool. "random" is
 * not a category: reading it returns every built-in category's pool at once.
 */

// Keep in step with src/components/categories/builtInCategories.js.
const BUILT_IN_CATEGORIES = new Set([
  "ai",
  "coding",
  "architecture",
  "math",
  "science",
  "history",
  "geography",
  "art",
  "music",
]);
const RANDOM = "random";
const MAX_BATCH = 25;
const MAX_IMPORT = 100;
const MIN_QUOTE_LENGTH = 20;
const MAX_QUOTE_LENGTH = 500;
const MAX_MODEL_LENGTH = 100;
// Each category's free pool is trimmed back to this daily, oldest first.
const FREE_POOL_MAX = 500;

type Pool = "free" | "paid";

const isCustom = (category: string) => category.startsWith("custom:");

async function poolQuotes(ctx: QueryCtx, category: string, pool: Pool) {
  return await ctx.db
    .query("raceQuotes")
    .withIndex("by_category_pool", (q) => q.eq("category", category).eq("pool", pool))
    .collect();
}

/** A category's pool, or for "random" every built-in category's pool together. */
async function readPool(ctx: QueryCtx, category: string, pool: Pool) {
  if (category !== RANDOM) return await poolQuotes(ctx, category, pool);
  const pools = await Promise.all(
    [...BUILT_IN_CATEGORIES].map((c) => poolQuotes(ctx, c, pool))
  );
  return pools.flat();
}

const toClient = (q: Doc<"raceQuotes">) => ({ id: q._id, quote: q.quote, category: q.category });

/**
 * Whether the caller may write to this category's paid pool: only users who
 * draw from it, and for a custom topic only its owner.
 */
async function canRefill(ctx: MutationCtx, category: string | undefined) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity || !category) return false;
  if (isCustom(category)) {
    const id = ctx.db.normalizeId("customCategories", category.slice("custom:".length));
    const row = id && (await ctx.db.get(id));
    if (!row || row.userId !== identity.subject) return false;
  } else if (!BUILT_IN_CATEGORIES.has(category)) {
    return false;
  }
  const ent = await entitlementsFor(ctx);
  return Boolean(ent?.freshQuotes);
}

/**
 * Inserts the quotes that pass the length and typing rules and aren't a copy
 * or near-copy of anything already in the category, in either pool (see
 * quoteSimilarity.ts). Returns how many went in.
 */
async function insertFresh(
  ctx: MutationCtx,
  category: string,
  pool: Pool,
  quotes: string[],
  model: string | undefined
) {
  const candidates = quotes
    .map((q) => q.trim())
    .filter((q) => q.length >= MIN_QUOTE_LENGTH && q.length <= MAX_QUOTE_LENGTH && isTypingFriendly(q));
  const existing = await ctx.db
    .query("raceQuotes")
    .withIndex("by_category", (q) => q.eq("category", category))
    .collect();
  const fresh = dedupeQuotes(
    candidates,
    existing.map((q) => q.quote)
  );
  const cleanModel = model?.trim().slice(0, MAX_MODEL_LENGTH) || undefined;
  for (const quote of fresh) {
    await ctx.db.insert("raceQuotes", { quote, category, model: cleanModel, pool });
  }
  return fresh.length;
}

/** The paid pool: what a paying user draws from (or a custom topic's quotes). */
export const getAvailableQuotes = query({
  args: {
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.category) return [];
    return (await readPool(ctx, args.category, "paid")).map(toClient);
  },
});

// Only the frontend deployed before the pool split still calls this.
export const getQuoteCount = query({
  args: {
    category: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.category) return 0;
    return (await poolQuotes(ctx, args.category, "paid")).length;
  },
});

/**
 * The free pool, for free and signed-out players. The client fetches it once
 * per category instead of subscribing: it is large, and it changes every time
 * a paying user finishes a race.
 */
export const getFreePool = query({
  args: {
    category: v.string(),
  },
  handler: async (ctx, args) => {
    if (args.category !== RANDOM && !BUILT_IN_CATEGORIES.has(args.category)) return [];
    return (await readPool(ctx, args.category, "free")).map(toClient);
  },
});

export const saveQuotesBatch = mutation({
  args: {
    quotes: v.array(v.string()),
    category: v.optional(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!args.category || !(await canRefill(ctx, args.category))) {
      throw new Error("New AI quotes are part of Pro.");
    }
    if (args.quotes.length > MAX_BATCH) {
      throw new Error(`At most ${MAX_BATCH} quotes per batch`);
    }
    return await insertFresh(ctx, args.category, "paid", args.quotes, args.model);
  },
});

/**
 * Retires the quote a paying user just played. In a built-in category it
 * moves to the free pool, so free players get every quote paying users have
 * been through; a custom topic's quote is deleted. Free and signed-out
 * players never use quotes up, so for them this does nothing.
 */
export const retireQuote = mutation({
  args: {
    quoteId: v.id("raceQuotes"),
  },
  handler: async (ctx, args) => {
    const quote = await ctx.db.get(args.quoteId);
    if (!quote || quote.pool === "free" || !(await canRefill(ctx, quote.category))) {
      return false;
    }
    if (quote.category && !isCustom(quote.category)) {
      await ctx.db.patch(args.quoteId, { pool: "free" });
    } else {
      await ctx.db.delete(args.quoteId);
    }
    return true;
  },
});

// The frontend deployed before the pool split calls it by its old name.
export const deleteQuote = retireQuote;

/** Run daily from crons.ts: drops the oldest free quotes beyond FREE_POOL_MAX. */
export const trimFreePools = internalMutation({
  args: {},
  handler: async (ctx) => {
    let removed = 0;
    for (const category of BUILT_IN_CATEGORIES) {
      const free = await poolQuotes(ctx, category, "free");
      // Index order is oldest first within a category and pool.
      for (const quote of free.slice(0, Math.max(0, free.length - FREE_POOL_MAX))) {
        await ctx.db.delete(quote._id);
        removed++;
      }
    }
    return removed;
  },
});

/**
 * Adds offline-generated quotes to a free pool, through the same rules as AI
 * refills. Called by scripts/seed-free-quotes.mjs via `npx convex run`.
 */
export const importFreeQuotes = internalMutation({
  args: {
    category: v.string(),
    quotes: v.array(v.string()),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    if (!BUILT_IN_CATEGORIES.has(args.category)) {
      throw new Error(`Unknown category: ${args.category}`);
    }
    if (args.quotes.length > MAX_IMPORT) {
      throw new Error(`At most ${MAX_IMPORT} quotes per import`);
    }
    const inserted = await insertFresh(ctx, args.category, "free", args.quotes, args.model);
    const count = (await poolQuotes(ctx, args.category, "free")).length;
    return { inserted, count };
  },
});

/** A free pool's size and newest quotes, so the seed script can ask for new ground. */
export const freePoolForSeeding = internalQuery({
  args: {
    category: v.string(),
  },
  handler: async (ctx, args) => {
    const free = await poolQuotes(ctx, args.category, "free");
    return { count: free.length, recent: free.slice(-60).map((q) => q.quote) };
  },
});

/**
 * Empties a free pool before reseeding it, or with `model` only that model's
 * quotes. Run by hand: `npx convex run raceQuotes:clearFreePool`.
 */
export const clearFreePool = internalMutation({
  args: {
    category: v.string(),
    model: v.optional(v.string()),
  },
  handler: async (ctx, args) => {
    const free = await poolQuotes(ctx, args.category, "free");
    let removed = 0;
    for (const quote of free) {
      if (args.model !== undefined && quote.model !== args.model) continue;
      await ctx.db.delete(quote._id);
      removed++;
    }
    return removed;
  },
});

/** One-off after the pool split: quotes saved before it are paid-pool quotes. */
export const backfillPools = internalMutation({
  args: {},
  handler: async (ctx) => {
    let updated = 0;
    for (const quote of await ctx.db.query("raceQuotes").collect()) {
      if (quote.pool === undefined) {
        await ctx.db.patch(quote._id, { pool: "paid" });
        updated++;
      }
    }
    return updated;
  },
});
