"use node";

import Stripe from "stripe";
import { v } from "convex/values";
import { internal } from "./_generated/api";
import { action, internalAction, type ActionCtx } from "./_generated/server";
import { computeEntitlements } from "./entitlements";

/**
 * Stripe Checkout, the billing portal and the webhook handler. Needs these
 * Convex env vars (`npx convex env set NAME value`):
 *   STRIPE_SECRET_KEY, STRIPE_WEBHOOK_SECRET,
 *   STRIPE_PRICE_MONTHLY, STRIPE_PRICE_YEARLY, STRIPE_PRICE_PACK,
 *   SITE_URL (where Checkout sends the user back to, no trailing slash),
 *   and optionally OTHER_SITE_URLS (see returnUrl) and STRIPE_PORTAL_CONFIG
 *   (a billing portal configuration id).
 * scripts/setup-stripe.mjs creates all of these through the Stripe API.
 */

const PRICE_ENV = {
  monthly: "STRIPE_PRICE_MONTHLY",
  yearly: "STRIPE_PRICE_YEARLY",
  pack: "STRIPE_PRICE_PACK",
} as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set on this Convex deployment.`);
  return value;
}

let client: Stripe | null = null;
function stripe(): Stripe {
  client ??= new Stripe(requireEnv("STRIPE_SECRET_KEY"));
  return client;
}

const trimUrl = (url: string) => url.trim().replace(/\/$/, "");

/**
 * Where Checkout and the portal send people back to: the site they came from
 * (the `origin` the browser passes) when it is SITE_URL or listed in
 * OTHER_SITE_URLS (comma-separated), otherwise SITE_URL. Only listed sites, so
 * a caller can't turn these into redirects to anywhere they like.
 */
function returnUrl(origin: string | undefined): string {
  const site = trimUrl(requireEnv("SITE_URL"));
  const others = (process.env.OTHER_SITE_URLS ?? "").split(",").map(trimUrl).filter(Boolean);
  const wanted = origin && trimUrl(origin);
  return wanted && (wanted === site || others.includes(wanted)) ? wanted : site;
}

async function signedIn(ctx: ActionCtx) {
  const identity = await ctx.auth.getUserIdentity();
  if (!identity) throw new Error("Sign in first.");
  return identity;
}

export const createCheckout = action({
  args: {
    kind: v.union(v.literal("monthly"), v.literal("yearly"), v.literal("pack")),
    origin: v.optional(v.string()),
  },
  handler: async (ctx, { kind, origin }): Promise<string> => {
    const identity = await signedIn(ctx);
    const userId = identity.subject;
    const price = requireEnv(PRICE_ENV[kind]);
    const account = await ctx.runQuery(internal.billing.getAccount, { userId });

    if (kind !== "pack" && computeEntitlements(account, identity).subscribed) {
      throw new Error("You're already subscribed. Use Manage billing to change plans.");
    }

    let customerId = account?.stripeCustomerId;
    if (!customerId) {
      const customer = await stripe().customers.create({
        email: identity.email,
        name: identity.name,
        metadata: { userId },
      });
      customerId = customer.id;
      await ctx.runMutation(internal.billing.setCustomer, { userId, customerId });
    }

    const session = await stripe().checkout.sessions.create({
      customer: customerId,
      mode: kind === "pack" ? "payment" : "subscription",
      line_items: [{ price, quantity: 1 }],
      client_reference_id: userId,
      metadata: { userId, kind },
      ...(kind === "pack" ? {} : { subscription_data: { metadata: { userId } } }),
      allow_promotion_codes: true,
      success_url: `${returnUrl(origin)}/?checkout=success`,
      cancel_url: `${returnUrl(origin)}/?checkout=cancelled`,
    });
    if (!session.url) throw new Error("Stripe didn't return a checkout URL.");
    return session.url;
  },
});

export const createPortal = action({
  args: { origin: v.optional(v.string()) },
  handler: async (ctx, { origin }): Promise<string> => {
    const identity = await signedIn(ctx);
    const account = await ctx.runQuery(internal.billing.getAccount, {
      userId: identity.subject,
    });
    if (!account?.stripeCustomerId) throw new Error("No billing account yet.");
    const session = await stripe().billingPortal.sessions.create({
      customer: account.stripeCustomerId,
      return_url: returnUrl(origin),
      // Set by scripts/setup-stripe.mjs when no dashboard default exists.
      configuration: process.env.STRIPE_PORTAL_CONFIG || undefined,
    });
    return session.url;
  },
});

const idOf = (value: string | { id: string } | null | undefined) =>
  typeof value === "string" ? value : value?.id;

async function syncSubscription(ctx: ActionCtx, subscriptionId: string) {
  const sub = await stripe().subscriptions.retrieve(subscriptionId);
  // Since API version 2025-03-31 the period lives on each item, not the
  // subscription. There is one item (one price) per subscription here.
  const item = sub.items.data[0];
  const periodEnd = item?.current_period_end;
  await ctx.runMutation(internal.billing.setSubscription, {
    userId: sub.metadata?.userId || undefined,
    customerId: idOf(sub.customer)!,
    subscriptionId: sub.id,
    status: sub.status,
    periodEnd: periodEnd ? periodEnd * 1000 : undefined,
    interval: item?.price.recurring?.interval,
  });
}

/** Called by the /stripe/webhook route in http.ts with the raw request body. */
export const fulfill = internalAction({
  args: { payload: v.string(), signature: v.string() },
  handler: async (ctx, { payload, signature }): Promise<{ ok: boolean }> => {
    let event: Stripe.Event;
    try {
      event = await stripe().webhooks.constructEventAsync(
        payload,
        signature,
        requireEnv("STRIPE_WEBHOOK_SECRET")
      );
    } catch (err) {
      console.error("Stripe webhook signature check failed:", err);
      return { ok: false };
    }

    switch (event.type) {
      case "checkout.session.completed":
      case "checkout.session.async_payment_succeeded": {
        const session = event.data.object;
        if (session.mode === "payment" && session.payment_status === "paid") {
          await ctx.runMutation(internal.billing.grantPack, {
            eventId: event.id,
            userId: session.metadata?.userId || session.client_reference_id || undefined,
            customerId: idOf(session.customer),
          });
        } else if (session.mode === "subscription" && session.subscription) {
          await syncSubscription(ctx, idOf(session.subscription)!);
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(ctx, event.data.object.id);
        break;
      default:
        break;
    }
    return { ok: true };
  },
});
