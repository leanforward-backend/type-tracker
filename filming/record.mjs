// Records the TypeTracker demo. Needs the app running at APP_URL
// (default http://localhost:5199) and `node setup-demo.mjs` run once.
// Writes out/frames/*.jpg and out/frames.json; `node render.mjs` makes the MP4.
import { ConvexHttpClient } from "convex/browser";
import fs from "node:fs";
import { api } from "../convex/_generated/api.js";
import { loadEnv } from "./lib/env.mjs";
import { click, glideTo, hover, pause, typeLikeHuman } from "./lib/human.mjs";
import { Recorder } from "./lib/recorder.mjs";
import { convexToken, openDemoPage } from "./lib/session.mjs";

const OUT = new URL("./out/", import.meta.url).pathname;
// Short enough not to truncate in the 240px category picker.
const TOPIC = "Formula 1 racing";
// Most coding quotes run 130-190 characters; about one in six fits this range.
const QUOTE_LENGTH = [100, 140];
// Typing rhythm target. The on-screen result varies by about ±10 with the
// quote. Kept near the top of the seeded history so it reads as a good day.
const WPM = 106;

fs.mkdirSync(OUT, { recursive: true });
const { browser, page } = await openDemoPage();
page.on("pageerror", (e) => console.log("pageerror:", e.message));
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text().slice(0, 300)));
// Leave a screenshot behind when a step fails, then exit non-zero.
process.on("uncaughtException", async (err) => {
  console.error(err);
  await page.screenshot({ path: `${OUT}failure.png` }).catch(() => {});
  await browser.close().catch(() => {});
  process.exit(1);
});
const demo = (fn, arg) => page.evaluate(fn, arg);
const chars = page.locator(".typing-area .char");
const quoteText = () => page.locator(".card .typing-area").first().innerText();

// ---- Off-camera preparation --------------------------------------------
console.log("Preparing...");
{
  // Remove the topic left by a previous run, so it is created fresh on camera.
  const convex = new ConvexHttpClient(loadEnv().VITE_CONVEX_URL);
  convex.setAuth(await convexToken(page));
  const topics = await convex.query(api.customCategories.getCustomCategories, {});
  for (const t of topics.filter((t) => t.name === TOPIC)) {
    await convex.mutation(api.customCategories.deleteCustomCategory, { value: t.value });
  }
}
await chars.first().waitFor({ timeout: 60_000 });
// A quote short enough to keep the race tight.
for (let i = 0; i < 30; i++) {
  const len = (await quoteText()).length;
  if (len >= QUOTE_LENGTH[0] && len <= QUOTE_LENGTH[1]) break;
  await page.getByTitle("Get a new quote or word set").click();
  await pause(page, 400);
  await chars.first().waitFor();
}
const quote = await quoteText();
console.log(`Quote (${quote.length}): ${quote}`);
await page.mouse.move(1020, 640);
await demo(() => {
  window.__demo.cover();
  document.activeElement?.blur();
});
await pause(page, 800);

const rec = new Recorder(page, OUT);
await rec.start();

// ---- 1. Intro ------------------------------------------------------------
await pause(page, 400);
await demo(() =>
  window.__demo.card(`
    <div class="mark"><span class="a">Type</span><span class="b">Tracker</span></div>
    <div class="line">Typing practice that teaches you something.</div>`)
);
await pause(page, 1800);
await demo(() => window.__demo.card(null));

// ---- 2. Race ---------------------------------------------------------------
await demo(() => window.__demo.cursor.show(1020, 640));
await demo(() => window.__demo.caption("Race real quotes from the topics you care about"));
await pause(page, 900);
await click(page, page.locator(".card .typing-area").first(), { dx: -120, after: 150 });
await demo(async () => {
  window.__demo.cursor.hide();
  await window.__demo.camera.focus(".card", { fill: 0.92, maxScale: 1.3, ms: 1100 });
});
await demo(() => window.__demo.caption("Live WPM and accuracy as you type"));
const typoAt = quote.indexOf(" ", Math.floor(quote.length * 0.35)) + 2;
await typeLikeHuman(page, quote, { wpm: WPM, typoAt });

// ---- 3. Results ------------------------------------------------------------
await page.locator(".results").waitFor();
await demo(() => window.__demo.caption("A full breakdown after every race", "burst speed, consistency, pace"));
await demo(() => window.__demo.camera.reset(900));
await demo(() => window.__demo.scrollToElement(".results", { offset: 40, ms: 900 }));
await demo(() => window.__demo.cursor.show());
const chart = page.locator(".chart-svg");
const box = await chart.boundingBox();
await glideTo(page, box.x + box.width * 0.12, box.y + box.height * 0.55, 800);
// Sweep across the chart so the tooltip follows the race.
for (let i = 1; i <= 24; i++) {
  await page.mouse.move(box.x + box.width * (0.12 + (0.76 * i) / 24), box.y + box.height * 0.55);
  await pause(page, 70);
}
await pause(page, 600);
await demo(() => window.__demo.scrollToElement(".results-tiles", { offset: 260, ms: 900 }));
await pause(page, 1400);

// ---- 4. AI analysis -----------------------------------------------------------
await demo(() => window.__demo.caption("Ask AI what the quote actually means"));
const aiButton = page.getByText("Generate AI Analysis");
await demo(() => window.__demo.scrollTo(document.documentElement.scrollHeight, 1000));
await click(page, aiButton, { after: 900 });
// Cut the wait for the first tokens. A busy model shows "Try again"; retry
// off camera rather than failing the take.
await rec.offCamera(async () => {
  const answer = page.getByText("AI Response:");
  const retry = page.getByRole("button", { name: "Try again" });
  for (let attempt = 1; ; attempt++) {
    await answer.or(retry).first().waitFor({ timeout: 90_000 });
    if (await answer.isVisible()) break;
    if (attempt === 3) throw new Error("AI analysis failed three times");
    console.log(`AI analysis failed (attempt ${attempt}), retrying`);
    await retry.click();
  }
  await page.waitForFunction(
    () => (document.querySelector(".chat-messages-container")?.innerText.length ?? 0) > 600,
    null,
    { timeout: 90_000 }
  );
});
await demo(() => window.__demo.cursor.hide());
await demo(() => window.__demo.scrollToElement(".chat-messages-container", { offset: 60, ms: 1000 }));
await pause(page, 2500);
await demo(async () => {
  const box = document.querySelector(".chat-messages-container");
  const from = box.scrollTop;
  const to = Math.min(box.scrollHeight - box.clientHeight, from + 700);
  const start = performance.now();
  await new Promise((done) => {
    const step = (now) => {
      const t = Math.min(1, (now - start) / 2500);
      box.scrollTop = from + (to - from) * (t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2);
      t < 1 ? requestAnimationFrame(step) : done();
    };
    requestAnimationFrame(step);
  });
});
await pause(page, 800);

// ---- 5. Custom topic ------------------------------------------------------
await demo(() => window.__demo.caption("Practice any topic you can think of"));
await demo(() => window.__demo.scrollTo(0, 1100));
await demo(() => window.__demo.cursor.show());
await click(page, page.getByRole("combobox"), { after: 500 });
await page.getByPlaceholder("Search category...").focus();
await typeLikeHuman(page, TOPIC, { wpm: 80 });
await pause(page, 500);
await click(page, page.getByText(`Create "${TOPIC}"`), { after: 700 });
await rec.offCamera(() => chars.first().waitFor({ timeout: 120_000 }), 300);
await demo(() => window.__demo.caption("AI writes fresh quotes for your topic"));
await glideTo(page, 1100, 650, 700);
await demo(async () => {
  window.__demo.cursor.hide();
  await window.__demo.camera.focus(".card", { fill: 0.92, maxScale: 1.3, ms: 1100 });
});
await pause(page, 2600);
await demo(() => window.__demo.camera.reset(900));

// ---- 6. Stats ------------------------------------------------------------------
await demo(() => window.__demo.cursor.show());
await click(page, page.getByRole("button", { name: "Stats" }), { after: 300 });
await demo(() => window.__demo.caption("See your progress and the keys that trip you up"));
await pause(page, 900);
await hover(page, page.locator(".problem-keys"), { ms: 900 });
await pause(page, 900);
await hover(page, page.getByRole("heading", { name: "Problem Words" }), { dy: 120, ms: 800 });
await pause(page, 700);
await demo(() => window.__demo.cursor.hide());
await demo(() => window.__demo.scrollToElement("table", { offset: 140, ms: 1600 }));
await pause(page, 1500);
await demo(() => window.__demo.caption(null));

// ---- 7. Outro ---------------------------------------------------------------
await demo(() =>
  window.__demo.card(`
    <div class="mark"><span class="a">Type</span><span class="b">Tracker</span></div>
    <div class="line">Race. Learn. Improve.</div>
    <div class="pill">Start your first race</div>`)
);
await pause(page, 2000);

await rec.stop(OUT);
await browser.close();
console.log(`Recorded ${rec.frames.length} frames in ${rec.segments.length} segments.`);
