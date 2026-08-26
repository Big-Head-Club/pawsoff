// Is PAWS OFF about what it thinks it is about?
//
// The balance sim proves a run ends. It cannot tell you the rule is load
// bearing. MACHINE passed its balance sim for days while its whole premise was
// worthless, so this is the second harness.
//
// Every bot below gets the SAME eyes, the same attention, the same thumb and the
// same route through the round. They differ in exactly one predicate: which
// animals they decide to tap. Hold the motion fixed and vary only the decision,
// or you are measuring pathfinding.
//
//   node test/duel.mjs [runs]

import { schedule, create, apply, CONF } from "../src/game/game.rules.mjs"
import { makeRng } from "../src/core/rng.mjs"

const EYES = { onset: 160, idMs: 310, tapGap: 165, slip: 0.05 }

// The only thing that varies: given an identified animal, tap it or not.
const POLICIES = {
  "reads both rules": (sp, sched) => sched.bad[sp.species] !== sp.color,
  "cat rule only":    (sp, sched) => sp.species !== "cat" || sched.bad.cat !== sp.color,
  "colour, no species": (sp, sched) => sp.color !== sched.bad.cat && sp.color !== sched.bad.unicorn,
  "taps everything":  () => true,
  "taps nothing":     () => false,
  "coin flip":        (sp, sched, rng) => rng.chance(0.5),
}

function playRound(sched, policy, rng) {
  const taps = []
  const spawns = sched.spawns
  let attnFree = 0, thumbFree = 0
  const seen = new Set(), gone = new Set()
  let t = 0
  const end = spawns.at(-1).t + spawns.at(-1).cross + 10
  while (t < end) {
    let best = null, bestExit = Infinity
    for (const sp of spawns) {
      if (seen.has(sp.i) || gone.has(sp.i)) continue
      const exit = sp.t + sp.cross
      if (exit <= t) { gone.add(sp.i); continue }
      if (sp.t + EYES.onset > t) continue
      if (exit < bestExit) { best = sp; bestExit = exit }
    }
    if (!best) {
      let next = Infinity
      for (const sp of spawns) {
        if (seen.has(sp.i) || gone.has(sp.i)) continue
        const v = sp.t + EYES.onset
        if (v > t && v < next) next = v
      }
      if (!Number.isFinite(next)) break
      t = Math.max(t, next); attnFree = Math.max(attnFree, t)
      continue
    }
    const doneAt = Math.max(t, attnFree) + EYES.idMs
    if (doneAt > bestExit) { gone.add(best.i); t = Math.max(t, attnFree); continue }
    seen.add(best.i); attnFree = doneAt; t = doneAt

    let want = policy(best, sched, rng)
    if (rng.chance(EYES.slip)) want = !want
    if (want) {
      const at = Math.max(doneAt, thumbFree)
      if (at <= bestExit) { taps.push([best.i, Math.round(at)]); thumbFree = at + EYES.tapGap }
    }
  }
  taps.sort((a, b) => a[1] - b[1])
  const out = []; let last = -Infinity
  for (const tp of taps) { if (tp[1] - last < CONF.minTapGapMs) continue; out.push(tp); last = tp[1] }
  return out
}

function runOnce(seed, policy, rng, lives) {
  const s = create(seed)
  if (lives) s.lives = lives
  let guard = 0
  while (!s.over && guard++ < 300) apply(s, { r: s.round, taps: playRound(s.sched, policy, rng) })
  return { round: s.rounds.length, score: s.score }
}

const RUNS = Number(process.argv[2] || 400)
const rng = makeRng(0xD0E1)
const mean = (a) => a.reduce((x, y) => x + y, 0) / a.length

console.log(`\nPAWS OFF — duel, ${RUNS} runs, identical eyes and thumbs, one predicate different\n`)
for (const [name, pol] of Object.entries(POLICIES)) {
  const rounds = [], scores = []
  for (let i = 0; i < RUNS; i++) {
    const r = runOnce((i * 2654435761) >>> 0, pol, rng)
    rounds.push(r.round); scores.push(r.score)
  }
  console.log(`  ${name.padEnd(20)} round ${mean(rounds).toFixed(2).padStart(6)}   score ${Math.round(mean(scores)).toString().padStart(6)}`)
}

// How many lives does the ladder actually need to be reachable? Everything past
// the round the median player dies on is decoration.
console.log("\nlives sweep — 'reads both rules', where the median run ends")
for (const lives of [3, 4, 5, 6, 8]) {
  const rounds = []
  for (let i = 0; i < RUNS; i++) rounds.push(runOnce((i * 2654435761) >>> 0, POLICIES["reads both rules"], rng, lives).round)
  rounds.sort((a, b) => a - b)
  const q = (p) => rounds[Math.floor(rounds.length * p)]
  console.log(`  ${lives} lives   p10 ${String(q(.1)).padStart(2)}   median ${String(q(.5)).padStart(2)}   p90 ${String(q(.9)).padStart(2)}   mean ${mean(rounds).toFixed(1)}`)
}
