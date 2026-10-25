# Demo video

Records a ~70 second 1080p60 product demo of TypeTracker with headless Chrome.
The script drives the real app as a seeded demo user. It adds a drawn cursor,
captions, title cards and camera zooms in the page, and cuts out AI wait times.

## Run it

```sh
# terminal 1: the app (dev deployment, from the repo root)
npx vite --port 5199 --strictPort

# terminal 2
cd filming
npm install          # first time only; no browser download, it uses google-chrome-stable
npm run film         # reseed demo user, record, render
```

The video lands in `out/typetracker-demo.mp4`. To re-render without re-recording,
run `npm run render` (pass a frame rate, e.g. `node render.mjs 30`).
Set `APP_URL` to record a different deployment, and `CHROME` for another browser binary.

## What it touches

Everything runs against the **dev** Clerk and Convex instances in `../.env.local`.

- **Clerk user** `alex.demo+clerk_test@typetracker.dev` (username `alexdemo`).
  `setup-demo.mjs` creates it if missing.
- **Convex env `COMPED_EMAILS`** includes that address, so the demo shows Pro
  features (custom topics, fresh AI quotes). The script warns if it's missing.
- **Race history** for the demo user is deleted and reseeded with 33 races over
  three weeks before every take. The numbers are invented for the demo.
- **Quote pools.** Picking a short opening quote clicks "new quote" a few times,
  which retires those quotes from the coding pool. Each take also creates a
  "Formula 1 racing" topic (the previous one is deleted first), which spends
  one AI quote generation.

## Files

- `record.mjs`: the storyboard. Scene timings, captions and the topic live here.
- `lib/overlay.js`: in-page cursor, captions, title cards, camera and smooth scroll.
- `lib/recorder.mjs`: Chrome screencast to JPEG frames, with off-camera pauses.
- `lib/human.mjs`: eased cursor glides and natural typing rhythm with one typo.
- `render.mjs`: frames to H.264 MP4 at constant frame rate, keeping real timing.
- `probe.mjs`: screenshots of the main screens at a given viewport, for layout checks.

## Known limits

- No audio. Add music or a voiceover in an editor.
- The AI answer and the custom-topic quote differ every take. If Gemini is busy,
  the script retries off camera up to three times.
