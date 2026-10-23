// Human-looking input: an eased cursor glide before every click, and typing
// with a natural rhythm instead of Playwright's fixed delay.

const gaussian = () => {
  let u = 0, v = 0;
  while (!u) u = Math.random();
  while (!v) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
};

export const pause = (page, ms) => page.waitForTimeout(ms);

/** Glides the drawn cursor to (x, y), then moves the real mouse there. */
export async function glideTo(page, x, y, ms) {
  const from = await page.evaluate(() => window.__demo.cursor.pos());
  const dist = Math.hypot(x - from.x, y - from.y);
  const duration = ms ?? Math.round(Math.min(1100, Math.max(450, 350 + dist * 0.9)));
  await page.evaluate(([x, y, d]) => window.__demo.cursor.glide(x, y, d), [x, y, duration]);
  await page.mouse.move(x, y);
}

async function centerOf(locator, { dx = 0, dy = 0 } = {}) {
  await locator.waitFor({ state: "visible" });
  const box = await locator.boundingBox();
  return { x: box.x + box.width / 2 + dx, y: box.y + box.height / 2 + dy };
}

export async function hover(page, locator, opts) {
  const { x, y } = await centerOf(locator, opts);
  await glideTo(page, x, y, opts?.ms);
}

export async function click(page, locator, opts = {}) {
  await hover(page, locator, opts);
  await pause(page, 140);
  await page.mouse.down();
  await pause(page, 90);
  await page.mouse.up();
  await pause(page, opts.after ?? 250);
}

const NEIGHBOURS = {
  a: "s", b: "v", c: "x", d: "s", e: "r", f: "g", g: "f", h: "j", i: "o", j: "k",
  k: "l", l: "k", m: "n", n: "m", o: "p", p: "o", q: "w", r: "t", s: "a", t: "r",
  u: "y", v: "b", w: "e", x: "z", y: "t", z: "x",
};

/**
 * Types `text` at roughly `wpm`, with longer gaps after spaces and punctuation.
 * `typoAt` is a character index where one wrong key is hit and corrected.
 */
export async function typeLikeHuman(page, text, { wpm = 100, typoAt = -1 } = {}) {
  const base = 60000 / (wpm * 5);
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (i === typoAt && NEIGHBOURS[ch.toLowerCase()]) {
      await page.keyboard.type(NEIGHBOURS[ch.toLowerCase()]);
      await pause(page, base * 2.2);
      await pause(page, 260);
      await page.keyboard.press("Backspace");
      await pause(page, base * 1.6);
    }
    await page.keyboard.type(ch);
    let gap = base * (0.85 + 0.22 * gaussian());
    if (ch === " " && Math.random() < 0.18) gap += base * 1.2;
    if (/[.,;:!?)]/.test(ch)) gap += base * 1.5;
    if (/[A-Z({[]/.test(text[i + 1] ?? "")) gap += base * 0.8;
    await pause(page, Math.max(35, gap));
  }
}
