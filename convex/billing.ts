import { v } from "convex/values";
import { internalMutation, internalQuery } from "./_generated/server";
import { accountFor, PACK_AI_USES } from "./entitlements";

/**
 * Database side of Stripe billing. stripe.ts runs in Node (the Stripe SDK
 * needs it) and Node files can only hold actions, so the reads and writes it
 * needs live here.
 */

export const getAccount = internalQuery({
  args: { userId: v.string() },
  handler: async (ctx, { userId }) => await accountFor(ctx, userId),
});

export const setCustomer = internalMutation({
  args: { userId: v.string(), customerId: v.string() },
  handler: async (ctx, { userId, customerId }) => {
    const account = await accountFor(ctx, userId);
    if (account) {
      await ctx.db.patch(account._id, { stripeCustomerId: customerId });
    } else {
      await ctx.db.insert("accounts", { userId, stripeCustomerId: customerId });
    }
  },
});

/** The account a Stripe customer belongs to, preferring the id in metadata. */
async function findAccount(
  ctx: Parameters<typeof accountFor>[0],
  userId: string | undefined,
  customerId: string | undefined
) {
  if (userId) {
    const byUser = await accountFor(ctx, userId);
    if (byUser) return byUser;
  }
  if (customerId) {
    return await ctx.db
      .query("accounts")
      .withIndex("by_stripe_customer", (q) => q.eq("stripeCustomerId", customerId))
      .first();
  }
  return null;
}

/** Applies a paid pack checkout once per Stripe event. */
export const grantPack = internalMutation({
  args: {
    eventId: v.string(),
    userId: v.optional(v.string()),
    customerId: v.optional(v.string()),
  },
  handler: async (ctx, { eventId, userId, customerId }) => {
    const seen = await ctx.db
      .query("stripeEvents")
      .withIndex("by_event_id", (q) => q.eq("eventId", eventId))
      .first();
    if (seen) return;

    const account = await findAccount(ctx, userId, customerId);
    if (account) {
      await ctx.db.patch(account._id, {
        hasLifetime: true,
        packCredits: (account.packCredits ?? 0) + PACK_AI_USES,
        stripeCustomerId: account.stripeCustomerId ?? customerId,
      });
    } else if (userId) {
      await ctx.db.insert("accounts", {
        userId,
        stripeCustomerId: customerId,
        hasLifetime: true,
        packCredits: PACK_AI_USES,
      });
    } else {
      throw new Error(`Pack paid in ${eventId} but no user to credit`);
    }
    await ctx.db.insert("stripeEvents", { eventId });
  },
});

/**
 * Mirrors a subscription's current state. Callers fetch the subscription fresh
 * from Stripe first, so out-of-order webhooks can't roll the state back.
 */
export const setSubscription = internalMutation({
  args: {
    userId: v.optional(v.string()),
    customerId: v.string(),
    subscriptionId: v.string(),
    status: v.string(),
    periodEnd: v.optional(v.number()),
  },
  handler: async (ctx, { userId, customerId, subscriptionId, status, periodEnd }) => {
    const account = await findAccount(ctx, userId, customerId);
    const fields = {
      stripeCustomerId: customerId,
      subscriptionId,
      subStatus: status,
      subCurrentPeriodEnd: periodEnd,
    };
    if (account) {
      // A customer with an old dead subscription and a new live one gets
      // events for both; never let the dead one overwrite the live one.
      if (
        account.subscriptionId &&
        account.subscriptionId !== subscriptionId &&
        !["active", "trialing", "past_due"].includes(status)
      ) {
        return;
      }
      await ctx.db.patch(account._id, fields);
    } else if (userId) {
      await ctx.db.insert("accounts", { userId, ...fields });
    } else {
      throw new Error(`No account for Stripe customer ${customerId}`);
    }
  },
});
