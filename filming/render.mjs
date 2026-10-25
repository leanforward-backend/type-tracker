// Turns out/frames + out/frames.json into out/typetracker-demo.mp4.
// Each frame is held until the next one arrived, so the video keeps the real
// timing; paused segments are joined end to end.
// Usage: node render.mjs [fps=60] [output]
import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";

const OUT = new URL("./out/", import.meta.url).pathname;
const fps = Number(process.argv[2] ?? 60);
const output = process.argv[3] ?? path.join(OUT, "typetracker-demo.mp4");
const { frames, segments } = JSON.parse(fs.readFileSync(path.join(OUT, "frames.json"), "utf8"));

const lines = ["ffconcat version 1.0"];
let total = 0;
for (let i = 0; i < frames.length; i++) {
  const f = frames[i];
  const next = frames[i + 1];
  const end = next && next.seg === f.seg ? next.t : segments[f.seg].end;
  const duration = Math.min(Math.max(end - f.t, 1 / fps), 5);
  total += duration;
  lines.push(`file 'frames/${f.file}'`, `duration ${duration.toFixed(6)}`);
}
// The concat demuxer ignores the last duration unless the file is repeated.
lines.push(`file 'frames/${frames.at(-1).file}'`);
fs.writeFileSync(path.join(OUT, "frames.ffconcat"), lines.join("\n"));

const perSecond = frames.length / total;
console.log(`${frames.length} frames, ${total.toFixed(1)}s, ${perSecond.toFixed(1)} captured fps avg`);

execFileSync(
  "ffmpeg",
  [
    "-y", "-loglevel", "error", "-stats",
    "-f", "concat", "-safe", "0", "-i", path.join(OUT, "frames.ffconcat"),
    "-vf",
    `fps=${fps},scale=1920:1080:flags=lanczos:in_range=pc:out_range=tv:in_color_matrix=bt601:out_color_matrix=bt709,format=yuv420p`,
    "-c:v", "libx264", "-preset", "slow", "-crf", "16",
    "-colorspace", "bt709", "-color_primaries", "bt709", "-color_trc", "bt709", "-color_range", "tv",
    "-movflags", "+faststart",
    output,
  ],
  { stdio: "inherit" }
);
console.log(`Wrote ${output}`);
