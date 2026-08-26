// Relay host. Nothing in here knows what the game is.
//
// Routes are named for the procedure they call so that moving to tRPC later is
// a rename: POST /api/daily.submit, POST /api/daily.leaderboard, and so on.

import { createServer } from "node:http"
import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { extname, join, normalize } from "node:path"
import { fileURLToPath } from "node:url"

import config from "./relay.config.mjs"
import { openStore } from "./src/server/store.mjs"
import { renderCard } from "./src/server/og.mjs"
import { dayKey, puzzleNumber, dayForPuzzle, msUntilNextDay } from "./src/core/day.mjs"
import { seedFor, normaliseCrew } from "./src/core/seed.mjs"
import { decodeResult } from "./src/core/share.mjs"
import * as rules from "./src/game/game.rules.mjs"
import { loadTheme } from "./src/server/theme.mjs"

const ROOT = fileURLToPath(new URL(".", import.meta.url))
const PORT = Number(process.env.PORT || 3000)
const SALT = process.env.DAILY_SALT || "relay-dev-salt"
const SAVE = process.env.SAVE_PATH || join(ROOT, "save.json")
const BUILD = (process.env.RAILWAY_GIT_COMMIT_SHA ?? String(Date.now())).slice(0, 12)

const store = await openStore(SAVE)

// The template repo carries a marker; a scaffolded game does not. It is the one
// thing that distinguishes "this deploy is Relay showing itself off" from "this
// deploy is somebody's game", and it is why the summary page can live at / here
// without changing the route every real game depends on.
const IS_TEMPLATE = existsSync(join(ROOT, ".relay-template"))
const theme = await loadTheme(ROOT, config.theme)

// PUBLIC_ORIGIN has to be absolute for the unfurl to work at all. Falling back
// to the request's own Host header keeps localhost and preview deploys honest.
const originFor = (req) => {
  if (config.origin) return config.origin
  const host = req.headers["x-forwarded-host"] || req.headers.host || `localhost:${PORT}`
  const proto = req.headers["x-forwarded-proto"] || (/^(localhost|127\.|\[::1\])/.test(host) ? "http" : "https")
  return `${proto}://${host}`
}

const MIME = {
  ".html": "text/html; charset=utf-8", ".css": "text/css; charset=utf-8",
  ".mjs": "text/javascript; charset=utf-8", ".js": "text/javascript; charset=utf-8",
  ".json": "application/json; charset=utf-8", ".png": "image/png", ".webp": "image/webp",
  ".jpg": "image/jpeg", ".svg": "image/svg+xml", ".woff2": "font/woff2", ".mp3": "audio/mpeg",
}

const json = (res, code, body) => {
  const s = JSON.stringify(body)
  res.writeHead(code, { "content-type": MIME[".json"], "content-length": Buffer.byteLength(s) })
  res.end(s)
}

const hits = new Map()
function rateLimited(ip, max, windowMs = 60000) {
  const now = Date.now()
  const live = (hits.get(ip) || []).filter((t) => now - t < windowMs)
  live.push(now)
  hits.set(ip, live)
  if (hits.size > 5000) hits.clear()
  return live.length > max
}

const readBody = (req) => new Promise((resolve, reject) => {
  let n = 0; const chunks = []
  req.on("data", (c) => { n += c.length; if (n > 1_000_000) { reject(new Error("tooBig")); req.destroy() } chunks.push(c) })
  req.on("end", () => { try { resolve(chunks.length ? JSON.parse(Buffer.concat(chunks)) : {}) } catch (e) { reject(e) } })
  req.on("error", reject)
})

const cleanName = (s) => String(s || "").replace(/[^\p{L}\p{N} _.\-]/gu, "").trim().slice(0, 16)
const today = () => dayKey(config.timezone)

function context({ day, crew, mode }) {
  const d = day || today()
  return {
    day: d,
    number: puzzleNumber(d, config.epoch),
    crew: crew || null,
    seed: seedFor({ gameKey: config.key, day: d, salt: SALT, crew, mode: mode || "daily" }),
  }
}

// --- procedures --------------------------------------------------------------

const procedures = {
  async "daily.getSeed"({ day, number, crew, playerId }) {
    const c = config.crews ? normaliseCrew(crew) : null
    // /d/<n> hands back a number, not a date — resolving it here keeps the
    // epoch in one place instead of duplicating the arithmetic in the client.
    const fromNumber = config.archive && Number.isInteger(number) && number > 0
      ? dayForPuzzle(number, config.epoch) : null
    const d = (config.archive && day) || fromNumber || today()
    const ctx = context({ day: d, crew: c })
    if (playerId) store.count(ctx.day, "open")
    return Object.assign(ctx, {
      isToday: ctx.day === today(),
      msUntilNextDay: msUntilNextDay(config.timezone),
      practiceSeed: rules.PRACTICE_SEED,
    })
  },

  async "player.me"({ playerId }) {
    if (!playerId) return { streak: 0, best: 0, playedToday: false, practiced: false }
    const p = store.player(playerId)
    const s = store.streak(playerId)
    return {
      streak: s.current, best: s.best, displayName: p.display_name,
      playedToday: !!store.getRun(playerId, today(), null),
      practiced: !!p.practiced,
    }
  },

  async "player.setName"({ playerId, displayName }) {
    if (!playerId) return { error: "noPlayer" }
    const name = cleanName(displayName)
    if (name.length < 3) return { error: "nameTooShort" }
    store.player(playerId).display_name = name
    store.touch()
    return { ok: true, displayName: name }
  },

  async "player.practiced"({ playerId }) {
    if (!playerId) return { ok: false }
    store.player(playerId).practiced = true
    store.touch()
    return { ok: true }
  },

  async "daily.submit"({ playerId, day, crew, log, claimed, displayName }) {
    if (!playerId) return { error: "noPlayer" }
    const c = config.crews ? normaliseCrew(crew) : null
    const d = day || today()
    if (d !== today()) return { error: "notToday" }          // archive days never score
    if (store.getRun(playerId, d, c)) return { error: "alreadyPlayed" }
    if (!Array.isArray(log) || log.length > 200) return { error: "badLog" }

    const ctx = context({ day: d, crew: c })
    // The whole anti-cheat, for a deterministic game: play the log ourselves.
    const state = rules.replay(ctx.seed, log)
    const r = rules.result(state, { seconds: Number(claimed && claimed.seconds) || 0 })
    if (claimed && Number.isFinite(claimed.metric) && claimed.metric !== r.metric) {
      store.player(playerId).flagged = true
      store.touch()
      return { error: "mismatch" }
    }
    if (!state.over) return { error: "unfinished" }

    const p = store.player(playerId)
    const name = cleanName(displayName) || p.display_name
    if (name && name.length >= 3) p.display_name = name

    store.putRun({
      id: `${playerId}|${d}|${c || ""}`, player_id: playerId, day: d, crew: c || "",
      metric: r.metric, tiebreak: r.tiebreak, payload: r, log,
      verified: true, created_at: Date.now(),
    })
    store.count(d, "finish")
    const streak = store.bumpStreak(playerId, d)
    const { all } = store.board(d, c, config.metric, 100)
    await store.flush()
    return {
      ok: true, verified: true,
      rank: all.findIndex((row) => row.player_id === playerId) + 1,
      of: all.length,
      streak: streak.current,
    }
  },

  async "daily.leaderboard"({ playerId, day, crew }) {
    const c = config.crews ? normaliseCrew(crew) : null
    const d = day || today()
    const { rows, all } = store.board(d, c, config.metric, 100)
    const row = (r, i) => ({
      rank: i + 1, playerId: r.player_id,
      displayName: store.db.players[r.player_id]?.display_name || null,
      metric: r.metric, payload: r.payload,
    })
    let me = null
    if (playerId) {
      const i = all.findIndex((r) => r.player_id === playerId)
      if (i >= 0) me = row(all[i], i)
    }
    return { day: d, crew: c, metric: config.metric, top: rows.map(row), me, played: all.length }
  },
}

// --- html --------------------------------------------------------------------
//
// Meta tags are rendered per URL, server-side. A single-page app that sets its
// og:image from JavaScript has no unfurl at all: scrapers do not run scripts.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;" }[c]))

async function page(req, { number, crew, resultToken }) {
  const origin = originFor(req)
  const r = resultToken ? config.share.fromToken(decodeResult(resultToken) || {}) : null
  const n = number || puzzleNumber(today(), config.epoch)
  const title = r ? `${config.title} #${n} — ${config.share.headline(r)}` : `${config.title} #${n}`
  const desc = r ? `${config.share.statLine(r)} · ${config.description}` : config.description
  const card = `${origin}/api/og.png?${new URLSearchParams(Object.assign(
    { d: n, v: BUILD }, crew ? { c: crew } : null, resultToken ? { r: resultToken } : null))}`

  const html = await readFile(join(ROOT, "public/index.html"), "utf8")
  return html
    .replaceAll("%TITLE%", esc(title))
    .replaceAll("%DESC%", esc(desc))
    .replaceAll("%CARD%", esc(card))
    .replaceAll("%ORIGIN%", esc(origin))
    .replaceAll("%NAME%", esc(config.title))
    .replaceAll("%THEME%", esc(config.theme))
    .replaceAll("%BUILD%", esc(BUILD))
    .replaceAll("%CONFIG%", JSON.stringify({
      key: config.key, title: config.title, tagline: config.tagline,
      metric: config.metric, practiceGate: config.practiceGate, practice: config.practice,
      crews: config.crews, archive: config.archive, number: n, origin,
    }))
}

// --- server ------------------------------------------------------------------

const server = createServer(async (req, res) => {
  const ip = (req.headers["x-forwarded-for"] || "").split(",")[0].trim() || req.socket.remoteAddress || "?"
  const url = new URL(req.url, "http://x")
  const path = decodeURIComponent(url.pathname)

  try {
    if (req.method === "POST" && path.startsWith("/api/")) {
      const fn = procedures[path.slice(5)]
      if (!fn) return json(res, 404, { error: "noSuchProcedure" })
      if (rateLimited(ip, path.endsWith("submit") ? 20 : 120)) return json(res, 429, { error: "rateLimited" })
      return json(res, 200, await fn(await readBody(req)))
    }

    if (path === "/api/og.png") {
      const n = Number(url.searchParams.get("d")) || puzzleNumber(today(), config.epoch)
      const token = url.searchParams.get("r")
      const r = token ? config.share.fromToken(decodeResult(token) || {}) : null
      const png = await renderCard({
        theme, art: join(ROOT, "themes", config.theme, "card.png"),
        title: config.title, number: n, crew: url.searchParams.get("c"),
        headline: r ? config.share.headline(r) : config.tagline,
        stats: r ? statsFor(r) : [],
        footer: "one a day / no sign-in",
      })
      res.writeHead(200, {
        "content-type": "image/png", "content-length": png.length,
        // Long cache: the URL already carries everything that can change, and
        // chat clients keep the first card they scraped for a given URL anyway.
        "cache-control": "public, max-age=86400, immutable",
      })
      return res.end(png)
    }

    if (req.method !== "GET" && req.method !== "HEAD") { res.writeHead(405); return res.end() }

    // On the template's own deploy, / is the summary and the game is at /play.
    // In a real game / is the game and this branch never fires.
    if (IS_TEMPLATE && (path === "/" || path === "/about")) {
      const html = (await readFile(join(ROOT, "public/about.html"), "utf8")).replaceAll("%ORIGIN%", esc(originFor(req)))
      res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" })
      return res.end(html)
    }

    const archive = /^\/d\/(\d+)$/.exec(path)
    if (path === "/" || path === "/play" || archive) {
      const html = await page(req, {
        number: archive ? Number(archive[1]) : null,
        crew: config.crews ? normaliseCrew(url.searchParams.get("c")) : null,
        resultToken: url.searchParams.get("r"),
      })
      res.writeHead(200, { "content-type": MIME[".html"], "cache-control": "no-cache" })
      return res.end(html)
    }

    const safe = normalize(path).replace(/^(\.\.[/\\])+/, "")
    // public/ first, then the module tree the browser imports directly, then the
    // one config file that lives at the root because it is the file you edit.
    const ALLOW_ROOT = new Set(["/relay.config.mjs"])
    for (const base of ["public", ""]) {
      if (base === "" && !safe.startsWith("/src/") && !safe.startsWith("/themes/") && !ALLOW_ROOT.has(safe)) continue
      const file = join(ROOT, base, safe)
      if (!file.startsWith(ROOT) || !existsSync(file) || file.endsWith("/")) continue
      const buf = await readFile(file).catch(() => null)
      if (!buf) continue
      res.writeHead(200, {
        "content-type": MIME[extname(file)] || "application/octet-stream",
        "cache-control": url.search.includes("v=") ? "public, max-age=31536000, immutable" : "no-cache",
        "content-length": buf.length,
      })
      return res.end(buf)
    }

    res.writeHead(404, { "content-type": "text/plain" })
    res.end("not found")
  } catch (e) {
    json(res, 500, { error: String((e && e.message) || e) })
  }
})

// What goes on the card's stat tiles is the GAME's business. This used to read
// r.tries and r.solved — Keyhole's fields, in the host.
function statsFor(r) {
  if (config.share.stats) return config.share.stats(r) || []
  const out = []
  if (r.metric != null) out.push({ value: String(r.metric), label: config.metric.label, accent: true })
  if (r.seconds != null) out.push({ value: `${r.seconds}s`, label: "time" })
  return out
}

server.listen(PORT, () => console.log(
  `${config.title} on :${PORT} — puzzle #${puzzleNumber(today(), config.epoch)} (${today()}, ${config.timezone})`))

process.on("SIGTERM", async () => { await store.flush(); process.exit(0) })
process.on("SIGINT", async () => { await store.flush(); process.exit(0) })
