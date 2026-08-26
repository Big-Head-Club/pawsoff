// The animated backdrops.
//
// "Animated" here is a STILL PLATE plus a canvas motion layer, never video. A
// loop long enough not to read as a loop is megabytes; this is one JPEG and a
// few hundred particles, it composes with anything, and it can be re-tinted,
// paused and scrimmed at runtime — none of which a video can do.
//
// The tension worth naming: this is a game about spotting a colour, and a busy
// background is the enemy of that. So every backdrop is built to the same
// shape — loud at the edges, calm through the middle — and the field lays a
// scrim over the band the animals actually cross. The decoration lives where
// the decisions do not.

const rnd = (a, b) => a + Math.random() * (b - a)

// Each backdrop: a fallback sky for before the plate loads (or if it never
// does), and a particle system. `make` builds one particle; `step` moves it.
export const BACKDROPS = {
  "cloud-castle": {
    name: "Cloud Castle",
    sky: ["#ffd9ec", "#c9e6ff"],
    ink: "#7a3d63",
    count: 34,
    make: (w, h) => ({
      x: rnd(-20, w + 20), y: rnd(-h * 0.1, h),
      r: rnd(5, 13), vy: rnd(14, 34), vx: rnd(-9, 9), spin: rnd(-1.6, 1.6), a: rnd(0.35, 0.8),
      hue: ["#ff8fc4", "#fff2a8", "#b6e3ff", "#ffffff"][(Math.random() * 4) | 0], kind: "heart",
    }),
    step: (p, dt, w, h) => {
      p.y += p.vy * dt; p.x += p.vx * dt; p.rot = (p.rot || 0) + p.spin * dt
      if (p.y > h + 24) { p.y = -24; p.x = rnd(-20, w + 20) }
    },
  },
  "candy-meadow": {
    name: "Candy Meadow",
    sky: ["#ffe9a8", "#ffc0dd"],
    ink: "#7a4a1f",
    count: 46,
    make: (w, h) => ({
      x: rnd(0, w), y: rnd(-h, h),
      r: rnd(3, 7), vy: rnd(40, 95), vx: rnd(-16, 16), spin: rnd(-5, 5), a: rnd(0.5, 0.95),
      hue: ["#ff5fa2", "#ffd23f", "#4fd6c9", "#b06bff", "#ffffff"][(Math.random() * 5) | 0], kind: "sprinkle",
    }),
    step: (p, dt, w, h) => {
      p.y += p.vy * dt; p.x += Math.sin((p.y + p.r * 40) / 60) * 16 * dt; p.rot = (p.rot || 0) + p.spin * dt
      if (p.y > h + 12) { p.y = -12; p.x = rnd(0, w) }
    },
  },
  "glitter-space": {
    name: "Glitter Space",
    sky: ["#3b1d6e", "#120a2e"],
    ink: "#ffe9ff",
    count: 60,
    make: (w, h) => ({
      x: rnd(0, w), y: rnd(0, h),
      r: rnd(1.4, 4.2), vy: rnd(-5, 5), vx: rnd(-5, 5), a: rnd(0.25, 1), tw: rnd(1.5, 5), t: rnd(0, 9),
      hue: ["#ffffff", "#ffe27a", "#9fd8ff", "#ff9ff0"][(Math.random() * 4) | 0], kind: "star",
    }),
    step: (p, dt, w, h) => {
      p.t += dt * p.tw; p.x += p.vx * dt; p.y += p.vy * dt
      if (p.x < -6) p.x = w + 6; if (p.x > w + 6) p.x = -6
      if (p.y < -6) p.y = h + 6; if (p.y > h + 6) p.y = -6
    },
  },
  "bubblegum-reef": {
    name: "Bubblegum Reef",
    sky: ["#7ce8dd", "#1d7fa8"],
    ink: "#0b4a5e",
    count: 40,
    make: (w, h) => ({
      x: rnd(0, w), y: rnd(0, h * 1.4),
      r: rnd(3, 11), vy: rnd(-58, -22), vx: 0, a: rnd(0.3, 0.7), t: rnd(0, 9), tw: rnd(1.4, 3.4),
      hue: "#ffffff", kind: "bubble",
    }),
    step: (p, dt, w, h) => {
      p.t += dt * p.tw
      p.y += p.vy * dt; p.x += Math.sin(p.t) * 11 * dt
      if (p.y < -16) { p.y = h + 16; p.x = rnd(0, w) }
    },
  },
  "disco-jungle": {
    name: "Disco Jungle",
    sky: ["#ff4fa8", "#6a2bb8"],
    ink: "#3a0f38",
    count: 38,
    make: (w, h) => ({
      x: rnd(0, w), y: rnd(-h, h),
      r: rnd(3, 8), vy: rnd(30, 78), vx: rnd(-22, 22), spin: rnd(-6, 6), a: rnd(0.55, 1),
      hue: ["#ffe14f", "#4ff0d0", "#ff7ad9", "#ffffff", "#8affa0"][(Math.random() * 5) | 0], kind: "confetti",
    }),
    step: (p, dt, w, h) => {
      p.y += p.vy * dt; p.x += Math.sin((p.y) / 44) * 22 * dt; p.rot = (p.rot || 0) + p.spin * dt
      if (p.y > h + 14) { p.y = -14; p.x = rnd(0, w) }
    },
  },
}

export const KEYS = Object.keys(BACKDROPS)
// One backdrop a day, chosen by the seed, so a group chat is looking at the
// same thing as well as playing the same run.
export const backdropFor = (seed) => KEYS[Math.abs(seed) % KEYS.length]

function drawParticle(ctx, p) {
  ctx.save()
  ctx.globalAlpha = p.a
  ctx.translate(p.x, p.y)
  if (p.rot) ctx.rotate(p.rot)
  ctx.fillStyle = p.hue
  const r = p.r
  if (p.kind === "heart") {
    ctx.beginPath()
    ctx.moveTo(0, r * 0.75)
    ctx.bezierCurveTo(-r * 1.4, -r * 0.3, -r * 0.5, -r * 1.25, 0, -r * 0.45)
    ctx.bezierCurveTo(r * 0.5, -r * 1.25, r * 1.4, -r * 0.3, 0, r * 0.75)
    ctx.fill()
  } else if (p.kind === "star") {
    const tw = 0.55 + 0.45 * Math.abs(Math.sin(p.t))
    ctx.globalAlpha = p.a * tw
    ctx.beginPath()
    for (let i = 0; i < 8; i++) {
      const ang = (i / 8) * Math.PI * 2
      const rad = i % 2 ? r * 0.34 : r * 1.5
      ctx[i ? "lineTo" : "moveTo"](Math.cos(ang) * rad, Math.sin(ang) * rad)
    }
    ctx.closePath(); ctx.fill()
  } else if (p.kind === "bubble") {
    ctx.strokeStyle = p.hue; ctx.lineWidth = 1.6
    ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI * 2); ctx.stroke()
    ctx.globalAlpha = p.a * 0.5
    ctx.beginPath(); ctx.arc(-r * 0.32, -r * 0.32, r * 0.26, 0, Math.PI * 2); ctx.fill()
  } else if (p.kind === "sprinkle") {
    ctx.fillRect(-r * 0.45, -r * 1.6, r * 0.9, r * 3.2)
  } else {
    ctx.fillRect(-r, -r * 0.62, r * 2, r * 1.24)
  }
  ctx.restore()
}

// Mount a backdrop into `host` (which must be positioned). Returns a handle with
// pause/resume/destroy — the game pauses it with the round, so a backgrounded
// tab is not quietly burning a phone battery on falling hearts.
export function mountBackdrop(host, keyName) {
  const conf = BACKDROPS[keyName] || BACKDROPS[KEYS[0]]
  const wrap = document.createElement("div")
  wrap.className = "po-bg"
  wrap.style.cssText = `position:absolute;inset:0;overflow:hidden;pointer-events:none;z-index:0;
    background:linear-gradient(160deg, ${conf.sky[0]}, ${conf.sky[1]});`

  // The plate. If it 404s the gradient underneath is already a complete
  // backdrop, so a missing file costs a texture and never a playable screen.
  const plate = document.createElement("div")
  // Blur, not dimming, is what puts the plate BEHIND the game. A dark wash over
  // a bright candy diorama just turns it brown; a couple of pixels of blur says
  // "this is out of focus, the animals are the thing in focus" and costs the
  // colour nothing. It is the same trick a photographer uses and it is free.
  plate.style.cssText = `position:absolute;inset:-8px;background-size:cover;background-position:center;
    filter:blur(2.5px) saturate(.92);opacity:0;transition:opacity .5s ease;`
  const probe = new Image()
  probe.onload = () => { plate.style.backgroundImage = `url(${probe.src})`; plate.style.opacity = "1" }
  probe.src = `/art/bg/${keyName}.jpg`

  const canvas = document.createElement("canvas")
  canvas.style.cssText = "position:absolute;inset:0;width:100%;height:100%;"

  // THE SCRIM. Loud at the edges, calm through the middle: the band the animals
  // cross gets a wash of the backdrop's own dark ink, so a red cat on a red
  // backdrop is still a red cat. Without this the prettiest backdrop is the one
  // that breaks the game.
  const scrim = document.createElement("div")
  // Light now that the blur is doing the heavy lifting: just enough tint through
  // the band the animals cross to keep a pale sprite off a pale backdrop.
  scrim.style.cssText = `position:absolute;inset:0;background:linear-gradient(
    to bottom,
    color-mix(in srgb, ${conf.ink} 6%, transparent) 0%,
    color-mix(in srgb, ${conf.ink} 26%, transparent) 16%,
    color-mix(in srgb, ${conf.ink} 30%, transparent) 84%,
    color-mix(in srgb, ${conf.ink} 6%, transparent) 100%);`

  wrap.append(plate, canvas, scrim)
  host.prepend(wrap)

  const ctx = canvas.getContext("2d")
  let parts = [], w = 0, h = 0, raf = 0, last = 0, running = false
  const reduced = matchMedia("(prefers-reduced-motion: reduce)").matches

  function size() {
    const dpr = Math.min(2, devicePixelRatio || 1)
    w = host.clientWidth; h = host.clientHeight
    canvas.width = Math.max(1, w * dpr); canvas.height = Math.max(1, h * dpr)
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    parts = Array.from({ length: conf.count }, () => conf.make(w, h))
  }

  function frame(now) {
    if (!running) return
    const dt = Math.min(0.05, (now - last) / 1000)
    last = now
    ctx.clearRect(0, 0, w, h)
    for (const p of parts) {
      if (!reduced) conf.step(p, dt, w, h)
      drawParticle(ctx, p)
    }
    raf = requestAnimationFrame(frame)
  }

  const ro = new ResizeObserver(size)
  ro.observe(host)
  size()

  const api = {
    key: keyName,
    name: conf.name,
    resume() { if (running) return; running = true; last = performance.now(); raf = requestAnimationFrame(frame) },
    pause() { running = false; cancelAnimationFrame(raf) },
    destroy() { api.pause(); ro.disconnect(); wrap.remove() },
  }
  api.resume()
  return api
}
