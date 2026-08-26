// THE ONLY FILE YOU HAVE TO EDIT TO MAKE A NEW GAME.
//
// Everything else in src/ is the host: the link, the card, the day, the board,
// the streak, the practice gate. You bring src/game/<your game>.mjs and this.

export default {
  // --- identity -------------------------------------------------------------
  key: "pawsoff",                      // salts the seed; never change it after launch
  title: "PAWS OFF",                    // shown everywhere
  tagline: "Two colours you must not touch.",
  description: "Cats and unicorns cross the screen. Tap every one except the two kinds the round forbids. Same run for everyone, once a day.",
  // This file is imported by BOTH the server and the browser, so it may not
  // touch `process` unguarded — that is a blank page in production.
  origin: (typeof process !== "undefined" && process.env.PUBLIC_ORIGIN) || "",

  // --- the day --------------------------------------------------------------
  epoch: "2026-08-26",                 // the day puzzle #1 was published
  // One global boundary so a group chat is always talking about one puzzle.
  // Pacific rather than UTC: UTC midnight is mid-afternoon in California, which
  // drops the new puzzle into the middle of a working day for most of the people
  // this actually gets sent to.
  timezone: "America/Los_Angeles",

  // --- the run --------------------------------------------------------------
  // Score, highest first. The score is RE-SIMULATED from the tap log — the
  // server rebuilds the schedule from the seed, checks every tap was on an
  // animal that was really on screen at that moment, and adds it up itself. The
  // clock is never used for anything but breaking a tie.
  metric: {
    key: "score", label: "points", dir: "desc",
    format: (v) => Number(v).toLocaleString("en-US"),
  },

  // First-timers play a scripted practice round before their first daily. In a
  // reaction game this matters more than usual: the rule is announced for two
  // seconds and then you are expected to act on it, and nobody works that out
  // while their one scored run is already moving.
  practiceGate: true,
  practice: true,                      // unlimited practice on random seeds, never scored

  archive: true,                       // /d/<n> replays any past day
  crews: true,                         // ?c=CODE gives a group its own private daily

  // --- verification ---------------------------------------------------------
  verify: "resim",

  // --- look -----------------------------------------------------------------
  theme: "paper",                      // themes/<name>/
  favicon: "🐾",

  // --- share ----------------------------------------------------------------
  share: {
    // One line. It is read in a notification, not on a page.
    statLine: (r) => `${Number(r.score).toLocaleString("en-US")} pts · round ${r.round}`,
    headline: (r) => `ROUND ${r.round}`,
    // Card tiles. NOTHING HERE MAY CONTAIN A CHARACTER THE CARD FONT LACKS —
    // it is a 5x7 bitmap with no middot, no star and no arrow, and a missing
    // glyph draws nothing while still advancing the cursor, which reads as a
    // hole punched in the middle of a number. Digits and commas only.
    stats: (r) => [
      { value: Number(r.score).toLocaleString("en-US"), label: "points", accent: true },
      { value: String(r.round), label: "rounds" },
    ],
    // What rides in the link so the card renders without a lookup. Tiny, and
    // with nothing in it that gives away a puzzle.
    token: (r) => ({ n: r.number, s: r.score, r: r.round }),
    fromToken: (t) => ({ number: t.n, score: t.s, round: t.r }),
  },
}
