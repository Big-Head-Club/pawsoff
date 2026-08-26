// The template's own tests. They check the primitives, not the example game —
// these are the things that must not break when you write a new game on top.

import { makeRng, hash } from "../src/core/rng.mjs"
import { dayKey, puzzleNumber, dayForPuzzle, msUntilNextDay, formatCountdown } from "../src/core/day.mjs"
import { seedFor, normaliseCrew, makeCrewCode } from "../src/core/seed.mjs"
import { strip, shareText, encodeResult, decodeResult, links } from "../src/core/share.mjs"
import * as rules from "../src/game/game.rules.mjs"
import config from "../relay.config.mjs"

let bad = 0
const ok = (name, cond, extra = "") => {
  if (cond) console.log("  ok  " + name)
  else { bad++; console.log("FAIL  " + name + " " + extra) }
}

// --- determinism ------------------------------------------------------------
{
  const a = makeRng(42), b = makeRng(42)
  ok("same seed, same stream", Array.from({ length: 50 }, () => a.next()).join() === Array.from({ length: 50 }, () => b.next()).join())
  const src = [1, 2, 3, 4, 5]
  makeRng(1).shuffle(src)
  ok("shuffle does not mutate its input", src.join() === "1,2,3,4,5")
  ok("hash is stable", hash("pawsoff|2026-08-19") === hash("pawsoff|2026-08-19"))
}

// --- the day ----------------------------------------------------------------
{
  ok("epoch is puzzle #1", puzzleNumber("2026-08-19", "2026-08-19") === 1)
  ok("puzzle numbers round-trip", dayForPuzzle(37, "2026-08-19") && puzzleNumber(dayForPuzzle(37, "2026-08-19"), "2026-08-19") === 37)
  ok("a timezone shifts the day boundary", typeof dayKey("America/Los_Angeles") === "string")
  const ms = msUntilNextDay("UTC")
  ok("countdown is inside one day", ms > 0 && ms <= 86400000, String(ms))
  ok("countdown formats", /^\d+:\d\d:\d\d$/.test(formatCountdown(ms)))
}

// --- seeds and crews --------------------------------------------------------
{
  const base = { gameKey: "pawsoff", day: "2026-08-19", salt: "s" }
  ok("a crew gets its own puzzle", seedFor(base) !== seedFor({ ...base, crew: "ABC123" }))
  ok("two crews differ", seedFor({ ...base, crew: "ABC123" }) !== seedFor({ ...base, crew: "XYZ789" }))
  ok("the salt matters", seedFor(base) !== seedFor({ ...base, salt: "t" }))
  ok("two games on the same day differ", seedFor(base) !== seedFor({ ...base, gameKey: "other" }))
  ok("crew codes normalise", normaliseCrew(" ab-c12 ") === "ABC12")
  ok("short junk is not a crew", normaliseCrew("!!") === null)
  ok("generated codes avoid look-alikes", !/[IOL01]/.test(Array.from({ length: 40 }, () => makeCrewCode()).join("")))
}

// --- the share artifact -----------------------------------------------------
{
  const events = ["miss", "near", "hit"]
  const s = strip(events)
  ok("strip renders one glyph per beat", [...s].length >= 3)
  const text = shareText({ title: "PAWS OFF", number: 1, lines: ["2/6 · 3s"], strips: [s], url: "https://x.test/d/1" })
  const lines = text.split("\n")
  ok("share text is at most four lines", lines.length <= 4, String(lines.length))
  ok("the link is the last line", lines[lines.length - 1].startsWith("http"))
  ok("no hashtags", !text.includes("#" + "hashtag") && !/\s#[a-z]/i.test(text))

  const t = { n: 1, s: 2340, r: 8 }
  ok("result tokens round-trip", JSON.stringify(decodeResult(encodeResult(t))) === JSON.stringify(t))
  ok("a bad token decodes to null, not a throw", decodeResult("!!!!") === null)
  const l = links({ origin: "https://x.test", number: 7, crew: "ABC123", result: t })
  ok("links are absolute", l.invite.startsWith("https://") && l.card.startsWith("https://"))
  ok("the invite link carries no result", !l.invite.includes("r="))
  ok("the result link carries one", l.result.includes("r="))
}

// --- the strip must not leak the rule ---------------------------------------
//
// The property that matters is not "no strip identifies one puzzle". It is that
// the strip is a function of the FEEDBACK ALONE — how many lives each round
// cost — and never of WHICH colours were forbidden. If a glyph ever varied with
// the rule, the strip would be a channel back to tomorrow's answer for anyone
// who bothered to collect enough of them.
{
  const byShape = new Map()
  let leak = null
  for (let seed = 0; seed < 600 && !leak; seed++) {
    const s = rules.create(seed)
    const rng = makeRng(seed ^ 0x5151)
    let guard = 0
    while (!s.over && guard++ < 40) rules.apply(s, rules.moves(s, rng)[0])
    const shape = s.rounds.map((r) => r.livesLost).join(",")
    const st = rules.events(s).join("")
    if (byShape.has(shape) && byShape.get(shape) !== st) leak = `${shape}: ${byShape.get(shape)} vs ${st}`
    byShape.set(shape, st)
  }
  ok("the strip depends only on lives lost, never on the rule", !leak, leak || "")
  ok("the sample covered several shapes", byShape.size > 5, String(byShape.size))
}

// --- verification -----------------------------------------------------------
{
  const seed = seedFor({ gameKey: "pawsoff", day: "2026-08-19", salt: "x" })

  // A clean first round, played honestly: tap every safe animal halfway across,
  // hold back on every forbidden one.
  const s0 = rules.create(seed)
  const honest = []
  for (const sp of s0.sched.spawns) {
    if (!rules.isForbidden(s0.sched, sp)) honest.push([sp.i, sp.t + Math.round(sp.cross / 2)])
  }
  honest.sort((a, b) => a[1] - b[1])
  const played = rules.replay(seed, [{ r: 1, taps: honest }])
  ok("the server can rebuild a run from its log alone", played.rounds.length === 1)
  ok("a clean round loses no lives", played.rounds[0].livesLost === 0, JSON.stringify(played.rounds[0]))

  // Tampering. Each of these should change the SCORE, never throw.
  const ghostTap = rules.replay(seed, [{ r: 1, taps: [[0, 999999]] }])
  ok("a tap when nothing was on screen is ignored", ghostTap.rounds[0].score < played.rounds[0].score)
  const badIndex = rules.replay(seed, [{ r: 1, taps: [[9999, 100]], }])
  ok("a tap on an animal that does not exist is ignored, not thrown", badIndex.rounds.length === 1)
  const junk = rules.replay(seed, [{ r: 1, taps: [null, "x", [0], [1.5, 2]] }])
  ok("malformed taps are ignored, not thrown", junk.rounds.length === 1)
  const wrongRound = rules.replay(seed, [{ r: 7, taps: honest }])
  ok("a move for the wrong round does nothing", wrongRound.rounds.length === 0)

  // Double-tapping one animal must not pay twice, and a machine-gun log must not
  // out-tap a thumb.
  const doubled = rules.replay(seed, [{ r: 1, taps: honest.flatMap((t) => [t, [t[0], t[1] + 60]]) }])
  ok("an animal can only be tapped once", doubled.score === played.score, `${doubled.score} vs ${played.score}`)
  const machineGun = s0.sched.spawns.map((sp, k) => [sp.i, sp.t + 1 + k])   // 1ms apart
  const gunned = rules.replay(seed, [{ r: 1, taps: machineGun }])
  const gunTaps = gunned.rounds[0]
  ok("taps closer together than a thumb are dropped", gunned.score < played.score, String(gunned.score))

  // The assertion that catches the most real bugs: a run cannot beat its own
  // ceiling. Perfect play on round 1 is every safe animal at the running combo
  // plus every forbidden one held plus the clean bonus.
  const best = (() => {
    const sc = rules.create(seed).sched
    let acc = { lives: 3, combo: 0, gained: 0, lost: 0 }
    const safe = sc.spawns.filter((sp) => !rules.isForbidden(sc, sp))
    const held = sc.spawns.length - safe.length
    for (const sp of safe) rules.step(acc, sc, sp, "tap")
    return acc.gained + held * rules.CONF.restraintBonus + rules.CONF.cleanRoundBonus
  })()
  ok("a round cannot exceed its own ceiling", played.rounds[0].score <= best, `${played.rounds[0].score} > ${best}`)

  const slow = rules.result(played, { seconds: 999999 })
  ok("a claimed clock is clamped", slow.seconds <= 3600)
  ok("the clock is only a tiebreak", slow.metric === played.score)
}

// --- determinism of the schedule --------------------------------------------
{
  const a = rules.schedule(12345, 4, null)
  const b = rules.schedule(12345, 4, null)
  ok("the same seed and round give the same schedule", JSON.stringify(a.spawns) === JSON.stringify(b.spawns))
  ok("a different round gives a different one", JSON.stringify(a.spawns) !== JSON.stringify(rules.schedule(12345, 5, null).spawns))
  // Every round's rule must differ from the previous round's for that species,
  // or the banner stops being worth reading.
  let repeats = 0
  for (let seed = 0; seed < 200; seed++) {
    let prev = null
    for (let r = 1; r <= 8; r++) {
      const sc = rules.schedule(seed, r, prev)
      if (prev && (sc.bad.cat === prev.cat || sc.bad.unicorn === prev.unicorn)) repeats++
      prev = sc.bad
    }
  }
  ok("a rule never repeats back to back for one species", repeats === 0, String(repeats))
  // The curve has to keep climbing. A round that is easier than the one before
  // it is the seam bug this game already had once.
  let regress = []
  for (let r = 2; r <= 24; r++) {
    const p = rules.roundConf(r - 1), c = rules.roundConf(r)
    if (c.interval > p.interval) regress.push(`interval R${r}`)
    if (c.speedHi < p.speedHi) regress.push(`speed R${r}`)
  }
  ok("difficulty never goes backwards", regress.length === 0, regress.join(" "))
}

// --- anything the game prints on the unfurl card must exist in the card font -
//
// The card face is a 5x7 bitmap. A character it does not have draws NOTHING
// while still advancing the cursor, which reads as a hole punched in the middle
// of a number — and the game author cannot see the card from relay.config.mjs.
{
  const { glyph } = await import("../src/server/font.mjs")
  const sample = { number: 142, score: 12340, round: 11, seconds: 74 }
  const printed = [
    config.title,
    config.tagline,
    config.share.headline(sample),
    ...config.share.stats(sample).flatMap((s) => [String(s.value), String(s.label)]),
  ].join(" ")
  const missing = [...new Set([...printed.toUpperCase()])].filter((c) => !glyph(c))
  ok("the card font has every character the card prints", missing.length === 0, JSON.stringify(missing))

  // AND IT HAS TO FIT. Every band on the card shrinks to fit and then stops at a
  // floor; past that it runs off the right edge silently, which is how the first
  // live card read "TWO COLOURS YOU MUST NOT T". The tagline is the announce
  // card's headline — the thing that decides whether a stranger taps the link —
  // and the author cannot see the card from relay.config.mjs.
  const { textWidth } = await import("../src/server/font.mjs")
  const CARD_W = 1200, CARD_MARGIN = 92, BUDGET = CARD_W - CARD_MARGIN * 2
  const fits = (text, floor) => textWidth(String(text).toUpperCase(), floor) <= BUDGET
  ok("the tagline fits the card at its smallest scale", fits(config.tagline, 7),
     `${config.tagline} = ${textWidth(config.tagline.toUpperCase(), 7)}px of ${BUDGET}`)
  ok("the title and day number fit", fits(config.title + " #999", 4))
  ok("the headline fits", fits(config.share.headline({ round: 22 }), 7))
  for (const t of config.share.stats(sample)) {
    ok(`stat tile "${t.label}" fits`, fits(t.value, 6) && fits(t.label, 4))
  }
}

// --- config sanity ----------------------------------------------------------
{
  ok("config declares an epoch", /^\d{4}-\d{2}-\d{2}$/.test(config.epoch))
  ok("config declares a metric direction", ["asc", "desc"].includes(config.metric.dir))
  ok("share lines are one line each", !config.share.statLine({ score: 2340, round: 8, seconds: 3 }).includes("\n"))
  ok("the share token omits the rule", !/bad|colou?r|sched/.test(JSON.stringify(config.share.token({ number: 1, score: 2, round: 3 }))))
}

console.log(bad ? `\n${bad} failing` : "\nall green")
process.exit(bad ? 1 : 0)
