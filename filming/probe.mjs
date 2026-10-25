// Screenshots the main screens at a given viewport, to check layout before recording.
// Usage: node probe.mjs [width] [height] [scale] [outDir]
import fs from "node:fs";
import path from "node:path";
import { openDemoPage } from "./lib/session.mjs";

const [width = 1280, height = 720, scale = 1.5] = process.argv.slice(2, 5).map(Number);
const outDir = process.argv[5] ?? "out/probe";
fs.mkdirSync(outDir, { recursive: true });
const shot = (page, name) =>
  page.screenshot({ path: path.join(outDir, `${width}x${height}-${name}.png`) });

const { browser, page } = await openDemoPage({ width, height, scale });
page.on("console", (m) => m.type() === "error" && console.log("console:", m.text()));
await page.locator(".typing-area .char").first().waitFor({ timeout: 60_000 });
await page.waitForTimeout(1500);
await shot(page, "1-race");
await page.evaluate(() => window.scrollTo(0, document.body.scrollHeight));
await page.waitForTimeout(500);
await shot(page, "2-race-bottom");
await page.evaluate(() => window.scrollTo(0, 0));
await page.getByRole("button", { name: "Stats" }).click();
await page.waitForTimeout(1500);
await shot(page, "3-stats");
await browser.close();
