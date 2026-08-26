// Does PAWS OFF resolve, and does its curve keep climbing?
//
// The bot is handicapped, because a bot that can see every animal at once and
// tap at 60Hz says nothing about a person. The handicaps have physical floors:
//
//   - ONSET: an animal is not perceived until it has been on screen ~150ms.
//   - IDENTIFY: species and colour cannot be read in parallel. Attention is
//     serial, and each animal costs `idMs` of it. This is the real bottleneck
//     of the whole game — not tapping, deciding.
//   - TAP: a thumb cannot produce taps closer together than `tapGapMs`.
//   - VIEWPORT: only what is on the stage exists. No lookahead into the queue.
//
// The bot picks what to identify by URGENCY — the animal closest to leaving —
// which is what a person does and is also the only policy that does not
// accidentally reward standing still.
//
//   node test/balance.mjs [runs]

import { schedule, roundConf, create, apply, CONF, STAGE_W } from "../src/game/game.rules.mjs"
import { makeRng } from "../src/core/rng.mjs"

const TIERS = {
  novice: { onset: 190, idMs: 400, tapGap: 210, slip: 0.10 },
  decent: { onset: 160, idMs: 310, tapGap: 165, slip: 0.05 },
  strong: { onset: 130, idMs: 240, tapGap: 130, slip: 0.02 },
}

// Play one round with a tier of bot; returns the tap list it produced.
function playRound(sched, tier, rng) {
  const taps = []
  const spawns = sched.spawns
  let attnFree = 0          // when serial attention is next available
  let thumbFree = 0         // when the thumb is next available
  const identified = new Set()
  const resolved = new Set()

  // Walk time forward in the order attention frees up. At each moment, look at
  // what is on screen, unidentified, and closest to leaving.
  let t = 0
  const end = spawns.at(-1).t + spawns.at(-1).cross + 10
  while (t < end) {
    let best = null, bestExit = Infinity
    for (const sp of spawns) {
      if (identified.has(sp.i) || resolved.has(sp.i)) continue
      const visible = sp.t + tier.onset
      const exit = sp.t + sp.cross
      if (exit <= t) { resolved.add(sp.i); continue }         // gone before we looked
      if (visible > t) continue                                // not on screen yet
      if (exit < bestExit) { best = sp; bestExit = exit }
    }
    if (!best) {
      // Nothing to look at: jump to the next thing that becomes visible.
      let next = Infinity
      for (const sp of spawns) {
        if (identified.has(sp.i) || resolved.has(sp.i)) continue
        const v = sp.t + tier.onset
        if (v > t && v < next) next = v
      }
      if (!Number.isFinite(next)) break
      t = Math.max(t, next); attnFree = Math.max(attnFree, t)
      continue
    }

    const doneAt = Math.max(t, attnFree) + tier.idMs
    if (doneAt > bestExit) {
      // Could not finish reading it in time. It leaves unidentified.
      resolved.add(best.i)
      t = Math.max(t, attnFree)
      continue
    }
    identified.add(best.i)
    attnFree = doneAt
    t = doneAt

    const forbidden = sched.bad[best.species] === best.color
    // A slip is a decision error, not a motor one: the wrong call on a correctly
    // seen animal. It goes both ways.
    const decideTap = rng.chance(tier.slip) ? forbidden : !forbidden
    if (decideTap) {
      const at = Math.max(doneAt, thumbFree)
      if (at <= bestExit) { taps.push([best.i, Math.round(at)]); thumbFree = at + tier.tapGap }
    }
  }
  taps.sort((a, b) => a[1] - b[1])
  // Respect the rules file's own thumb floor so nothing is dropped on replay.
  const out = []
  let last = -Infinity
  for (const tp of taps) {
    if (tp[1] - last < CONF.minTapGapMs) continue
    out.push(tp); last = tp[1]
  }
  return out
}

function runOnce(seed, tier, rng) {
  const s = create(seed)
  let guard = 0
  while (!s.over && guard++ < 200) {
    apply(s, { r: s.round, taps: playRound(s.sched, tier, rng) })
  }
  return { round: s.rounds.length, score: s.score, over: s.over, guard }
}

const RUNS = Number(process.argv[2] || 400)
const rng = makeRng(0xBEEF)
console.log(`\nPAWS OFF — balance, ${RUNS} runs per tier\n`)

let allTerminated = true
for (const [name, tier] of Object.entries(TIERS)) {
  const rounds = [], scores = []
  for (let i = 0; i < RUNS; i++) {
    const r = runOnce((i * 2654435761) >>> 0, tier, rng)
    if (!r.over) allTerminated = false
    rounds.push(r.round); scores.push(r.score)
  }
  rounds.sort((a, b) => a - b); scores.sort((a, b) => a - b)
  const q = (a, p) => a[Math.floor(a.length * p)]
  const mean = (a) => (a.reduce((x, y) => x + y, 0) / a.length)
  console.log(
    `${name.padEnd(7)} round  mean ${mean(rounds).toFixed(1).padStart(5)}  p10 ${String(q(rounds, .1)).padStart(2)}  med ${String(q(rounds, .5)).padStart(2)}  p90 ${String(q(rounds, .9)).padStart(2)}  max ${String(rounds.at(-1)).padStart(2)}   ` +
    `score med ${String(q(scores, .5)).padStart(6)}  p90 ${String(q(scores, .9)).padStart(6)}`)
}

// Where does the difficulty actually bite? Per-round survival for the middle
// tier — the shape of the curve, not just where it ends.
console.log("\nper-round life loss (decent bot, isolated rounds, 300 samples each)")
for (let r = 1; r <= 14; r++) {
  let lost = 0, n = 300
  for (let i = 0; i < n; i++) {
    const sched = schedule((i * 2654435761) >>> 0, r, null)
    const s = create(1); s.sched = sched; s.round = r; s.lives = 99
    apply(s, { r, taps: playRound(sched, TIERS.decent, rng) })
    lost += s.rounds[0].livesLost
  }
  const c = roundConf(r)
  const bar = "#".repeat(Math.round((lost / n) * 12))
  console.log(`  R${String(r).padStart(2)}  ${(lost / n).toFixed(2)} lives  int ${String(c.interval).padStart(4)}  ${bar}`)
}

console.log(allTerminated ? "\nall runs terminated" : "\nSOME RUNS DID NOT TERMINATE")
