// The host. Owns identity, the day, the practice gate, the board, the share,
// and nothing about the game.
//
// The order of the screens is the whole retention argument:
//
//   arrive -> (first ever? practice round) -> today's puzzle -> result -> share
//
// A stranger who taps a link from a group chat has about four seconds of
// patience. There is no sign-in, no splash, no cookie banner and no "are you
// sure". If they have never played, they get one throwaway round FIRST, because
// spending your one daily attempt learning the controls is how a daily game
// loses somebody on day one.

import config from "/relay.config.mjs"
import * as day from "/src/core/day.mjs"
import { normaliseCrew, makeCrewCode, randomSeed } from "/src/core/seed.mjs"
import { shareText, strip, links, decodeResult } from "/src/core/share.mjs"
import game from "/src/game/game.view.mjs"

const R = window.RELAY
const $ = (s) => document.querySelector(s)
// How a score is written on the board is the GAME's business, not the host's.
// This used to be `metric > 6 ? "X" : metric`, which is Keyhole's try counter
// hardcoded into the template.
const fmtMetric = (v) => String(config.metric.format ? config.metric.format(v) : v)
const el = (tag, cls, text) => { const n = document.createElement(tag); if (cls) n.className = cls; if (text != null) n.textContent = text; return n }

// --- identity ---------------------------------------------------------------
// Anonymous by default, forever if they like. A name is asked for exactly once,
// at the moment it buys something (a row on the board), and never before.
const PLAYER_KEY = "relay." + R.key + ".player"
const NAME_KEY = "relay." + R.key + ".name"
const SEEN_KEY = "relay." + R.key + ".practiced"
let playerId = localStorage.getItem(PLAYER_KEY)
if (!playerId) {
  playerId = crypto.randomUUID ? crypto.randomUUID() : Math.random().toString(36).slice(2) + Date.now().toString(36)
  localStorage.setItem(PLAYER_KEY, playerId)
}

async function api(proc, body) {
  const res = await fetch("/api/" + proc, {
    method: "POST", headers: { "content-type": "application/json" },
    body: JSON.stringify(Object.assign({ playerId }, body)),
  })
  if (!res.ok) throw new Error(proc + " " + res.status)
  return res.json()
}

// --- url --------------------------------------------------------------------
const params = new URLSearchParams(location.search)
const archiveMatch = /^\/d\/(\d+)$/.exec(location.pathname)
let crew = R.crews ? normaliseCrew(params.get("c")) : null
const challengeToken = params.get("r")
const challenge = challengeToken ? config.share.fromToken(decodeResult(challengeToken) || {}) : null

let ctx = null            // { day, number, seed, crew, isToday, msUntilNextDay }
let me = null             // { streak, playedToday, practiced, displayName }
let live = null           // mounted game instance
let splash = null         // the game's own title-screen backdrop, if it has one
let lastResult = null

function toast(msg) {
  const t = $("#toast"); t.textContent = msg; t.classList.add("on")
  clearTimeout(toast._t); toast._t = setTimeout(() => t.classList.remove("on"), 2200)
}

function setCrew(code) {
  crew = code || null
  const p = new URLSearchParams(location.search)
  if (crew) p.set("c", crew); else p.delete("c")
  history.replaceState(null, "", location.pathname + (p.toString() ? "?" + p : ""))
  $("#crewbtn").textContent = crew ? "👥" : "🌍"
}

// --- screens ----------------------------------------------------------------

function clearStage() {
  if (live && live.destroy) live.destroy()
  live = null
  if (splash && splash.destroy) splash.destroy()
  splash = null
  clearInterval(screenResult._t)
  $("#stage").replaceChildren()
}

function screenHome() {
  clearStage()
  // A GAME MAY OWN THE BACKDROP OF ITS OWN TITLE SCREEN. Without this the host
  // decides what every game in the collection looks like before anyone has
  // played it — which is the one screen most likely to decide whether it gets
  // played at all. The seed handed over is deliberately NOT today's: a title
  // screen showing today's room would spoil it.
  if (game.splash) splash = game.splash($("#stage"), { seed: (ctx.seed ^ 0x5a17ed) >>> 0, number: ctx.number })
  const wrap = el("div", "screen stack center" + (game.splash ? " on-splash" : ""))

  if (challenge) {
    // Somebody sent this link after playing. Lead with THEIR result — the whole
    // reason the link was tapped — and make the button the answer to it.
    const c = el("div", "stack")
    c.append(el("div", "label", "you were sent this"))
    c.append(el("div", "big", config.share.headline(challenge)))
    c.append(el("div", "muted", config.share.statLine(challenge)))
    wrap.append(c)
  } else {
    wrap.append(el("div", "big", R.title.toUpperCase()))
    wrap.append(el("div", "muted", R.tagline))
  }

  if (crew) wrap.append(el("div", "label", `crew ${crew} — your group's own puzzle`))
  if (!ctx.isToday) wrap.append(el("div", "label", `from the archive — #${ctx.number} does not score`))

  const play = el("button", "btn", challenge ? "Beat it" : (me && me.playedToday && ctx.isToday ? "See today's result" : "Play"))
  play.onclick = () => {
    if (me && me.playedToday && ctx.isToday) return screenBoard()
    if (R.practiceGate && !me?.practiced && !localStorage.getItem(SEEN_KEY)) return startRun("gate")
    startRun("daily")
  }
  wrap.append(play)

  if (R.practice) {
    const p = el("button", "btn ghost", "Practice round")
    p.onclick = () => startRun("practice")
    wrap.append(p)
  }
  if (me && me.streak > 0) wrap.append(el("div", "label", `${me.streak} day streak`))
  $("#stage").append(wrap)
  renderRail()
}

function startRun(mode) {
  clearStage()
  const seed = mode === "daily" ? ctx.seed : mode === "gate" ? ctx.practiceSeed : randomSeed()
  const started = Date.now()
  live = game.mount($("#stage"), {
    seed, mode,
    // The gate round is allowed to talk. The daily never is.
    coach: mode === "gate",
    finish: (state, result) => {
      const seconds = Math.round((Date.now() - started) / 1000)
      // SNAPSHOT THE INPUT LOG HERE, while the game is still mounted. The next
      // screen calls clearStage(), which destroys the instance and nulls `live`
      // — so reading `live.log` from screenResult() always came back empty, and
      // the fallback that covered it (`state.guesses`) was Keyhole's own shape.
      // Every other game silently submitted [], was rejected as a mismatch, and
      // had its player FLAGGED for cheating on an honest run.
      const r = Object.assign({}, result, { seconds, number: ctx.number, mode, log: (live && live.log) || [] })
      lastResult = r
      if (mode === "gate") { localStorage.setItem(SEEN_KEY, "1"); api("player.practiced").catch(() => {}); return screenGateDone(r) }
      screenResult(r, state)
    },
  })
}

function screenGateDone(r) {
  clearStage()
  const wrap = el("div", "screen stack center")
  wrap.append(el("div", "label", "practice round"))
  wrap.append(el("div", "big", "THAT'S THE IDEA"))
  wrap.append(el("div", "muted", "That one didn't count. Today's is a different one, and you get one go at it."))
  const b = el("button", "btn", "Play today's")
  b.onclick = () => startRun("daily")
  wrap.append(b)
  $("#stage").append(wrap)
}

async function screenResult(r, state) {
  clearStage()
  const wrap = el("div", "screen stack center")
  wrap.append(el("div", "label", r.mode === "daily" ? `${R.title} #${ctx.number}` : "practice — not scored"))
  wrap.append(el("div", "big", config.share.headline(r)))
  wrap.append(el("div", "muted", config.share.statLine(r)))
  const s = el("div", "strip", strip(r.events, game.glyphs))
  wrap.append(s)

  const rank = el("div", "label", "")
  wrap.append(rank)

  const share = el("button", "btn", "Share")
  share.onclick = () => doShare(r)
  wrap.append(share)

  // The countdown and the streak lived only in the rail, which is a desktop-
  // only element — so on a phone, where every one of these links is actually
  // opened, the game never told anybody when the next puzzle lands. That is the
  // one line half the dailies in the collection forgot.
  if (ctx.isToday) {
    const next = el("div", "label", "")
    wrap.append(next)
    clearInterval(screenResult._t)
    let ms = ctx.msUntilNextDay
    const tick = () => {
      const s = me && me.streak > 0 ? `${me.streak} day streak · ` : ""
      next.textContent = `${s}next puzzle in ${day.formatCountdown(ms)}`
      ms -= 1000
    }
    tick(); screenResult._t = setInterval(tick, 1000)
  }

  if (R.practice) {
    const p = el("button", "btn ghost", "Practice again")
    p.onclick = () => startRun("practice")
    wrap.append(p)
  }
  $("#stage").append(wrap)

  if (r.mode !== "daily" || !ctx.isToday) return
  try {
    const out = await api("daily.submit", {
      day: ctx.day, crew, log: r.log || [],
      claimed: { metric: r.metric, seconds: r.seconds },
      displayName: localStorage.getItem(NAME_KEY) || undefined,
    })
    if (out.error === "alreadyPlayed") { rank.textContent = "today's run is already in"; return }
    if (out.error) { rank.textContent = "not scored: " + out.error; return }
    rank.textContent = `#${out.rank} of ${out.of}`
    me = await api("player.me")
    if (!localStorage.getItem(NAME_KEY)) askName()
    renderRail()
  } catch {
    rank.textContent = "offline — score kept on this device only"
  }
}

function askName() {
  openSheet((body) => {
    body.append(el("h2", null, "Name for the board"))
    body.append(el("p", "muted", "Optional. Your score already counts without one."))
    const input = el("input")
    input.maxLength = 16; input.placeholder = "3–16 characters"
    input.style.cssText = "width:100%;padding:12px;font:inherit;border-radius:10px;border:var(--rule-w) solid var(--rule);background:var(--panel-2);color:var(--ink)"
    body.append(input)
    const save = el("button", "btn", "Save")
    save.onclick = async () => {
      const n = input.value.trim()
      if (n.length < 3) return toast("3 characters or more")
      const out = await api("player.setName", { displayName: n })
      if (out.error) return toast(out.error)
      localStorage.setItem(NAME_KEY, out.displayName)
      closeSheet(); renderRail()
    }
    body.append(save)
    const skip = el("button", "btn ghost", "Stay anonymous")
    skip.onclick = () => { localStorage.setItem(NAME_KEY, ""); closeSheet() }
    body.append(skip)
  })
}

async function doShare(r) {
  const l = links({ origin: R.origin || location.origin, number: ctx.number, crew, result: config.share.token(r) })
  const text = shareText({
    title: R.title.toUpperCase(), number: ctx.number,
    lines: [config.share.statLine(r) + (crew ? ` · crew ${crew}` : "")],
    strips: [strip(r.events, game.glyphs)],
    url: l.result,
  })
  try {
    if (navigator.share) { await navigator.share({ text }); return }
    await navigator.clipboard.writeText(text)
    toast("Copied — paste it in the chat")
  } catch { /* the user dismissed the sheet */ }
}

async function screenBoard() {
  clearStage()
  const wrap = el("div", "screen stack")
  wrap.append(el("div", "label", crew ? `crew ${crew}` : "today, everyone"))
  const list = el("ol", "board"); wrap.append(list)
  const back = el("button", "btn ghost", "Back"); back.onclick = screenHome; wrap.append(back)
  $("#stage").append(wrap)
  fillBoard(list)
}

async function fillBoard(list) {
  list.replaceChildren(el("li", null, "loading…"))
  try {
    const { top, me: mine } = await api("daily.leaderboard", { day: ctx.day, crew })
    list.replaceChildren()
    if (!top.length) { list.append(el("li", "muted", "Nobody has finished yet today.")); return }
    for (const row of top.slice(0, 20)) {
      const li = el("li", row.playerId === playerId ? "me" : null)
      li.append(el("span", "r", String(row.rank)))
      li.append(el("span", "n", row.displayName || "anon"))
      li.append(el("span", "v", fmtMetric(row.metric)))
      list.append(li)
    }
    if (mine && mine.rank > 20) {
      const li = el("li", "me")
      li.append(el("span", "r", String(mine.rank)))
      li.append(el("span", "n", mine.displayName || "you"))
      li.append(el("span", "v", fmtMetric(mine.metric)))
      list.append(li)
    }
  } catch { list.replaceChildren(el("li", "muted", "Board unavailable.")) }
}

// The rail only exists on wide screens; on a phone the same information lives
// on the result screen. Nothing here is required to play.
function renderRail() {
  const board = $("#rail-board")
  board.replaceChildren(el("div", "label", crew ? `crew ${crew}` : "today"))
  const list = el("ol", "board"); board.append(list); fillBoard(list)

  const next = $("#rail-next")
  next.replaceChildren(el("div", "label", "next puzzle"))
  const clock = el("div"); clock.style.cssText = "font-family:var(--mono);font-size:22px"
  next.append(clock)
  clearInterval(renderRail._t)
  let ms = ctx.msUntilNextDay
  const tick = () => { clock.textContent = day.formatCountdown(ms); ms -= 1000 }
  tick(); renderRail._t = setInterval(tick, 1000)
}

// --- sheets -----------------------------------------------------------------

function openSheet(fill) {
  const sheet = $("#sheet"), body = sheet.querySelector(".sheet-body")
  body.replaceChildren(); fill(body)
  sheet.hidden = false
  sheet.onclick = (e) => { if (e.target === sheet) closeSheet() }
}
function closeSheet() { $("#sheet").hidden = true }

function howSheet() {
  openSheet((body) => {
    body.append(el("h2", null, "How to play"))
    for (const line of game.how) body.append(el("p", "muted", line))
    const b = el("button", "btn", "Got it"); b.onclick = closeSheet; body.append(b)
  })
}

function crewSheet() {
  openSheet((body) => {
    body.append(el("h2", null, crew ? `Crew ${crew}` : "World"))
    body.append(el("p", "muted", crew
      ? "Everyone who opens your link plays this crew's own puzzle — a different one from the world's, and nobody outside the chat has seen it."
      : "You're playing the world's puzzle, the same one as everybody. Start a crew and your group chat gets its own daily instead."))
    if (crew) {
      const copy = el("button", "btn", "Copy crew link")
      copy.onclick = async () => {
        await navigator.clipboard.writeText(links({ origin: R.origin || location.origin, number: ctx.number, crew }).invite)
        toast("Crew link copied")
      }
      body.append(copy)
      const leave = el("button", "btn ghost", "Leave — play World")
      leave.onclick = async () => { setCrew(null); closeSheet(); await boot() }
      body.append(leave)
    } else {
      const start = el("button", "btn", "Start a crew")
      start.onclick = async () => { setCrew(makeCrewCode()); closeSheet(); await boot() }
      body.append(start)
    }
  })
}

// --- boot -------------------------------------------------------------------

async function boot() {
  try {
    ctx = await api("daily.getSeed", { number: archiveMatch ? Number(archiveMatch[1]) : undefined, crew })
  } catch {
    // Fully playable with the API down. The score just does not post.
    const d = day.dayKey(config.timezone)
    ctx = { day: d, number: R.number, seed: (Math.random() * 0xffffffff) >>> 0, isToday: true, msUntilNextDay: 0, practiceSeed: 1 }
    toast("Offline — playing unscored")
  }
  try { me = await api("player.me") } catch { me = { streak: 0, playedToday: false, practiced: !!localStorage.getItem(SEEN_KEY) } }
  $("#num").textContent = "#" + ctx.number
  $("#crewbtn").textContent = crew ? "👥" : "🌍"
  screenHome()
}

$("#how").onclick = howSheet
$("#crewbtn").onclick = crewSheet
document.addEventListener("keydown", (e) => { if (e.key === "Escape") closeSheet() })

boot()
