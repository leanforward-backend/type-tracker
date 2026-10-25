import { clerk, clerkSetup, setupClerkTestingToken } from "@clerk/testing/playwright";
import { chromium } from "@playwright/test";
import { DEMO_EMAIL, loadEnv } from "./env.mjs";

export const APP_URL = process.env.APP_URL ?? "http://localhost:5199";

/**
 * A headless Chrome page signed in as the demo user.
 * The viewport is in CSS pixels; `scale` sets the device pixel ratio, so
 * 1280x720 at 1.5 renders 1920x1080 frames with a slightly larger UI.
 */
export async function openDemoPage({ width = 1280, height = 720, scale = 1.5 } = {}) {
  const env = loadEnv();
  process.env.CLERK_PUBLISHABLE_KEY = env.VITE_CLERK_PUBLISHABLE_KEY;
  process.env.CLERK_SECRET_KEY = env.CLERK_SECRET_KEY;
  await clerkSetup();

  const browser = await chromium.launch({
    executablePath: process.env.CHROME ?? "/usr/bin/google-chrome-stable",
    headless: true,
    args: ["--hide-scrollbars", "--force-color-profile=srgb", "--autoplay-policy=no-user-gesture-required"],
  });
  const context = await browser.newContext({
    viewport: { width, height },
    deviceScaleFactor: scale,
    colorScheme: "dark",
    reducedMotion: "no-preference",
  });
  await context.addInitScript({ path: new URL("./overlay.js", import.meta.url).pathname });
  const page = await context.newPage();
  await setupClerkTestingToken({ page });
  await page.goto(APP_URL);
  await clerk.loaded({ page });
  await clerk.signIn({ page, emailAddress: DEMO_EMAIL });
  await page.goto(APP_URL);
  await clerk.loaded({ page });
  // Signed in once the Convex-backed header controls render.
  await page.getByRole("button", { name: "Plan" }).waitFor({ timeout: 30_000 });
  return { browser, context, page };
}

/** A Convex auth token for the signed-in page, for setup calls from Node. */
export async function convexToken(page) {
  return page.evaluate(() => window.Clerk.session.getToken({ template: "convex" }));
}
