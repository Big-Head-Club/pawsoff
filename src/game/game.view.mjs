// PAWS OFF — the screen.
//
// DOM sprites, not canvas. There are never more than about ten animals on the
// stage, and one absolutely-positioned element each, moved with translate3d in a
// single rAF loop, is cheaper than repainting a canvas and comes with hit
// targets, alt text and CSS animation for free.
//
// The one rule that governs everything here: the simulation works in STAGE UNITS
// and the screen scales to it. Positions, speeds and hitboxes are all quoted
// against a 390-unit-wide stage, so a phone and a laptop run the identical run
// and the server can replay either. Nothing in this file measures a pixel and
// puts it in the log.

import {
  COLORS, CONF, LANES, STAGE_W, create, apply, result, schedule,
  isForbidden, step, multiplier,
} from "./game.rules.mjs"
import { mountBackdrop, backdropFor } from "./backdrop.mjs"
import { celebrate, bellUp, thud, fanfare, tick, go, juiceCss, setMuted, isMuted } from "./juice.mjs"

// Markings, as shapes, for the banner chips and the HUD reminder. The sprites
// carry the same six shapes baked into the tint; these are the vector twins.
const MARK_PATHS = {
  dot: "M12 5a7 7 0 1 0 0 14 7 7 0 0 0 0-14z",
  diamond: "M12 3l8 9-8 9-8-9z",
  stripe: "M3 9h18v2.6H3zM3 13.4h18V16H3z",
  triangle: "M12 4l8 15H4z",
  star: "M12 3l2.6 6 6.4.5-4.9 4.2 1.5 6.3L12 16.6 6.4 20l1.5-6.3L3 9.5l6.4-.5z",
  heart: "M12 20S3.8 14.6 3.8 9.4A4.4 4.4 0 0 1 12 7a4.4 4.4 0 0 1 8.2 2.4C20.2 14.6 12 20 12 20z",
}
function markSvg(colorIdx, size) {
  const c = COLORS[colorIdx]
  const ns = "http://www.w3.org/2000/svg"
  const svg = document.createElementNS(ns, "svg")
  svg.setAttribute("viewBox", "0 0 24 24")
  svg.setAttribute("width", size); svg.setAttribute("height", size)
  svg.setAttribute("aria-hidden", "true")
  const p = document.createElementNS(ns, "path")
  p.setAttribute("d", MARK_PATHS[c.mark])
  p.setAttribute("fill", c.hex)
  p.setAttribute("stroke", "var(--rule)")
  p.setAttribute("stroke-width", "1.4")
  p.setAttribute("stroke-linejoin", "round")
  svg.append(p)
  return svg
}

const spriteSrc = (species, pose, colorIdx) =>
  `/art/sprites/${species}-${pose}-${COLORS[colorIdx].key}.png`

const css = `
.po { position:absolute; inset:0; display:flex; flex-direction:column; overflow:hidden; }

.po-hud { position:relative; z-index:3; flex:none; display:flex; flex-direction:column; gap:6px; padding:10px 12px 8px; }
.po-top { display:flex; align-items:center; gap:10px; font-variant-numeric:tabular-nums; }
.po-round { font-family:var(--mono); font-size:12px; letter-spacing:.1em; color:var(--ink-dim); }
.po-hearts { display:flex; gap:3px; }
.po-heart { width:15px; height:15px; }
.po-heart.gone { opacity:.22; }
.po-heart.crack { animation:po-crack .5s ease-out; }
@keyframes po-crack { 0%{transform:scale(1)} 30%{transform:scale(1.5) rotate(-12deg)} 100%{transform:scale(1)} }
.po-combo { font-family:var(--mono); font-size:12px; color:var(--good); min-width:34px; }
.po-score { margin-left:auto; font-family:var(--display); font-size:22px; line-height:1; }
.po-mute { appearance:none; border:0; background:transparent; cursor:pointer; padding:2px 0 2px 8px;
  font-size:15px; line-height:1; opacity:.5; }
.po-mute[aria-pressed="true"] { opacity:1; }

/* THE REMINDER STRIP. Players forget the rule about eight seconds into a round
   — it is a working-memory game and the banner is gone by then — so the two
   forbidden kinds sit in the HUD for the whole round. Without this the game is
   not hard, it is a memory test with a tap minigame attached. */
.po-rule { display:flex; gap:8px; align-items:center; }
.po-chip { display:flex; align-items:center; gap:4px; padding:3px 7px; border-radius:20px;
  background:var(--panel-2); border:1px solid var(--rule-soft); }
.po-chip .no { font-family:var(--mono); font-size:10px; color:var(--ink-dim); }
.po-chip .who { font-size:13px; }

.po-field { position:relative; flex:1; touch-action:none; user-select:none; -webkit-user-select:none;
  cursor:pointer; overflow:hidden; }
.po-a { position:absolute; left:0; top:0; will-change:transform; pointer-events:none;
  image-rendering:auto; transform-origin:50% 50%; z-index:2;
  /* The animals sit ON a decorated backdrop, so they get their own drop shadow
     to lift them off it. A felt toy photographed on a flat screen has no
     contact shadow of its own, and without one it reads as a sticker lying on
     the picture rather than a thing crossing in front of it. */
  filter:drop-shadow(0 3px 4px rgba(0,0,0,.45)); }
.po-a.flip { transform-origin:50% 50%; }
.po-a.pop { animation:po-pop .18s ease-in forwards; }
@keyframes po-pop { 0%{opacity:1} 40%{transform:var(--tf) scale(1.32); opacity:1} 100%{transform:var(--tf) scale(0); opacity:0} }
.po-a.buzz { animation:po-buzz .35s ease-out; }
@keyframes po-buzz {
  0%,100%{filter:drop-shadow(0 3px 4px rgba(0,0,0,.45))}
  40%{filter:drop-shadow(0 3px 4px rgba(0,0,0,.45)) brightness(1.7) saturate(1.6)} }

.po-float { z-index:3; position:absolute; font-family:var(--display); font-size:17px; pointer-events:none;
  animation:po-float .7s ease-out forwards; }
@keyframes po-float { 0%{opacity:1; transform:translateY(0)} 100%{opacity:0; transform:translateY(-30px)} }
.po-bit { z-index:3; position:absolute; width:6px; height:6px; border-radius:2px; pointer-events:none;
  animation:po-bit .55s ease-out forwards; }
@keyframes po-bit { 0%{opacity:1; transform:translate(0,0) scale(1)} 100%{opacity:0; transform:translate(var(--dx),var(--dy)) scale(.3)} }
/* A missed SAFE animal leaves a ghost at the edge it escaped from. Being told
   you lost a life teaches nothing; being shown WHICH one you let walk is the
   only feedback in the game that changes the next round. */
.po-ghost { z-index:2; position:absolute; pointer-events:none; opacity:.85;
  animation:po-ghost 1s ease-out forwards; }
@keyframes po-ghost { 0%{opacity:.9; transform:scale(1)} 100%{opacity:0; transform:scale(1.25)} }

.po-shake { animation:po-shake .25s ease-in-out; }
@keyframes po-shake { 10%,90%{transform:translateX(-3px)} 30%,70%{transform:translateX(5px)} 50%{transform:translateX(-6px)} }
.po-flash { z-index:4; position:absolute; inset:0; pointer-events:none; opacity:0;
  box-shadow:inset 0 0 60px 12px var(--accent); }
.po-flash.on { animation:po-flash .35s ease-out; }
@keyframes po-flash { 0%{opacity:.85} 100%{opacity:0} }

.po-banner { position:absolute; inset:0; z-index:4; display:flex; flex-direction:column;
  align-items:center; justify-content:center; gap:14px; padding:20px;
  background:color-mix(in srgb, var(--ground) 92%, transparent); }
.po-banner .lead { font-family:var(--mono); font-size:11px; letter-spacing:.16em;
  text-transform:uppercase; color:var(--ink-dim); }
.po-banner .r { font-family:var(--display); font-size:clamp(24px,11cqw,40px); line-height:.9; }
/* THE COUNT-IN. The rule cards stay on screen through all of it — the point is
   not a dramatic pause, it is that the two seconds you spend reading the cards
   are not also the two seconds the first animal is already crossing. */
.po-count { font-family:var(--display); line-height:1; font-size:clamp(48px,26cqw,96px);
  color:var(--accent); animation:po-count .46s cubic-bezier(.2,1.4,.4,1); }
.po-count.go { color:var(--good); font-size:clamp(34px,18cqw,64px); }
@keyframes po-count { 0%{transform:scale(2.1); opacity:0} 55%{transform:scale(1); opacity:1} 100%{opacity:1} }
.po-cards { display:flex; gap:12px; }
.po-card { display:flex; flex-direction:column; align-items:center; gap:6px; padding:12px 14px;
  border:var(--rule-w) solid var(--rule); border-radius:var(--radius); background:var(--panel);
  box-shadow:var(--shadow-hard); animation:po-stamp .35s cubic-bezier(.2,1.5,.4,1) backwards; }
.po-card:nth-child(2) { animation-delay:.14s; }
@keyframes po-stamp { 0%{transform:scale(1.9) rotate(-7deg); opacity:0} 100%{transform:scale(1) rotate(0); opacity:1} }
.po-card .no { font-family:var(--display); font-size:15px; color:var(--accent); letter-spacing:.06em; }
.po-card .art { position:relative; width:62px; height:52px; display:grid; place-items:center; }
.po-card .art img { max-width:100%; max-height:100%; }
.po-card .art .fallback { font-size:34px; }
.po-card .say { font-size:12px; color:var(--ink-dim); text-align:center; }

.po-coach { position:absolute; left:0; right:0; bottom:8px; text-align:center; font-size:12px;
  color:var(--ink-dim); padding:0 14px; z-index:3; }
@media (prefers-reduced-motion:reduce) {
  .po-a.pop,.po-float,.po-bit,.po-ghost,.po-shake,.po-flash.on,.po-card { animation-duration:.01ms !important; }
}
`

const HEART = (filled) => {
  const ns = "http://www.w3.org/2000/svg"
  const s = document.createElementNS(ns, "svg")
  s.setAttribute("viewBox", "0 0 24 24"); s.setAttribute("class", "po-heart" + (filled ? "" : " gone"))
  const p = document.createElementNS(ns, "path")
  p.setAttribute("d", MARK_PATHS.heart)
  p.setAttribute("fill", filled ? "var(--accent)" : "none")
  p.setAttribute("stroke", "var(--rule)"); p.setAttribute("stroke-width", "1.8")
  s.append(p); return s
}

export default {
  glyphs: { hit: "\u{1F7E9}", near: "\u{1F7E8}", miss: "⬜", bad: "\u{1F7E5}" },
  how: [
    "Cats and unicorns cross the screen. Tap every one except the two kinds the round tells you to leave alone.",
    "Tapping a forbidden one costs a life. So does letting a safe one walk off. Three lives for the whole run.",
    "The two forbidden kinds change every round, and the strip you share only says how each round went.",
  ],

  mount(root, { seed, mode, coach, finish }) {
    const state = create(seed)
    const log = []

    if (!document.getElementById("po-css")) {
      const s = document.createElement("style"); s.id = "po-css"; s.textContent = css + juiceCss; document.head.append(s)
    }

    const wrap = document.createElement("div"); wrap.className = "po"
    wrap.innerHTML = `
      <div class="po-hud">
        <div class="po-top">
          <span class="po-round"></span>
          <span class="po-hearts"></span>
          <span class="po-combo"></span>
          <span class="po-score">0</span>
          <button class="po-mute" type="button" aria-label="Sound"></button>
        </div>
        <div class="po-rule"></div>
      </div>
      <div class="po-field"><div class="po-flash"></div></div>`
    root.append(wrap)

    const $round = wrap.querySelector(".po-round")
    const $hearts = wrap.querySelector(".po-hearts")
    const $combo = wrap.querySelector(".po-combo")
    const $score = wrap.querySelector(".po-score")
    const $rule = wrap.querySelector(".po-rule")
    const field = wrap.querySelector(".po-field")
    const flash = wrap.querySelector(".po-flash")
    const $mute = wrap.querySelector(".po-mute")

    // Sound is ON by default here, which is only safe because the audio context
    // is never created until a tap creates it — the browser's own gesture rule
    // is satisfied by the game's only input, so there is no autoplay to block
    // and no silent-until-you-find-the-toggle state to explain.
    const MUTE_KEY = "pawsoff.muted"
    setMuted(localStorage.getItem(MUTE_KEY) === "1")
    const drawMute = () => {
      $mute.textContent = isMuted() ? "\u{1F507}" : "\u{1F514}"
      $mute.setAttribute("aria-pressed", String(!isMuted()))
      $mute.setAttribute("aria-label", isMuted() ? "Sound off" : "Sound on")
    }
    $mute.onclick = (e) => {
      e.stopPropagation()
      setMuted(!isMuted())
      try { localStorage.setItem(MUTE_KEY, isMuted() ? "1" : "0") } catch { /* private mode */ }
      drawMute()
    }
    drawMute()

    // One backdrop a day, from the seed, so the chat is looking at the same
    // thing as well as playing the same run. ?bg=<key> overrides it for a look.
    const bgKey = new URLSearchParams(location.search).get("bg") || backdropFor(seed)
    const backdrop = mountBackdrop(field, bgKey)

    // --- live tally --------------------------------------------------------
    // The screen resolves each animal the moment it happens so the HUD is
    // truthful, but it goes through the SAME `step` the server replays with, so
    // the number on screen and the number on the board cannot disagree.
    let acc = { lives: state.lives, combo: state.combo, gained: 0, lost: 0 }
    let taps = []
    let live = []            // { sp, el, x, y, done }
    let phase = "banner"     // banner | playing | interlude | over
    let clock = 0            // ms into the round, pause-aware
    let last = 0
    let raf = 0
    let scale = 1
    let deadEls = []
    let bannerTimers = []

    const sched = () => state.sched
    const laneY = (lane, h) => {
      const top = h * 0.11, span = h * 0.78
      return top + (lane + 0.5) * (span / LANES)
    }

    function drawHud() {
      $round.textContent = "R" + state.round
      $hearts.replaceChildren()
      for (let i = 0; i < CONF.lives; i++) $hearts.append(HEART(i < acc.lives))
      const m = multiplier(acc.combo)
      $combo.textContent = m > 1 ? "x" + m.toFixed(1) : ""
      $score.textContent = (state.score + acc.gained).toLocaleString()
    }

    function drawRule() {
      $rule.replaceChildren()
      for (const sp of ["cat", "unicorn"]) {
        const chip = document.createElement("div"); chip.className = "po-chip"
        const no = document.createElement("span"); no.className = "no"; no.textContent = "NO"
        const who = document.createElement("span"); who.className = "who"
        who.textContent = sp === "cat" ? "\u{1F408}" : "\u{1F984}"
        chip.append(no, who, markSvg(sched().bad[sp], 15))
        chip.setAttribute("aria-label", `no ${COLORS[sched().bad[sp]].name} ${sp}s`)
        $rule.append(chip)
      }
    }

    // --- banner ------------------------------------------------------------
    function showBanner() {
      phase = "banner"
      const b = document.createElement("div"); b.className = "po-banner"
      const lead = document.createElement("div"); lead.className = "lead"; lead.textContent = "this round"
      const r = document.createElement("div"); r.className = "r"; r.textContent = "ROUND " + state.round
      const cards = document.createElement("div"); cards.className = "po-cards"
      for (const spec of ["cat", "unicorn"]) {
        const ci = sched().bad[spec]
        const card = document.createElement("div"); card.className = "po-card"
        const no = document.createElement("div"); no.className = "no"; no.textContent = "PAWS OFF"
        const art = document.createElement("div"); art.className = "art"
        const img = document.createElement("img")
        img.src = spriteSrc(spec, "a", ci); img.alt = ""
        img.onerror = () => {
          const f = document.createElement("span"); f.className = "fallback"
          f.textContent = spec === "cat" ? "\u{1F408}" : "\u{1F984}"
          f.style.color = COLORS[ci].hex
          art.replaceChildren(f, markSvg(ci, 20))
        }
        art.append(img)
        const say = document.createElement("div"); say.className = "say"
        say.append(markSvg(ci, 15))
        say.append(document.createTextNode(" " + COLORS[ci].name + " " + spec + "s"))
        card.append(no, art, say)
        cards.append(card)
      }
      const count = document.createElement("div"); count.className = "po-count"
      b.append(lead, r, cards, count)
      if (coach && state.round === 1) {
        const c = document.createElement("div"); c.className = "po-coach"
        c.textContent = "Tap everything else. Letting a safe one walk off costs a life too."
        b.append(c)
      }
      field.append(b)
      drawRule(); drawHud()

      // Cards land, then 3-2-1, then go. Cancellable: destroy() during a
      // count-in must not fire a startPlay into a torn-down stage.
      const timers = []
      const at = (ms, fn) => timers.push(setTimeout(fn, ms))
      bannerTimers = timers
      const step = CONF.countMs
      for (let i = 3; i >= 1; i--) {
        at(CONF.bannerMs + (3 - i) * step, () => {
          count.classList.remove("go")
          count.textContent = String(i)
          count.style.animation = "none"; void count.offsetWidth; count.style.animation = ""
          tick(i)
        })
      }
      at(CONF.bannerMs + 3 * step, () => {
        count.classList.add("go")
        count.textContent = "GO"
        count.style.animation = "none"; void count.offsetWidth; count.style.animation = ""
        go()
      })
      at(CONF.bannerMs + 3 * step + CONF.goMs, () => { b.remove(); startPlay() })
    }

    // --- play --------------------------------------------------------------
    function startPlay() {
      clock = 0
      last = performance.now()
      taps = []
      live = []
      acc = { lives: acc.lives, combo: acc.combo, gained: 0, lost: 0 }
      // A round must not begin on a screen nobody is looking at. `setTimeout`
      // still fires in a backgrounded tab but rAF does not, so a banner that
      // times out while the tab is hidden would otherwise start a round that
      // cannot advance — and then resume mid-way when the player comes back.
      if (document.hidden) { phase = "paused"; return }
      phase = "playing"
      raf = requestAnimationFrame(tick)
    }

    function makeEl(sp) {
      const el = document.createElement("img")
      el.className = "po-a"
      el.src = spriteSrc(sp.species, sp.i % 2 ? "b" : "a", sp.color)
      el.alt = ""
      el.onerror = () => {
        // Art is allowed to be missing. The game is the same game with
        // rectangles, and the pipeline that makes the sprites runs on its own
        // clock — a build that 404s on a PNG must still be playable.
        const d = document.createElement("div")
        d.className = el.className
        d.style.cssText = el.style.cssText
        d.style.background = COLORS[sp.color].hex
        d.style.borderRadius = sp.species === "cat" ? "34% 34% 26% 26%" : "46% 20% 26% 26%"
        d.style.border = "2px solid rgba(0,0,0,.55)"
        d.dataset.i = String(sp.i)
        el.replaceWith(d)
        const rec = live.find((a) => a.sp.i === sp.i)
        if (rec) rec.el = d
      }
      el.dataset.i = String(sp.i)
      return el
    }

    function tick(now) {
      if (phase !== "playing") return
      const dt = Math.min(64, now - last)   // a backgrounded tab must not
      last = now                            // simulate forty seconds in one frame
      clock += dt

      const h = field.clientHeight, w = field.clientWidth
      scale = w / STAGE_W
      const sw = CONF.spriteW * scale
      const travel = STAGE_W + CONF.spriteW * 2

      for (const sp of sched().spawns) {
        if (clock >= sp.t && !live.some((a) => a.sp.i === sp.i) && !isDone(sp.i)) {
          const el = makeEl(sp)
          field.append(el)
          live.push({ sp, el, x: 0, y: laneY(sp.lane, h) })
        }
      }

      for (const a of live) {
        const dt2 = clock - a.sp.t
        const u = a.sp.dir === 1
          ? -CONF.spriteW + (a.sp.speed * dt2) / 1000
          : STAGE_W + CONF.spriteW - (a.sp.speed * dt2) / 1000
        a.x = u
        const px = u * scale
        const size = (a.sp.species === "unicorn" ? 76 : 68) * scale
        a.el.style.width = size + "px"
        const tf = `translate3d(${px}px, ${a.y - size / 2}px, 0) scaleX(${a.sp.dir === 1 ? 1 : -1})`
        a.el.style.setProperty("--tf", tf)
        a.el.style.transform = tf
        if (dt2 >= a.sp.cross) resolve(a, "exit")
      }
      live = live.filter((a) => !a.done)

      const lastSp = sched().spawns.at(-1)
      if (clock > lastSp.t + lastSp.cross + 60 && live.length === 0) return endRound()
      raf = requestAnimationFrame(tick)
    }

    const doneIds = new Set()
    const isDone = (i) => doneIds.has(i)

    function resolve(a, kind) {
      if (a.done) return
      a.done = true
      doneIds.add(a.sp.i)
      const before = acc.lives
      const out = step(acc, sched(), a.sp, kind)
      if (kind === "tap") taps.push([a.sp.i, Math.round(clock)])

      const size = (a.sp.species === "unicorn" ? 76 : 68) * scale
      const cx = a.x * scale + size / 2, cy = a.y

      if (out === "pop") {
        a.el.classList.add("pop")
        // acc.combo has already been incremented by step(), so the streak that
        // pays for this celebration is the one that just ended in it.
        const streak = acc.combo - 1
        celebrate(field, cx, cy, COLORS[a.sp.color].hex, streak, deadEls)
        bellUp(streak)
        float(cx, cy, "+" + Math.round(CONF.base * multiplier(streak)), "var(--ink)")
        setTimeout(() => a.el.remove(), 200)
      } else if (out === "wrong") {
        a.el.classList.add("buzz")
        hurt(); thud()
        float(cx, cy, "✖", "var(--accent)")
        setTimeout(() => a.el.remove(), 400)
      } else if (out === "held") {
        float(cx, cy, "+" + CONF.restraintBonus, "var(--good)")
        a.el.remove()
      } else {
        // A safe one walked. Show it, frozen, where it left.
        ghost(a, cx, cy, size)
        hurt(); thud()
        a.el.remove()
      }
      if (before !== acc.lives) crackHeart()
      drawHud()
      if (acc.lives <= 0) { acc.lives = 0; return endRound() }
    }

    function ghost(a, cx, cy, size) {
      const g = a.el.cloneNode(true)
      g.className = "po-ghost"
      g.style.width = size + "px"
      const edge = a.sp.dir === 1 ? field.clientWidth - size : 0
      g.style.transform = `translate3d(${edge}px, ${cy - size / 2}px, 0) scaleX(${a.sp.dir === 1 ? 1 : -1})`
      field.append(g)
      deadEls.push(g)
      setTimeout(() => g.remove(), 1000)
    }

    function burst(x, y, hex) {
      for (let i = 0; i < 7; i++) {
        const b = document.createElement("i"); b.className = "po-bit"
        b.style.background = hex
        b.style.left = x + "px"; b.style.top = y + "px"
        const ang = (i / 7) * Math.PI * 2
        b.style.setProperty("--dx", Math.cos(ang) * 34 + "px")
        b.style.setProperty("--dy", Math.sin(ang) * 34 + "px")
        field.append(b); deadEls.push(b)
        setTimeout(() => b.remove(), 560)
      }
    }
    function float(x, y, text, color) {
      const f = document.createElement("div"); f.className = "po-float"
      f.textContent = text; f.style.color = color
      f.style.left = x + "px"; f.style.top = (y - 14) + "px"
      field.append(f); deadEls.push(f)
      setTimeout(() => f.remove(), 720)
    }
    function hurt() {
      wrap.classList.remove("po-shake"); void wrap.offsetWidth; wrap.classList.add("po-shake")
      flash.classList.remove("on"); void flash.offsetWidth; flash.classList.add("on")
      if (navigator.vibrate) { try { navigator.vibrate(80) } catch { /* not permitted */ } }
    }
    function crackHeart() {
      const hs = $hearts.children
      const i = acc.lives
      if (hs[i]) { hs[i].classList.add("crack"); setTimeout(() => hs[i] && hs[i].classList.remove("crack"), 520) }
    }

    // --- input -------------------------------------------------------------
    // pointerdown, not click: click waits out the browser's tap delay, and a
    // game whose whole subject is reaction time cannot spend 300ms deciding
    // whether it was a double tap.
    function onDown(e) {
      if (phase !== "playing") return
      const r = field.getBoundingClientRect()
      const px = e.clientX - r.left, py = e.clientY - r.top
      // A tap outside the box is not a tap.
      if (px < 0 || py < 0 || px > r.width || py > r.height) return
      const pad = CONF.hitPad * scale
      let best = null, bestD = Infinity
      for (const a of live) {
        if (a.done) continue
        const size = (a.sp.species === "unicorn" ? 76 : 68) * scale
        const cx = a.x * scale + size / 2, cy = a.y
        if (Math.abs(px - cx) > size / 2 + pad) continue
        if (Math.abs(py - cy) > size / 2 + pad) continue
        const d = (px - cx) ** 2 + (py - cy) ** 2
        if (d < bestD) { bestD = d; best = a }
      }
      // One animal per tap, nearest centre wins. Fat fingers should not clear a
      // lane, and they should not be punished for landing between two either.
      if (best) resolve(best, "tap")
    }
    field.addEventListener("pointerdown", onDown)

    // --- pause -------------------------------------------------------------
    // Backgrounding mid-round must not eat lives. The clock stops; nothing
    // advances; the round resumes where it was.
    function onVis() {
      if (document.hidden) {
        if (phase === "playing") { cancelAnimationFrame(raf); phase = "paused" }
        backdrop.pause()
      } else if (phase === "paused") {
        phase = "playing"; last = performance.now(); raf = requestAnimationFrame(tick)
        backdrop.resume()
      }
    }
    document.addEventListener("visibilitychange", onVis)

    // --- round end ---------------------------------------------------------
    function endRound() {
      if (phase === "interlude" || phase === "over") return
      cancelAnimationFrame(raf)
      phase = "interlude"
      for (const a of live) { a.el.remove() }
      live = []
      doneIds.clear()

      const move = { r: state.round, taps: taps.slice() }
      log.push(move)
      const roundNo = state.round
      apply(state, move)
      const justPlayed = state.rounds[state.rounds.length - 1]
      if (justPlayed && justPlayed.round === roundNo && justPlayed.clean) fanfare()
      acc = { lives: state.lives, combo: state.combo, gained: 0, lost: 0 }
      drawHud()

      if (state.over) {
        phase = "over"
        setTimeout(() => finish(state, result(state)), 700)
        return
      }
      setTimeout(() => showBanner(), 900)
    }

    drawHud()
    showBanner()

    return {
      get log() { return log },
      destroy() {
        cancelAnimationFrame(raf)
        for (const t of bannerTimers) clearTimeout(t)
        phase = "over"
        field.removeEventListener("pointerdown", onDown)
        document.removeEventListener("visibilitychange", onVis)
        for (const d of deadEls) d.remove()
        backdrop.destroy()
        wrap.remove()
      },
    }
  },
}
