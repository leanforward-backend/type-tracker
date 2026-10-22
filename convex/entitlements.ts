import type { UserIdentity } from "convex/server";
import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import {
  internalMutation,
  internalQuery,
  query,
  type MutationCtx,
  type QueryCtx,
} from "./_generated/server";

/**
 * Who gets what. Tiers:
 * - free: FREE_AI_USES lifetime AI uses, the last FREE_HISTORY_LIMIT races,
 *   no new custom topics.
 * - pro: an active Stripe subscription. Full stats, custom topics and
 *   MONTHLY_AI_USES per calendar month.
 * - comped: same as pro, granted by hand (accounts.comped or COMPED_EMAILS).
 * - lifetime: bought the one-off pack. Full stats and custom topics for good,
 *   plus PACK_AI_USES credits that never expire.
 *
 * AI is spent monthly allowance first, then pack credits, then free uses.
 *
 * Quotes: paying users (and admins) draw from the "paid" pools, use each quote
 * up, and refill them with AI (see raceQuotes.ts). Those refills don't spend
 * credits; they have their own daily cap. Everyone else draws from the "free"
 * pools, which they never use up and never refill.
 */
export const FREE_AI_USES = 10;
export const MONTHLY_AI_USES = 300;
export const PACK_AI_USES = 1000;
export const FREE_HISTORY_LIMIT = 30;
export const DAILY_QUOTE_REFILLS = 100;

// past_due keeps access while Stripe retries the card; it ends in "canceled"
// (and a webhook) if every retry fails.
const ACTIVE_STATUSES = new Set(["active", "trialing", "past_due"]);
// A renewal webhook can arrive a little after the period ends.
const RENEWAL_GRACE_MS = 2 * 24 * 60 * 60 * 1000;

export type Tier = "free" | "pro" | "comped" | "lifetime";
export type AiKind = "chat" | "quotes";

const monthKey = (now: number) => new Date(now).toISOString().slice(0, 7);
const dayKey = (now: number) => new Date(now).toISOString().slice(0, 10);

/** A comma-separated list of emails from a Convex env var, lowercased. */
function emailList(name: string): Set<string> {
  return new Set(
    (process.env[name] ?? "")
      .split(",")
      .map((e) => e.trim().toLowerCase())
      .filter(Boolean)
  );
}

type EmailIdentity = Pick<UserIdentity, "email" | "emailVerified">;

/** The identity's email, lowercased, unless Clerk says it's unverified. */
function verifiedEmail(identity: EmailIdentity | null): string | null {
  return identity?.email && identity.emailVerified !== false
    ? identity.email.toLowerCase()
    : null;
}

/**
 * Admins can switch the AI model for themselves (the picker on the Stats
 * page). Set with `npx convex env set ADMIN_EMAILS you@example.com`.
 */
export function isAdmin(identity: EmailIdentity | null): boolean {
  const email = verifiedEmail(identity);
  return email !== null && emailList("ADMIN_EMAILS").has(email);
}

export function computeEntitlements(
  account: Doc<"accounts"> | null,
  identity: EmailIdentity | null,
  now = Date.now()
) {
  const email = verifiedEmail(identity);
  const comped = Boolean(account?.comped) || (email !== null && emailList("COMPED_EMAILS").has(email));
  const subscribed =
    account?.subStatus !== undefined &&
    ACTIVE_STATUSES.has(account.subStatus) &&
    (account.subCurrentPeriodEnd ?? Infinity) + RENEWAL_GRACE_MS > now;

  const tier: Tier = comped
    ? "comped"
    : subscribed
      ? "pro"
      : account?.hasLifetime
        ? "lifetime"
        : "free";
  const paid = tier !== "free";
  const monthly = tier === "pro" || tier === "comped";

  const usedThisMonth =
    account?.aiPeriod === monthKey(now) ? (account.aiPeriodCount ?? 0) : 0;
  const monthlyLeft = monthly ? Math.max(0, MONTHLY_AI_USES - usedThisMonth) : 0;
  const packLeft = Math.max(0, account?.packCredits ?? 0);
  const freeLeft = Math.max(0, FREE_AI_USES - (account?.freeAiUsed ?? 0));

  const quotesToday =
    account?.quoteDay === dayKey(now) ? (account.quoteDayCount ?? 0) : 0;

  return {
    tier,
    fullStats: paid,
    customTopics: paid,
    historyLimit: paid ? null : FREE_HISTORY_LIMIT,
    monthlyLeft,
    packLeft,
    freeLeft,
    aiRemaining: monthlyLeft + packLeft + freeLeft,
    quoteRefillsLeft: Math.max(0, DAILY_QUOTE_REFILLS - quotesToday),
    // Draws from the paid pools: never sees a repeat, and refills them with AI.
    freshQuotes: paid || isAdmin(identity),
    subscribed,
    hasBillingAccount: Boolean(account?.stripeCustomerId),
    isAdmin: isAdmin(identity),
  };
}

export type Entitlements = ReturnType<typeof computeEntitlements>;

export async function accountFor(
  ctx: QueryCtx | MutationCtx,
  userId: string
): Promise<Doc<"accounts"> | null> {
  return await ctx.db
    .query("accounts")
    .withIndex("by_user_id", (q) => q.eq("userId", userId))
    .unique();
}

/** The signed-in user's entitlements, or null when signed out. */
export async function entitlementsFor(ctx: QueryCtx | MutationCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) return null;
  return computeEntitlements(await accountFor(ctx, identity.subject), identity);
}

/** Throws the message the UI shows when a free account tries a paid feature. */
export async function requireFeature(
  ctx: QueryCtx | MutationCtx,
  feature: "fullStats" | "customTopics"
) {
  const ent = await entitlementsFor(ctx);
  if (!ent) throw new Error("Sign in first");
  if (!ent[feature]) {
    throw new Error(
      feature === "customTopics"
        ? "Custom topics are part of Pro. Upgrade to create your own."
        : "Full stats are part of Pro."
    );
  }
  return ent;
}

export const me = query({
  args: {},
  handler: async (ctx) => await entitlementsFor(ctx),
});

// The Gemini proxy (http.ts) runs outside a query, so it passes the identity
// fields it already verified rather than relying on auth propagation.
const identityArgs = {
  userId: v.string(),
  email: v.optional(v.string()),
  emailVerified: v.optional(v.boolean()),
};

export const canUseAi = internalQuery({
  args: { ...identityArgs, kind: v.union(v.literal("chat"), v.literal("quotes")) },
  handler: async (ctx, { userId, email, emailVerified, kind }) => {
    const ent = computeEntitlements(await accountFor(ctx, userId), { email, emailVerified });
    return kind === "chat" ? ent.aiRemaining > 0 : ent.freshQuotes && ent.quoteRefillsLeft > 0;
  },
});

/** Records one successful AI call. Returns false if nothing was left to spend. */
export const recordAiUse = internalMutation({
  args: { ...identityArgs, kind: v.union(v.literal("chat"), v.literal("quotes")) },
  handler: async (ctx, { userId, email, emailVerified, kind }) => {
    const now = Date.now();
    let account = await accountFor(ctx, userId);
    if (!account) {
      const id = await ctx.db.insert("accounts", { userId });
      account = (await ctx.db.get(id))!;
    }
    const ent = computeEntitlements(account, { email, emailVerified }, now);

    if (kind === "quotes") {
      const today = dayKey(now);
      const count = account.quoteDay === today ? (account.quoteDayCount ?? 0) : 0;
      await ctx.db.patch(account._id, { quoteDay: today, quoteDayCount: count + 1 });
      return ent.quoteRefillsLeft > 0;
    }

    if (ent.monthlyLeft > 0) {
      const month = monthKey(now);
      const count = account.aiPeriod === month ? (account.aiPeriodCount ?? 0) : 0;
      await ctx.db.patch(account._id, { aiPeriod: month, aiPeriodCount: count + 1 });
    } else if (ent.packLeft > 0) {
      await ctx.db.patch(account._id, { packCredits: ent.packLeft - 1 });
    } else if (ent.freeLeft > 0) {
      await ctx.db.patch(account._id, { freeAiUsed: (account.freeAiUsed ?? 0) + 1 });
    } else {
      return false;
    }
    return true;
  },
});
