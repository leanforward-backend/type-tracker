// Injected into every page before the app loads (context.addInitScript).
// Everything here lives on <html>, outside <body>, so the camera transform
// applied to <body> never moves the cursor, captions or title cards.
(() => {
  if (window.__demo) return;

  const ease = (t) => (t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2);
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const tween = (ms, step) =>
    new Promise((resolve) => {
      const start = performance.now();
      const frame = (now) => {
        const t = Math.min(1, (now - start) / ms);
        step(ease(t));
        if (t < 1) requestAnimationFrame(frame);
        else resolve();
      };
      requestAnimationFrame(frame);
    });

  const css = `
  #demo-layer { position: fixed; inset: 0; pointer-events: none; z-index: 2147483647;
    font-family: Inter, system-ui, sans-serif; }
  #demo-cursor { position: absolute; left: 0; top: 0; width: 26px; height: 26px;
    opacity: 0; transition: opacity .3s; will-change: transform;
    filter: drop-shadow(0 2px 3px rgba(0,0,0,.45)); }
  #demo-cursor svg { width: 100%; height: 100%; transition: transform .12s ease-out;
    transform-origin: 4px 3px; }
  #demo-cursor.down svg { transform: scale(.82); }
  .demo-ripple { position: absolute; width: 44px; height: 44px; margin: -22px 0 0 -22px;
    border-radius: 50%; border: 2px solid #00f2ff; opacity: .9;
    animation: demo-ripple .55s ease-out forwards; }
  @keyframes demo-ripple { from { transform: scale(.2); } to { transform: scale(1.4); opacity: 0; } }

  #demo-caption { position: absolute; left: 50%; bottom: 40px; transform: translate(-50%, 16px);
    opacity: 0; transition: opacity .45s ease, transform .45s ease;
    display: flex; align-items: center; gap: 12px; padding: 12px 22px 12px 18px;
    border-radius: 999px; background: rgba(18,18,18,.82); backdrop-filter: blur(12px);
    border: 1px solid rgba(255,255,255,.08); box-shadow: 0 10px 40px rgba(0,0,0,.5);
    color: #ededed; font-size: 19px; font-weight: 600; letter-spacing: -.01em; white-space: nowrap; }
  #demo-caption.show { opacity: 1; transform: translate(-50%, 0); }
  #demo-caption .dot { width: 9px; height: 9px; border-radius: 50%;
    background: linear-gradient(135deg, #00f2ff, #7000ff); box-shadow: 0 0 12px #00f2ff; }
  #demo-caption .sub { color: #a1a1a1; font-weight: 500; }

  #demo-card { position: absolute; inset: 0; display: flex; flex-direction: column;
    align-items: center; justify-content: center; gap: 22px; opacity: 0;
    transition: opacity .7s ease; background:
      radial-gradient(60% 50% at 30% 40%, rgba(0,242,255,.10), transparent 70%),
      radial-gradient(50% 50% at 72% 62%, rgba(112,0,255,.14), transparent 70%), #0a0a0a; }
  /* .visible fades the backdrop; .show runs the text entrance. */
  #demo-card.visible { opacity: 1; }
  #demo-card .mark { font-size: 92px; font-weight: 600; letter-spacing: -.035em; line-height: 1; }
  /* background-clip: text only paints inside the span's box, and the tight
     letter-spacing pulls the box in past the "e". Pad it out and pull the
     next word back so spacing is unchanged. */
  #demo-card .mark .a { background: linear-gradient(90deg, #00f2ff, #4aa8ff);
    -webkit-background-clip: text; background-clip: text; color: transparent;
    padding-right: .08em; margin-right: -.08em; }
  #demo-card .mark .b { color: #ededed; }
  #demo-card .line { font-size: 26px; color: #a1a1a1; font-weight: 500; letter-spacing: -.01em; }
  #demo-card .pill { margin-top: 10px; padding: 12px 26px; border-radius: 10px; background: #00f2ff;
    color: #0a0a0a; font-weight: 700; font-size: 19px; box-shadow: 0 0 40px rgba(0,242,255,.35); }
  #demo-card > * { opacity: 0; transform: translateY(14px);
    transition: opacity .8s ease, transform .8s cubic-bezier(.2,.8,.2,1); }
  #demo-card.show > * { opacity: 1; transform: none; }
  #demo-card.show > :nth-child(2) { transition-delay: .25s; }
  #demo-card.show > :nth-child(3) { transition-delay: .5s; }
  `;

  const CURSOR_SVG = `<svg viewBox="0 0 24 24"><path d="M4 2.5v17.2l4.6-4.3 2.9 6.6 3.1-1.4-2.9-6.5h6.4z"
    fill="#fff" stroke="#111" stroke-width="1.4" stroke-linejoin="round"/></svg>`;

  let layer, cursor, caption, card;
  let pos = { x: -50, y: -50 };
  const place = () => (cursor.style.transform = `translate(${pos.x - 4}px, ${pos.y - 3}px)`);

  function mount() {
    if (layer) return;
    const style = document.createElement("style");
    style.textContent = css;
    document.documentElement.appendChild(style);
    layer = document.createElement("div");
    layer.id = "demo-layer";
    layer.innerHTML = `<div id="demo-card"></div><div id="demo-caption"></div>
      <div id="demo-cursor">${CURSOR_SVG}</div>`;
    document.documentElement.appendChild(layer);
    cursor = layer.querySelector("#demo-cursor");
    caption = layer.querySelector("#demo-caption");
    card = layer.querySelector("#demo-card");
    place();
    // Real input from Playwright keeps the drawn cursor honest.
    window.addEventListener("mousemove", (e) => {
      pos = { x: e.clientX, y: e.clientY };
      place();
    }, true);
    window.addEventListener("mousedown", (e) => {
      cursor.classList.add("down");
      const r = document.createElement("div");
      r.className = "demo-ripple";
      r.style.left = `${e.clientX}px`;
      r.style.top = `${e.clientY}px`;
      layer.appendChild(r);
      setTimeout(() => r.remove(), 600);
    }, true);
    window.addEventListener("mouseup", () => cursor.classList.remove("down"), true);
  }
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", mount);
  else mount();

  // Camera: scale and pan <body>, remembering the current transform so a new
  // focus can be computed from where things are now.
  let cam = { s: 1, x: 0, y: 0 };
  const applyCam = (c, ms) => {
    const b = document.body;
    b.style.transformOrigin = "0 0";
    b.style.transition = ms ? `transform ${ms}ms cubic-bezier(.65,0,.35,1)` : "none";
    b.style.transform = c.s === 1 && !c.x && !c.y ? "" : `translate(${c.x}px, ${c.y}px) scale(${c.s})`;
    cam = c;
    return sleep(ms);
  };

  window.__demo = {
    sleep,
    cursor: {
      show: (x, y) => {
        if (x !== undefined) pos = { x, y };
        place();
        cursor.style.opacity = 1;
      },
      hide: () => (cursor.style.opacity = 0),
      pos: () => pos,
      // Eased glide with a slight arc. Playwright sends the real mouse event
      // once it lands, so hover and click land where the cursor is drawn.
      glide: (x, y, ms) => {
        const from = { ...pos };
        const dist = Math.hypot(x - from.x, y - from.y);
        const arc = Math.min(60, dist * 0.12);
        return tween(ms, (t) => {
          pos = {
            x: from.x + (x - from.x) * t,
            y: from.y + (y - from.y) * t - Math.sin(Math.PI * t) * arc,
          };
          place();
        });
      },
    },
    caption: async (text, sub) => {
      caption.classList.remove("show");
      if (!text) return sleep(450);
      if (caption.innerHTML) await sleep(300);
      caption.innerHTML = `<span class="dot"></span><span>${text}</span>${sub ? `<span class="sub">${sub}</span>` : ""}`;
      requestAnimationFrame(() => caption.classList.add("show"));
      return sleep(450);
    },
    // Shows a title card over the page (fading the backdrop in unless the
    // page is already covered), or with no argument fades it away.
    card: async (html) => {
      if (!html) {
        card.classList.remove("visible", "show");
        return sleep(750);
      }
      card.innerHTML = html;
      card.classList.remove("show");
      void card.offsetWidth;
      requestAnimationFrame(() => card.classList.add("visible", "show"));
      return sleep(1300);
    },
    // Instantly cover the page (the first frame of the video).
    cover: () => {
      card.innerHTML = "";
      card.style.transition = "none";
      card.classList.add("visible");
      void card.offsetWidth;
      card.style.transition = "";
    },
    camera: {
      // Zoom so the element fills `fill` of the viewport (capped at maxScale).
      focus: (selector, { fill = 0.85, maxScale = 1.6, ms = 1200, dy = 0 } = {}) => {
        const el = typeof selector === "string" ? document.querySelector(selector) : selector;
        if (!el) throw new Error(`camera.focus: no element ${selector}`);
        const r = el.getBoundingClientRect();
        // Back out the current transform to get layout coordinates.
        const bx = (r.left - cam.x) / cam.s, by = (r.top - cam.y) / cam.s;
        const bw = r.width / cam.s, bh = r.height / cam.s;
        const vw = innerWidth, vh = innerHeight;
        const s = Math.min(maxScale, (vw * fill) / bw, (vh * fill) / bh);
        const cx = bx + bw / 2, cy = by + bh / 2 + dy;
        return applyCam({ s, x: vw / 2 - s * cx, y: vh / 2 - s * cy }, ms);
      },
      reset: (ms = 1000) => applyCam({ s: 1, x: 0, y: 0 }, ms),
      state: () => cam,
    },
    scrollTo: (y, ms = 1200) => {
      const from = scrollY;
      return tween(ms, (t) => scrollTo(0, from + (y - from) * t));
    },
    scrollToElement: (selector, { offset = 80, ms = 1200 } = {}) => {
      const el = document.querySelector(selector);
      const y = scrollY + el.getBoundingClientRect().top - offset;
      return window.__demo.scrollTo(Math.max(0, y), ms);
    },
  };
})();
