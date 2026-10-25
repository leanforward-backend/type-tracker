#!/usr/bin/env node
/**
 * Sets up Stripe billing through the API instead of the dashboard: the three
 * prices, the webhook endpoint and a Customer Portal configuration, then sets
 * the matching Convex env vars (see convex/stripe.ts).
 *
 *   STRIPE_SECRET_KEY=sk_test_... node scripts/setup-stripe.mjs
 *     [--site-url https://type-tracker.vercel.app]
 *     [--prod --convex-site https://<prod>.convex.site]
 *
 * Without --prod it targets the dev deployment in .env.local and derives the
 * webhook host from VITE_CONVEX_URL. SITE_URL is only set when --site-url is
 * given, so a re-run leaves it (and OTHER_SITE_URLS, set by hand with
 * `npx convex env set`) alone. Safe to re-run: prices are found by
 * lookup key, and the webhook for the same URL is replaced (its signing secret
 * is only shown when it's created).
 */
import { spawnSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { parseArgs } from "node:util";
import Stripe from "stripe";

const { values: opts } = parseArgs({
  options: {
    "site-url": { type: "string" },
    "convex-site": { type: "string" },
    prod: { type: "boolean", default: false },
  },
});

// Keep in step with the display prices in src/components/upgrade/Upgrade.jsx.
const PRICES = [
  { env: "STRIPE_PRICE_MONTHLY", lookup: "type_tracker_pro_monthly", product: "Type Tracker Pro", amount: 400, interval: "month" },
  { env: "STRIPE_PRICE_YEARLY", lookup: "type_tracker_pro_yearly", product: "Type Tracker Pro", amount: 3600, interval: "year" },
  { env: "STRIPE_PRICE_PACK", lookup: "type_tracker_lifetime_pack", product: "Type Tracker Lifetime Pack", amount: 10000 },
];
const CURRENCY = "aud";

// Every event convex/stripe.ts fulfill() handles.
const WEBHOOK_EVENTS = [
  "checkout.session.completed",
  "checkout.session.async_payment_succeeded",
  "customer.subscription.created",
  "customer.subscription.updated",
  "customer.subscription.deleted",
];

const secretKey = process.env.STRIPE_SECRET_KEY;
if (!secretKey?.startsWith("sk_")) {
  console.error("Set STRIPE_SECRET_KEY=sk_test_... (or sk_live_... with --prod).");
  process.exit(1);
}
const live = secretKey.startsWith("sk_live_");
if (live !== opts.prod) {
  console.error(
    opts.prod
      ? "--prod needs a live key (sk_live_...)."
      : "That's a live key; pass --prod to set up production, or use sk_test_... for dev."
  );
  process.exit(1);
}

function convexSite() {
  if (opts["convex-site"]) return opts["convex-site"].replace(/\/$/, "");
  if (opts.prod) {
    console.error("--prod needs --convex-site https://<prod-deployment>.convex.site");
    process.exit(1);
  }
  const match = readFileSync(".env.local", "utf8").match(/^VITE_CONVEX_URL=(\S+)/m);
  if (!match) throw new Error("No VITE_CONVEX_URL in .env.local");
  return match[1].replace(/\.convex\.cloud\/?$/, ".convex.site");
}

const stripe = new Stripe(secretKey);
const env = { STRIPE_SECRET_KEY: secretKey };
if (opts["site-url"]) env.SITE_URL = opts["site-url"].replace(/\/$/, "");

// Prices, reusing any already made by an earlier run.
const existing = await stripe.prices.list({
  lookup_keys: PRICES.map((p) => p.lookup),
  expand: ["data.product"],
});
const products = new Map();
for (const spec of PRICES) {
  let price = existing.data.find((p) => p.lookup_key === spec.lookup);
  if (price) {
    console.log(`Price ${spec.lookup}: reusing ${price.id}`);
  } else {
    let productId = products.get(spec.product);
    if (!productId) {
      const reused = existing.data.find((p) => p.product.name === spec.product);
      productId = reused?.product.id ?? (await stripe.products.create({ name: spec.product })).id;
    }
    price = await stripe.prices.create({
      product: productId,
      currency: CURRENCY,
      unit_amount: spec.amount,
      lookup_key: spec.lookup,
      ...(spec.interval ? { recurring: { interval: spec.interval } } : {}),
    });
    console.log(`Price ${spec.lookup}: created ${price.id}`);
  }
  products.set(spec.product, typeof price.product === "string" ? price.product : price.product.id);
  env[spec.env] = price.id;
}

// Webhook. Stripe only reveals the signing secret on create, so replace ours.
const webhookUrl = `${convexSite()}/stripe/webhook`;
const endpoints = await stripe.webhookEndpoints.list({ limit: 100 });
for (const old of endpoints.data.filter((e) => e.url === webhookUrl)) {
  await stripe.webhookEndpoints.del(old.id);
  console.log(`Webhook: removed old ${old.id}`);
}
const endpoint = await stripe.webhookEndpoints.create({
  url: webhookUrl,
  enabled_events: WEBHOOK_EVENTS,
  description: "Type Tracker (Convex)",
});
console.log(`Webhook: created ${endpoint.id} -> ${webhookUrl}`);
env.STRIPE_WEBHOOK_SECRET = endpoint.secret;

// Customer Portal. Use the dashboard's default if one was ever saved,
// otherwise make one and point createPortal at it.
const defaults = await stripe.billingPortal.configurations.list({ is_default: true, limit: 1 });
if (defaults.data.length) {
  console.log(`Portal: using default ${defaults.data[0].id}`);
} else {
  const proPrices = PRICES.filter((p) => p.interval).map((p) => env[p.env]);
  const config = await stripe.billingPortal.configurations.create({
    features: {
      customer_update: { enabled: true, allowed_updates: ["email", "name", "address"] },
      invoice_history: { enabled: true },
      payment_method_update: { enabled: true },
      subscription_cancel: { enabled: true, mode: "at_period_end" },
      subscription_update: {
        enabled: true,
        default_allowed_updates: ["price"],
        proration_behavior: "create_prorations",
        products: [{ product: products.get("Type Tracker Pro"), prices: proPrices }],
      },
    },
  });
  console.log(`Portal: created ${config.id}`);
  env.STRIPE_PORTAL_CONFIG = config.id;
}

for (const [name, value] of Object.entries(env)) {
  const args = ["convex", "env", "set", name, value, ...(opts.prod ? ["--prod"] : [])];
  const result = spawnSync("npx", args, { stdio: ["ignore", "ignore", "inherit"] });
  if (result.status !== 0) {
    console.error(`Failed to set ${name} on Convex.`);
    process.exit(1);
  }
  console.log(`Convex: set ${name}`);
}
console.log(`\nDone (${live ? "live" : "test"} mode).`);
