// The unfurl card, rendered per link.
//
// This is the highest-leverage thing in the template and the thing almost every
// game in this collection got wrong the same way: one static og.png, with the
// production URL hardcoded into the HTML. That card says "a game exists". A card
// that says "Mack got 4/6 in 41 seconds — #37" is a completely different object
// in a group chat: it is a scoreboard nobody has to open, and it is the reason
// the next person taps.
//
// It renders with zero dependencies (see png.mjs / font.mjs) so it works on any
// host, cannot rot, and costs about 15ms.
//
// What every scraper needs, learned by watching these fail:
//   - 1200x630. Twitter/X, Slack, Discord and iMessage all crop differently
//     inside it, so keep everything inside a ~90px margin.
//   - An ABSOLUTE og:image URL. Relative paths are not resolved by scrapers.
//   - og:image:width/height present, or Slack and Discord render a thumbnail.
//   - Real text baked into the pixels, because most clients show the image and
//     truncate the description to one line.
//   - A cache-busting query per distinct result, or the chat client shows the
//     first card it ever saw for your domain to everybody, forever.

import { readFile } from "node:fs/promises"
import { existsSync } from "node:fs"
import { join } from "node:path"
import { readPNG, writePNG } from "./png.mjs"
import { drawText, textWidth } from "./font.mjs"

const W = 1200, H = 630
const MARGIN = 92
const bgCache = new Map()

async function background(path) {
  if (!path) return null
  if (bgCache.has(path)) return bgCache.get(path)
  let img = null
  try { if (existsSync(path)) img = readPNG(await readFile(path)) } catch { img = null }
  bgCache.set(path, img)
  return img
}

const hex = (s) => {
  const h = String(s || "").replace("#", "")
  const n = h.length === 3 ? h.split("").map((c) => c + c).join("") : h
  return [parseInt(n.slice(0, 2), 16) || 0, parseInt(n.slice(2, 4), 16) || 0, parseInt(n.slice(4, 6), 16) || 0, 255]
}

export async function renderCard({ theme, art, title, number, headline, stats = [], footer, crew }) {
  const buf = Buffer.alloc(W * H * 4)
  const ground = hex(theme.ground)
  const ink = hex(theme.ink)
  const accent = hex(theme.accent)
  const dim = hex(theme.inkDim || theme.ink)

  const bg = await background(art)
  for (let y = 0; y < H; y++) {
    for (let x = 0; x < W; x++) {
      const i = (y * W + x) * 4
      let r = ground[0], g = ground[1], b = ground[2]
      if (bg) {
        const s = Math.max(W / bg.w, H / bg.h)
        const sx = Math.min(bg.w - 1, Math.max(0, Math.round((x - (W - bg.w * s) / 2) / s)))
        const sy = Math.min(bg.h - 1, Math.max(0, Math.round((y - (H - bg.h * s) / 2) / s)))
        const j = (sy * bg.w + sx) * 4
        // Scrim hard. The card is a place to read a number, not to admire art;
        // if the type is not obviously legible at thumbnail size it has failed.
        const k = 0.66
        r = bg.rgba[j] * (1 - k) + ground[0] * k
        g = bg.rgba[j + 1] * (1 - k) + ground[1] * k
        b = bg.rgba[j + 2] * (1 - k) + ground[2] * k
      }
      buf[i] = r; buf[i + 1] = g; buf[i + 2] = b; buf[i + 3] = 255
    }
  }

  // A hard rule across the top, in the house style: printed, not glassy.
  for (let y = 0; y < 10; y++) for (let x = 0; x < W; x++) {
    const i = (y * W + x) * 4
    buf[i] = accent[0]; buf[i + 1] = accent[1]; buf[i + 2] = accent[2]
  }

  // The title band shrinks to fit, like the two bands below it. It used to be
  // pinned at scale 10, which is fine for KEYHOLE and drops the day number
  // clean off the right edge for anything longer — and the day number is half
  // the point of the card, because it is what tells a chat which puzzle is
  // being talked about.
  const y = 96
  const t = String(title).toUpperCase()
  const n = number ? "#" + number : ""
  let ts = 10
  while (ts > 4 && textWidth(t + (n ? " " + n : ""), ts) > W - MARGIN * 2) ts -= 1
  drawText(buf, W, H, t, MARGIN, y, ts, ink)
  if (n) drawText(buf, W, H, n, MARGIN + textWidth(t + " ", ts), y, ts, accent)
  if (crew) drawText(buf, W, H, "CREW " + crew, W - MARGIN - textWidth("CREW " + crew, 5), y + 22, 5, dim)

  // Fixed bands rather than flowing layout. The headline is written by the game
  // and can be any length, so it shrinks to fit its band instead of pushing the
  // stats into the footer.
  if (headline) {
    let scale = 21
    while (scale > 7 && textWidth(headline, scale) > W - MARGIN * 2) scale -= 1
    drawText(buf, W, H, headline.toUpperCase(), MARGIN, 206, scale, ink)
  }

  // The stats band shrinks to fit, exactly like the headline above it. It used
  // to be pinned at scale 12, which is fine while every value is a two-digit
  // number and runs straight off the right edge the moment a game's stat is a
  // WORD — a tier name, a theme, a category. A card with its last tile sliced
  // in half reads as broken software in a chat window.
  const tiles = stats.slice(0, 3).map((s) => ({
    v: String(s.value).toUpperCase(), l: String(s.label).toUpperCase(), accent: s.accent,
  }))
  let vs = 12, ls = 5
  const bandWidth = () => tiles.reduce((sum, t) => sum + Math.max(textWidth(t.v, vs), textWidth(t.l, ls)) + 70, 0)
  while (vs > 6 && bandWidth() > W - MARGIN * 2) { vs -= 1; if (vs < 9) ls = 4 }
  let x = MARGIN
  for (const t of tiles) {
    drawText(buf, W, H, t.v, x, 392, vs, t.accent ? accent : ink)
    drawText(buf, W, H, t.l, x + 2, 486, ls, dim)
    x += Math.max(textWidth(t.v, vs), textWidth(t.l, ls)) + 70
  }


  if (footer) {
    // Truncate rather than overflow: a line running off the edge of a card in a
    // chat window reads as broken software.
    let f = footer.toUpperCase()
    while (f.length > 4 && textWidth(f, 5) > W - MARGIN * 2) f = f.slice(0, -1)
    if (f.length < footer.length) f = f.slice(0, -1) + "."
    drawText(buf, W, H, f, MARGIN, H - 62, 5, dim)
  }
  return writePNG(W, H, buf)
}
