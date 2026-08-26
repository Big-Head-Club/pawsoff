// PAWS OFF — rules. PURE: no DOM, no clock, no Math.random.
//
// The whole run is a function of the seed plus a list of taps. The server
// imports this file and replays the log; the score it computes is the score
// that goes on the board. Nothing the client claims about the score is used.
//
// A round is resolved as one move: `{ r, taps: [[spawnIndex, ms], ...] }`. That
// keeps the log tiny and makes the resolution — which animals were tapped, which
// escaped, in what order — a single deterministic pass over a sorted event list.
//
// Timing is a client CLAIM, but it is a constrained one: a tap only counts if
// the animal was actually on screen at that moment, each animal takes at most
// one tap, and taps closer together than a thumb can move are dropped. Those
// three rules run identically here and on the server.

import { makeRng } from "../core/rng.mjs"

// --- the six colours ---------------------------------------------------------
// Colour is never the only signal. Every colour carries a marking, and the strip
// and the banner both lead with the marking. A player with no colour perception
// at all plays this game on shape.
export const COLORS = [
  { key: "red",    hex: "#EF4444", mark: "star",     name: "star"     },
  { key: "blue",   hex: "#3B82F6", mark: "dot",      name: "dot"      },
  { key: "green",  hex: "#22C55E", mark: "triangle", name: "triangle" },
  { key: "yellow", hex: "#EAB308", mark: "stripe",   name: "stripe"   },
  { key: "purple", hex: "#A855F7", mark: "heart",    name: "heart"    },
  { key: "pink",   hex: "#EC4899", mark: "diamond",  name: "diamond"  },
]
export const SPECIES = ["cat", "unicorn"]
export const LIVES = 3
export const LANES = 7

// The playfield is a fixed 10:16 stage, so "how wide is the screen" is not a
// player-dependent quantity and speeds can be quoted in stage units per second.
// STAGE_W is the crossing distance the simulation uses; the view scales to it.
export const STAGE_W = 390

// Every number that tunes the game lives here. See ASSUMPTIONS.md: only `speed`,
// `interval`, `colors` and `badShare` are independent. Concurrency is DERIVED
// (crossMs / interval) and is not a dial, whatever a spec says.
export const CONF = {
  lives: LIVES,
  bannerMs: 900,          // cards stamp down
  countMs: 480,           // then 3, 2, 1
  goMs: 320,              // then GO, then the animals
  spriteW: 72,
  hitPad: 12,
  minTapGapMs: 55,        // thumb floor: taps closer than this are the same tap
  restraintBonus: 5,
  cleanRoundBonus: 25,
  base: 10,
  comboStep: 5,
  comboCap: 3,
  burstMs: 300,
}

// Round r (1-based) → the shape of that round. One continuous function, no
// stitched-together branches: the first version of this had an `r <= 7` arm and
// an `r >= 8` arm, and round 8 came out EASIER than round 7 at the seam.
//
// Speed is the reaction budget and it caps, because past about 300 the sprite
// is a smear and the game stops being about inhibition. What does NOT cap is
// the interval: once speed is at the ceiling the rounds keep getting denser, so
// the curve climbs past wherever anyone actually dies. Never plateau.
export function roundConf(r) {
  const colors = Math.min(6, 3 + Math.floor((r - 1) / 2))
  const spawns = Math.min(36, 6 + 2 * r)
  const speedLo = Math.min(230, 80 + 12 * r)
  const speedHi = Math.min(300, speedLo + 30 + 6 * r)
  // Geometric, so it is still falling at round 20. A linear interval with a
  // floor flattens the whole late game into one repeated round.
  const interval = Math.max(110, Math.round(1500 * Math.pow(0.88, r)))
  const bursts = r < 6 ? 0 : Math.min(3, 1 + Math.floor((r - 6) / 2))
  // More of the field is forbidden late: the thing that gets hard is holding
  // back, not seeing. Caps below half, or the honest move becomes "tap nothing".
  const badShare = Math.min(0.45, 0.3 + 0.012 * Math.max(0, r - 6))
  return { colors, spawns, speedLo, speedHi, interval, bursts, badShare }
}

// How long an animal is on screen, in ms — the player's whole reaction budget.
export const crossMs = (speed) => Math.round(((STAGE_W + CONF.spriteW * 2) / speed) * 1000)

// --- the schedule ------------------------------------------------------------
// Deterministic from (seed, round). Derivable for any round independently, so a
// replay never has to walk the rounds it does not care about.
export function schedule(seed, r, prevBad) {
  const rng = makeRng((seed ^ (r * 0x9e3779b1)) >>> 0)
  const c = roundConf(r)

  // Which colours are in play this round, and which two are forbidden.
  const pool = rng.sample(COLORS.map((_, i) => i), c.colors)
  const pickBad = (species) => {
    const banned = prevBad ? prevBad[species] : -1        // never the same twice running
    const legal = pool.filter((i) => i !== banned)
    return rng.pick(legal.length ? legal : pool)
  }
  let badCat = pickBad("cat")
  let badUni = pickBad("unicorn")
  // Rounds 1-2 keep the two rules distinct: the first thing a player learns is
  // that there are two rules, and that is invisible if both say the same colour.
  if (r <= 2 && badUni === badCat) {
    // Re-picking here has to keep honouring the no-repeat rule it just
    // satisfied, or round 2 quietly hands back round 1's unicorn colour and the
    // banner stops being worth reading on the one round it is being taught.
    const prevUni = prevBad ? prevBad.unicorn : -1
    const other = pool.filter((i) => i !== badCat && i !== prevUni)
    if (other.length) badUni = rng.pick(other)
    else {
      const any = pool.filter((i) => i !== badCat)
      if (any.length) badUni = rng.pick(any)
    }
  }
  const bad = { cat: badCat, unicorn: badUni }

  // Species split, then colours: 30% of each species' spawns are forbidden, with
  // a floor so a round always has something to hold back from.
  const catCount = Math.round(c.spawns * rng.float(0.4, 0.6))
  const counts = { cat: catCount, unicorn: c.spawns - catCount }

  const kinds = []
  for (const sp of SPECIES) {
    const n = counts[sp]
    const badN = Math.min(n, Math.max(n < 2 ? 1 : 2, Math.round(n * c.badShare)))
    const others = pool.filter((i) => i !== bad[sp])
    for (let i = 0; i < n; i++) {
      kinds.push({ species: sp, color: i < badN ? bad[sp] : (others.length ? rng.pick(others) : bad[sp]) })
    }
  }
  const order = rng.shuffle(kinds)

  // Times: a metronome with jitter, plus bursts that collapse three spawns into
  // one 300ms window. Bursts are in the schedule, never rolled at runtime.
  const burstAt = new Set()
  for (let b = 0; b < c.bursts; b++) {
    const at = rng.int(2, Math.max(2, order.length - 4))
    burstAt.add(at)
  }

  const spawns = []
  let t = 600
  let lastLane = -9
  for (let i = 0; i < order.length; i++) {
    const inBurst = burstAt.has(i) || burstAt.has(i - 1) || burstAt.has(i - 2)
    const gap = burstAt.has(i - 1) || burstAt.has(i - 2)
      ? Math.round(CONF.burstMs / 2)
      : Math.round(c.interval * rng.float(0.7, 1.3))
    if (i > 0) t += gap
    // Adjacent lanes inside a burst, spread out otherwise — a burst you cannot
    // physically reach is not difficulty, it is a tax.
    let lane
    if (inBurst && lastLane >= 0) lane = Math.max(0, Math.min(LANES - 1, lastLane + rng.int(-1, 1)))
    else lane = rng.int(0, LANES - 1)
    lastLane = lane
    const speed = Math.round(rng.float(c.speedLo, c.speedHi))
    spawns.push({
      i,
      t,
      species: order[i].species,
      color: order[i].color,
      lane,
      dir: r <= 2 ? 1 : (rng.chance(0.5) ? 1 : -1),   // both directions from round 3
      speed,
      cross: crossMs(speed),
    })
  }
  return { round: r, colors: pool, bad, spawns, forbidden: (s) => bad[s.species] === s.color }
}

// --- state -------------------------------------------------------------------
export function create(seed) {
  const s = {
    seed,
    round: 1,
    lives: CONF.lives,
    score: 0,
    combo: 0,
    over: false,
    rounds: [],                 // { round, clean, livesLost, score }
    prevBad: null,
  }
  s.sched = schedule(seed, 1, null)
  return s
}

export const multiplier = (combo) =>
  Math.min(CONF.comboCap, 1 + Math.floor(combo / CONF.comboStep) * 0.5)

export const isForbidden = (sched, sp) => sched.bad[sp.species] === sp.color

// What ONE animal resolving does to the running tally. The screen calls this the
// instant a tap lands or an animal walks off; the server calls it once per event
// while replaying the log. Both go through here on purpose — the first version
// had the arithmetic written twice, and two copies of a scoring rule is two
// scoring rules, one of which drifts and shows up as the HUD disagreeing with
// the leaderboard.
export function step(acc, sched, sp, kind) {
  const forbidden = isForbidden(sched, sp)
  if (kind === "tap") {
    if (forbidden) { acc.lives--; acc.lost++; acc.combo = 0; return "wrong" }
    acc.gained += Math.round(CONF.base * multiplier(acc.combo))
    acc.combo++
    return "pop"
  }
  if (forbidden) { acc.gained += CONF.restraintBonus; return "held" }   // held back: correct
  acc.lives--; acc.lost++; acc.combo = 0                                // let a safe one walk
  return "escaped"
}

// One move resolves one whole round.
export function apply(state, move) {
  if (state.over) return state
  if (!move || move.r !== state.round) return state          // out of order: ignored, not thrown

  const sched = state.sched
  const taps = Array.isArray(move.taps) ? move.taps : []

  // Legalise the taps: on-screen at the claimed moment, one per animal, no two
  // closer together than a thumb can move. An illegal tap is dropped, so a
  // tampered log ends in a different score rather than in an exception.
  const seen = new Set()
  const clean = []
  let lastT = -Infinity
  for (const tap of taps) {
    if (!Array.isArray(tap) || tap.length < 2) continue
    const [i, t] = tap
    if (!Number.isInteger(i) || i < 0 || i >= sched.spawns.length) continue
    if (!Number.isFinite(t)) continue
    if (seen.has(i)) continue
    if (t < lastT) continue                                   // taps arrive in order
    if (t - lastT < CONF.minTapGapMs) continue
    const sp = sched.spawns[i]
    if (t < sp.t || t > sp.t + sp.cross) continue             // it was not there
    seen.add(i)
    clean.push({ t, i })
    lastT = t
  }

  // Build the round's timeline: every tap, and every untapped animal's exit.
  const events = clean.map((c) => ({ t: c.t, kind: "tap", sp: sched.spawns[c.i] }))
  for (const sp of sched.spawns) {
    if (!seen.has(sp.i)) events.push({ t: sp.t + sp.cross, kind: "exit", sp })
  }
  events.sort((a, b) => a.t - b.t || (a.kind === "tap" ? -1 : 1))

  const acc = { lives: state.lives, combo: state.combo, gained: 0, lost: 0 }
  for (const e of events) {
    step(acc, sched, e.sp, e.kind)
    if (acc.lives <= 0) { acc.lives = 0; break }
  }
  if (acc.lost === 0) acc.gained += CONF.cleanRoundBonus * state.round
  state.lives = acc.lives
  state.combo = acc.combo
  state.score += acc.gained
  const lost = acc.lost
  state.rounds.push({ round: state.round, clean: lost === 0, livesLost: lost, score: acc.gained })

  if (state.lives <= 0) { state.over = true; return state }
  state.prevBad = sched.bad
  state.round++
  state.sched = schedule(state.seed, state.round, state.prevBad)
  return state
}

// --- the strip ---------------------------------------------------------------
// One glyph per round. A function of the FEEDBACK ONLY — how many lives that
// round cost — and never of which colours were forbidden or which animals were
// involved. Nobody reading the strip learns anything about the puzzle.
export function events_(state) {
  return state.rounds.map((r, i) =>
    r.clean ? "hit"
    : (i === state.rounds.length - 1 && state.over) ? "bad"
    : "near")
}
export { events_ as events }

export function result(state, { seconds = 0 } = {}) {
  const secs = Math.max(0, Math.min(3600, Math.round(seconds)))
  const last = state.sched || schedule(state.seed, state.round, state.prevBad)
  return {
    score: state.score,
    round: state.rounds.length,
    seconds: secs,
    // Rank on the thing that can be proved. The score is re-simulated from the
    // log; the clock is a claim and only ever breaks a tie.
    metric: state.score,
    tiebreak: -secs,
    // The rule that ended the run — the "so close" line on the results screen.
    killedBy: { cat: COLORS[last.bad.cat].mark, unicorn: COLORS[last.bad.unicorn].mark },
    events: events_(state),
  }
}

export function replay(seed, log) {
  const s = create(seed)
  for (const move of log || []) apply(s, move)
  // A log that simply stops — a closed tab, a tampered file — is a finished run
  // at whatever it had reached, not an error.
  s.over = true
  return s
}

// What lets the checker play the game: a plausible round of taps for the state
// it is handed. It taps the safe ones and holds back on the forbidden ones,
// imperfectly, which is what a person does.
export function moves(state, rng) {
  const sched = state.sched
  const taps = []
  for (const sp of sched.spawns) {
    const forbidden = sched.bad[sp.species] === sp.color
    const takes = forbidden ? rng.chance(0.15) : rng.chance(0.85)
    if (takes) taps.push([sp.i, sp.t + Math.round(sp.cross * rng.float(0.25, 0.75))])
  }
  taps.sort((a, b) => a[1] - b[1])
  const spaced = []
  let last = -Infinity
  for (const t of taps) {
    if (t[1] - last < CONF.minTapGapMs) continue
    spaced.push(t); last = t[1]
  }
  return [{ r: state.round, taps: spaced }]
}

// The practice round is a hand-picked seed, not a random one: a first-ever
// player should meet two clearly different rules and a gentle round-one pace.
export const PRACTICE_SEED = 70413
