// What happens when you get one right.
//
// Two rules shape all of it:
//
// 1. THE REWARD ESCALATES WITH THE COMBO. A fixed celebration is wallpaper by
//    the thirtieth tap. Tying the size of it to the streak means the screen is
//    telling you something true — how well you are doing — with light and pitch
//    instead of a number you have to read while animals are crossing.
//
// 2. IT NEVER COVERS THE PLAYFIELD. This is a reaction game: a celebration that
//    hides the next animal is a punishment for doing well. Everything here is
//    additive light, short, and it fades from the middle outward.
//
// The bell is synthesised, not a file. Six sounds as audio files is a download
// and a loading state; two oscillators and an envelope is neither, and it can be
// tuned to the combo instead of picked from a list.

// A pentatonic run, so consecutive correct taps play an ASCENDING PHRASE rather
// than the same ding. Getting five in a row should sound like getting five in a
// row. Major pentatonic has no interval that can sound wrong against another,
// which is what lets the notes be chosen by gameplay rather than by a composer.
const SCALE = [0, 2, 4, 7, 9, 12, 14, 16, 19, 21, 24]
const A4 = 440
const noteHz = (semis) => A4 * Math.pow(2, semis / 12)

let ctx = null
let muted = false

export function setMuted(v) { muted = !!v }
export function isMuted() { return muted }

function audio() {
  // Created lazily inside a tap, which is the gesture every browser wants before
  // it will let a page make a sound.
  if (!ctx) {
    const AC = window.AudioContext || window.webkitAudioContext
    if (!AC) return null
    ctx = new AC()
  }
  if (ctx.state === "suspended") ctx.resume()
  return ctx
}

// One bell. Two partials and an exponential decay: the upper partial is what
// makes it read as struck metal rather than as a beep.
function strike(hz, when, gain, decay) {
  const a = audio(); if (!a) return
  const t = when
  const out = a.createGain()
  out.gain.setValueAtTime(0, t)
  out.gain.linearRampToValueAtTime(gain, t + 0.006)
  out.gain.exponentialRampToValueAtTime(0.0001, t + decay)
  out.connect(a.destination)

  for (const [mult, level] of [[1, 1], [2.76, 0.34], [5.4, 0.12]]) {
    const o = a.createOscillator()
    o.type = "sine"
    o.frequency.setValueAtTime(hz * mult, t)
    const g = a.createGain()
    g.gain.setValueAtTime(level, t)
    o.connect(g); g.connect(out)
    o.start(t); o.stop(t + decay + 0.02)
  }
}

// Correct tap. The note climbs the scale with the combo and wraps at the top, so
// a long streak keeps rising instead of running out of notes.
export function bellUp(combo) {
  if (muted) return
  const a = audio(); if (!a) return
  const step = SCALE[combo % SCALE.length]
  const octave = Math.min(2, Math.floor(combo / SCALE.length)) * 12
  const hz = noteHz(step + octave - 9)
  strike(hz, a.currentTime, 0.26, 1.1)
  // Past a real streak the bell gains a fifth above it — the celebration gets
  // harmonically bigger, not just louder.
  if (combo >= 5) strike(hz * 1.5, a.currentTime + 0.045, 0.13, 0.9)
  if (combo >= 10) strike(hz * 2, a.currentTime + 0.09, 0.1, 0.8)
}

// Wrong tap, or a safe one let through. A short detuned thud — deliberately not
// a bell, so the ear can tell good from bad without looking at the hearts.
export function thud() {
  if (muted) return
  const a = audio(); if (!a) return
  const t = a.currentTime
  const o = a.createOscillator(); o.type = "triangle"
  o.frequency.setValueAtTime(190, t)
  o.frequency.exponentialRampToValueAtTime(58, t + 0.34)
  const g = a.createGain()
  g.gain.setValueAtTime(0.0001, t)
  g.gain.linearRampToValueAtTime(0.3, t + 0.01)
  g.gain.exponentialRampToValueAtTime(0.0001, t + 0.38)
  o.connect(g); g.connect(a.destination)
  o.start(t); o.stop(t + 0.4)
}

// A round survived without losing a life: a little arpeggio, played once.
export function fanfare() {
  if (muted) return
  const a = audio(); if (!a) return
  const t = a.currentTime
  ;[0, 4, 7, 12].forEach((s, i) => strike(noteHz(s + 3), t + i * 0.075, 0.2, 1.2))
}

export const juiceCss = `
.po-ring { position:absolute; border-radius:50%; pointer-events:none; z-index:3;
  border-style:solid; transform:translate(-50%,-50%);
  animation:po-ring var(--dur,.62s) cubic-bezier(.15,.7,.3,1) forwards; }
@keyframes po-ring {
  0%   { width:8px; height:8px; opacity:.95; border-width:var(--bw,3px); }
  100% { width:var(--to,150px); height:var(--to,150px); opacity:0; border-width:1px; }
}
.po-spark { position:absolute; pointer-events:none; z-index:3; width:var(--s,9px); height:var(--s,9px);
  transform:translate(-50%,-50%); animation:po-spark .6s ease-out forwards; }
@keyframes po-spark {
  0%   { opacity:1; transform:translate(-50%,-50%) translate(0,0) rotate(0deg) scale(1); }
  100% { opacity:0; transform:translate(-50%,-50%) translate(var(--dx),var(--dy)) rotate(var(--rot)) scale(.2); }
}
/* The big one. A single wash of the animal's colour over the whole field, very
   brief and very transparent — the screen agreeing with you, without hiding
   anything that is crossing it. */
.po-wash { position:absolute; inset:0; pointer-events:none; z-index:3; opacity:0;
  animation:po-wash .42s ease-out forwards; }
@keyframes po-wash { 0%{opacity:.34} 100%{opacity:0} }
@media (prefers-reduced-motion:reduce) {
  .po-ring,.po-spark,.po-wash { animation-duration:.01ms !important; }
}
`

const STAR = "polygon(50% 0%,61% 35%,98% 35%,68% 57%,79% 91%,50% 70%,21% 91%,32% 57%,2% 35%,39% 35%)"

// The visual half. `tier` rises with the combo and everything scales off it.
export function celebrate(field, x, y, hex, combo, keep) {
  const tier = combo >= 15 ? 3 : combo >= 10 ? 2 : combo >= 5 ? 1 : 0
  const add = (el, life) => { field.append(el); keep.push(el); setTimeout(() => el.remove(), life) }

  // Rings. One more ring per tier, each launched a beat after the last, so a big
  // combo reads as a pulse rather than a single flash.
  const rings = 1 + tier
  for (let i = 0; i < rings; i++) {
    const r = document.createElement("div")
    r.className = "po-ring"
    r.style.left = x + "px"; r.style.top = y + "px"
    r.style.borderColor = hex
    r.style.setProperty("--to", (110 + tier * 55 + i * 46) + "px")
    r.style.setProperty("--bw", (3 + tier) + "px")
    r.style.setProperty("--dur", (0.55 + i * 0.12) + "s")
    r.style.animationDelay = (i * 0.075) + "s"
    add(r, 1100 + i * 140)
  }

  // Sparks fly outward. Stars at the top tiers, plain chips below — the shape
  // change is what makes tier 2 feel different from tier 1 rather than just
  // more numerous.
  const n = 8 + tier * 7
  for (let i = 0; i < n; i++) {
    const s = document.createElement("i")
    s.className = "po-spark"
    const ang = (i / n) * Math.PI * 2 + Math.random() * 0.5
    const dist = 34 + tier * 22 + Math.random() * 26
    s.style.left = x + "px"; s.style.top = y + "px"
    s.style.background = tier >= 2 && i % 3 === 0 ? "#fff" : hex
    s.style.setProperty("--dx", Math.cos(ang) * dist + "px")
    s.style.setProperty("--dy", Math.sin(ang) * dist + "px")
    s.style.setProperty("--rot", Math.round(Math.random() * 720 - 360) + "deg")
    s.style.setProperty("--s", (6 + Math.random() * (5 + tier * 4)) + "px")
    if (tier >= 1 && i % 2 === 0) { s.style.clipPath = STAR }
    else s.style.borderRadius = "2px"
    add(s, 640)
  }

  if (tier >= 3) {
    const wash = document.createElement("div")
    wash.className = "po-wash"
    wash.style.background = `radial-gradient(circle at ${x}px ${y}px, ${hex}, transparent 62%)`
    add(wash, 460)
  }
  return tier
}
