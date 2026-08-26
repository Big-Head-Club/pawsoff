// Persistence, shaped like the Postgres you will eventually want.
//
//   players  id pk, display_name, created_at, last_seen, flagged
//   runs     id, player_id, day, crew, metric, tiebreak, payload, log,
//            verified, created_at   unique(player_id, day, crew)
//   streaks  player_id pk, current, best, last_day
//
// A JSON file is the right call for a game whose whole point is that it took an
// afternoon. It is also the wrong call the moment two instances run at once, so
// the seam is here: swap this one file for Kysely and nothing above it changes.

import { readFile, writeFile, mkdir, rename } from "node:fs/promises"
import { dirname } from "node:path"

const EMPTY = { players: {}, runs: {}, streaks: {}, counts: {} }

export async function openStore(path) {
  let db = structuredClone(EMPTY)
  try { db = Object.assign(structuredClone(EMPTY), JSON.parse(await readFile(path, "utf8"))) } catch { /* first boot */ }

  let dirty = false, writing = null
  const flush = async () => {
    if (!dirty || writing) return
    dirty = false
    writing = (async () => {
      await mkdir(dirname(path), { recursive: true })
      await writeFile(path + ".tmp", JSON.stringify(db))
      await rename(path + ".tmp", path)      // atomic: a crash mid-write cannot truncate the board
      writing = null
      if (dirty) flush()
    })()
  }
  const touch = () => { dirty = true; setTimeout(flush, 400) }
  const key = (playerId, day, crew) => `${playerId}|${day}|${crew || ""}`

  return {
    db, touch,
    flush: async () => { dirty = true; await flush(); await writing },

    player(id) {
      let p = db.players[id]
      if (!p) { p = db.players[id] = { id, display_name: null, created_at: Date.now(), last_seen: 0, flagged: false }; touch() }
      p.last_seen = Date.now()
      return p
    },

    getRun(playerId, day, crew) { return db.runs[key(playerId, day, crew)] || null },
    putRun(row) { db.runs[key(row.player_id, row.day, row.crew)] = row; touch() },

    // One board per (day, crew). World is crew = "".
    board(day, crew, metric, limit = 100) {
      const dir = metric.dir === "asc" ? 1 : -1
      const rows = Object.values(db.runs).filter((r) => r.day === day && (r.crew || "") === (crew || "") && r.verified)
      rows.sort((a, b) =>
        (a.metric - b.metric) * dir ||
        (b.tiebreak - a.tiebreak) ||
        a.created_at - b.created_at)
      return { rows: rows.slice(0, limit), all: rows }
    },

    bumpStreak(playerId, day) {
      const s = db.streaks[playerId] || { player_id: playerId, current: 0, best: 0, last_day: null }
      if (s.last_day === day) return s
      const yesterday = new Date(Date.parse(day + "T00:00:00Z") - 86400000).toISOString().slice(0, 10)
      s.current = s.last_day === yesterday ? s.current + 1 : 1
      s.best = Math.max(s.best, s.current)
      s.last_day = day
      db.streaks[playerId] = s
      touch()
      return s
    },
    streak(playerId) { return db.streaks[playerId] || { current: 0, best: 0, last_day: null } },

    // Enough analytics to know whether anyone played, without a third party.
    count(day, what) {
      const d = (db.counts[day] ||= {})
      d[what] = (d[what] || 0) + 1
      touch()
    },
    counts(day) { return db.counts[day] || {} },
  }
}
