import fs from "node:fs";
import path from "node:path";

/**
 * Records a page through Chrome's screencast at full device resolution.
 * Frames are written as JPEGs with their capture time. pause()/resume()
 * start a new segment, which render.mjs joins with a hard cut, so slow
 * waits (AI generation, network) never reach the video.
 */
export class Recorder {
  constructor(page, outDir, { quality = 92 } = {}) {
    this.page = page;
    this.dir = path.join(outDir, "frames");
    this.quality = quality;
    this.frames = [];
    this.segments = [];
    this.recording = false;
    this.count = 0;
  }

  async start() {
    fs.rmSync(this.dir, { recursive: true, force: true });
    fs.mkdirSync(this.dir, { recursive: true });
    this.cdp = await this.page.context().newCDPSession(this.page);
    this.cdp.on("Page.screencastFrame", ({ data, metadata, sessionId }) => {
      this.cdp.send("Page.screencastFrameAck", { sessionId }).catch(() => {});
      if (!this.recording) return;
      const file = `${String(++this.count).padStart(6, "0")}.jpg`;
      fs.writeFileSync(path.join(this.dir, file), Buffer.from(data, "base64"));
      this.frames.push({ file, t: metadata.timestamp, seg: this.segments.length - 1 });
    });
    const { width, height } = this.page.viewportSize();
    const dpr = await this.page.evaluate(() => devicePixelRatio);
    await this.cdp.send("Page.startScreencast", {
      format: "jpeg",
      quality: this.quality,
      maxWidth: Math.round(width * dpr),
      maxHeight: Math.round(height * dpr),
      everyNthFrame: 1,
    });
    this.resume();
  }

  resume() {
    if (this.recording) return;
    this.segments.push({ start: Date.now() / 1000 });
    this.recording = true;
  }

  pause() {
    if (!this.recording) return;
    this.recording = false;
    this.segments.at(-1).end = Date.now() / 1000;
  }

  /** Runs `fn` with recording paused, then resumes after `settleMs`. */
  async offCamera(fn, settleMs = 150) {
    this.pause();
    try {
      return await fn();
    } finally {
      await this.page.waitForTimeout(settleMs);
      this.resume();
    }
  }

  async stop(outDir) {
    this.pause();
    await this.cdp.send("Page.stopScreencast").catch(() => {});
    const meta = { frames: this.frames, segments: this.segments };
    fs.writeFileSync(path.join(outDir, "frames.json"), JSON.stringify(meta));
    return meta;
  }
}
